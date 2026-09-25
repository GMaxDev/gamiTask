import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import {
  SHOP_ITEMS,
  FURNITURE_ITEMS,
  FURNITURE_SETS,
  PUBLIC_ROOM_IDS,
  PUBLIC_ROOM_NAMES,
  MAX_PUBLIC_ROOM,
  MAX_PRIVATE_ROOM,
  DEFAULT_ROOM_ID,
  type RoomSummary,
  type RoomId,
  type PublicRoomId,
  type Player,
  type Task,
  type ChecklistItem,
  type SharedPomoState,
  type PomodoroPhase,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type Look,
} from "./types.js";
import {
  score,
  rollover,
  levelOf,
  startOfDay,
  cleanKind,
  cleanDifficulty,
  cleanDays,
  cleanChecklist,
  cleanNote,
  coinsDelta,
  ENERGY_MAX,
  cleanFocusMinutes,
  focusEarned,
} from "./scoring.js";
import { sanitizeLook, cleanName, cleanColor } from "./look.js";
import { userIdFromToken, canEdit, type Role } from "./auth.js";
import { sanitizeItem, type CatalogItem } from "./catalog.js";
import { cleanEmail } from "./waitlist.js";
import { parseKey, seal, open, isSealed } from "./secretbox.js";
import { buildAuthorizeUrl, exchangeCodeForToken, refreshUserToken, getTwitchUser } from "./twitch.js";
import { connectChat as connectTwitchChat, disconnectChat as disconnectTwitchChat } from "./twitchChat.js";
import { startTwitchNpcs, stopTwitchNpcs, roomNpcSnapshot, configureTwitchNpcs } from "./twitchNpcs.js";

// Grid bound shared by every room. The 3D café is 24x20; 32 leaves room for bigger layouts.
const MAX_GRID = 32;
// Until accounts ship, guests may own a private room. Set to "false" once auth lands.
const ALLOW_GUEST_PRIVATE_ROOMS = process.env.ALLOW_GUEST_PRIVATE_ROOMS !== "false";
const CORS_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173").split(",");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by"); // one nginx in front: req.ip is the client's, not the proxy's
app.use(cors({ origin: CORS_ORIGINS, credentials: true })); // the same origins as socket.io; credentials for the Twitch-link cookie
app.use(express.json());

// ── Base de données SQLite ───────────────────────────────────────────────────
interface UserRow {
  id: string;
  coins: number;
  streak: number;
  lastPomoAt: number;
  xp: number;
  lastDailyResetAt: number;
  ownedItems: string;
  equippedHat: string | null;
  ownedFurniture: string;
  furniturePositions: string;
  placedFurniture: string;
  email: string | null;
  googleId: string | null;
  displayName: string | null;
  avatarColor: number;
  isAdmin: number;
  role: Role;
  look: string | null;
  twitchId: string | null;
  twitchLogin: string | null;
  twitchDisplayName: string | null;
  twitchAccessToken: string | null;
  twitchRefreshToken: string | null;
  twitchTokenExpiresAt: number;
  energy: number;
  exhaustedUntil: number;
  tzOffset: number;
}
interface TaskRow {
  id: string;
  userId: string;
  text: string;
  note: string;
  kind: string;
  difficulty: string;
  value: number;
  done: number;
  createdAt: number;
  category: string | null;
  up: number;
  down: number;
  countUp: number;
  countDown: number;
  days: number;
  streak: number;
  dueAt: number | null;
  checklist: string;
  completedAt: number | null;
}

const db = new Database(process.env.DB_PATH ?? "./data.db");
// WAL + NORMAL : chaque écriture ne paie plus un fsync (20 ms → 0,15 ms mesurés pour un task:score), sans risque
// de corruption ; seules les dernières transactions peuvent se perdre sur une coupure de courant.
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id    TEXT    PRIMARY KEY,
    coins INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id        TEXT    PRIMARY KEY,
    userId    TEXT    NOT NULL,
    text      TEXT    NOT NULL,
    done      INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS achievements (
    userId TEXT NOT NULL,
    key    TEXT NOT NULL,
    PRIMARY KEY (userId, key)
  );
`);
// Migrations
try {
  db.exec(`ALTER TABLE users ADD COLUMN col INTEGER NOT NULL DEFAULT 6`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN row INTEGER NOT NULL DEFAULT 6`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN streak INTEGER NOT NULL DEFAULT 0`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN lastPomoAt INTEGER NOT NULL DEFAULT 0`);
} catch {}
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN category TEXT`);
} catch {}
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'task'`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0`);
} catch {}
try {
  db.exec(
    `ALTER TABLE users ADD COLUMN degradation INTEGER NOT NULL DEFAULT 0`,
  );
} catch {}
for (const col of [
  "tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'todo'",
  "tasks ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'easy'",
  "tasks ADD COLUMN value REAL NOT NULL DEFAULT 0",
  "tasks ADD COLUMN note TEXT NOT NULL DEFAULT ''",
  "tasks ADD COLUMN up INTEGER NOT NULL DEFAULT 1",
  "tasks ADD COLUMN down INTEGER NOT NULL DEFAULT 0",
  "tasks ADD COLUMN countUp INTEGER NOT NULL DEFAULT 0",
  "tasks ADD COLUMN countDown INTEGER NOT NULL DEFAULT 0",
  "tasks ADD COLUMN days INTEGER NOT NULL DEFAULT 127",
  "tasks ADD COLUMN streak INTEGER NOT NULL DEFAULT 0",
  "tasks ADD COLUMN dueAt INTEGER",
  "tasks ADD COLUMN checklist TEXT NOT NULL DEFAULT '[]'",
  "tasks ADD COLUMN completedAt INTEGER",
  "users ADD COLUMN energy INTEGER NOT NULL DEFAULT 50",
  "users ADD COLUMN exhaustedUntil INTEGER NOT NULL DEFAULT 0",
  "users ADD COLUMN tzOffset INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    db.exec(`ALTER TABLE ${col}`);
  } catch {}
}
// Les anciennes tâches : 'daily' reste daily, tout le reste devient un à-faire.
db.exec(`UPDATE tasks SET kind = 'daily' WHERE type = 'daily' AND kind = 'todo'`);
// Toutes les lectures de tâches filtrent par utilisateur et trient par date : sans index, c'est un scan complet.
db.exec(`CREATE INDEX IF NOT EXISTS tasks_user_created ON tasks(userId, createdAt)`);
db.exec(`UPDATE tasks SET completedAt = createdAt WHERE kind = 'todo' AND done = 1 AND completedAt IS NULL`);
try {
  db.exec(
    `ALTER TABLE users ADD COLUMN lastDailyResetAt INTEGER NOT NULL DEFAULT 0`,
  );
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN ownedItems TEXT NOT NULL DEFAULT ''`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN equippedHat TEXT`);
} catch {}
try {
  db.exec(
    `ALTER TABLE users ADD COLUMN ownedFurniture TEXT NOT NULL DEFAULT ''`,
  );
} catch {}
try {
  db.exec(
    `ALTER TABLE users ADD COLUMN furniturePositions TEXT NOT NULL DEFAULT '{}'`,
  );
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN googleId TEXT`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN displayName TEXT`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN look TEXT`);
} catch {}
try {
  db.exec(
    `ALTER TABLE users ADD COLUMN avatarColor INTEGER NOT NULL DEFAULT 0`,
  );
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN isAdmin INTEGER NOT NULL DEFAULT 0`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
  db.exec(`UPDATE users SET role = 'admin' WHERE isAdmin = 1`);
} catch {}
try {
  db.exec(
    `ALTER TABLE users ADD COLUMN placedFurniture TEXT NOT NULL DEFAULT ''`,
  );
  db.exec(
    `UPDATE users SET placedFurniture = ownedFurniture WHERE placedFurniture = '' AND ownedFurniture != ''`,
  );
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN twitchId TEXT`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN twitchLogin TEXT`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN twitchDisplayName TEXT`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN twitchAccessToken TEXT`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN twitchRefreshToken TEXT`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN twitchTokenExpiresAt INTEGER NOT NULL DEFAULT 0`);
} catch {}
db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_googleId ON users(googleId) WHERE googleId IS NOT NULL`,
);
db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_twitchId ON users(twitchId) WHERE twitchId IS NOT NULL`,
);
db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`,
);

// Guilds and their boss are gone; existing databases drop the tables.
db.exec(`
  DROP TABLE IF EXISTS guilds;
  DROP TABLE IF EXISTS guild_members;
`);

// ── Table Items (editor-made catalogue) ─────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updatedAt INTEGER NOT NULL
  )
`);

// ── Table Waitlist (landing page, Pro plan) ──────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS waitlist (
    email TEXT PRIMARY KEY,
    createdAt INTEGER NOT NULL
  )
`);
const sqlWaitlist = db.prepare("INSERT OR IGNORE INTO waitlist (email, createdAt) VALUES (?, ?)");

// ── Table Private Rooms ─────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS private_rooms (
    id        TEXT    PRIMARY KEY,
    name      TEXT    NOT NULL,
    ownerId   TEXT    NOT NULL UNIQUE,
    createdAt INTEGER NOT NULL
  );
`);

// ── Table Bannissements de room privée ──────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS room_bans (
    roomId    TEXT    NOT NULL,
    userId    TEXT    NOT NULL,
    expiresAt INTEGER,
    bannedAt  INTEGER NOT NULL,
    PRIMARY KEY (roomId, userId)
  );
`);

const sql = {
  upsertUser: db.prepare(
    "INSERT OR IGNORE INTO users (id, coins) VALUES (?, 0)",
  ),
  getUser: db.prepare(
    "SELECT id, coins, streak, lastPomoAt, xp, lastDailyResetAt, ownedItems, equippedHat, ownedFurniture, furniturePositions, placedFurniture, displayName, avatarColor, isAdmin, role, look, email, googleId, twitchId, twitchLogin, twitchDisplayName, energy, exhaustedUntil, tzOffset FROM users WHERE id = ?",
  ),
  setLook: db.prepare("UPDATE users SET look = ? WHERE id = ?"),
  getStreak: db.prepare("SELECT streak, lastPomoAt FROM users WHERE id = ?"),
  saveStreak: db.prepare(
    "UPDATE users SET streak = ?, lastPomoAt = ? WHERE id = ?",
  ),
  getCoins: db.prepare("SELECT coins FROM users WHERE id = ?"),
  addCoins: db.prepare("UPDATE users SET coins = coins + ? WHERE id = ?"),
  setCoins: db.prepare("UPDATE users SET coins = ? WHERE id = ?"),
  getTasks: db.prepare(
    "SELECT * FROM tasks WHERE userId = ? ORDER BY createdAt ASC",
  ),
  insertTask: db.prepare(
    "INSERT INTO tasks (id, userId, text, note, kind, difficulty, value, done, createdAt, category, up, down, countUp, countDown, days, streak, dueAt, checklist, completedAt) VALUES (@id, @userId, @text, @note, @kind, @difficulty, @value, @done, @createdAt, @category, @up, @down, @countUp, @countDown, @days, @streak, @dueAt, @checklist, @completedAt)",
  ),
  getTaskRow: db.prepare("SELECT * FROM tasks WHERE id = ? AND userId = ?"),
  updateTask: db.prepare(
    "UPDATE tasks SET text = @text, note = @note, difficulty = @difficulty, value = @value, done = @done, category = @category, up = @up, down = @down, countUp = @countUp, countDown = @countDown, days = @days, streak = @streak, dueAt = @dueAt, checklist = @checklist, completedAt = @completedAt WHERE id = @id AND userId = @userId",
  ),
  getEnergy: db.prepare("SELECT energy, exhaustedUntil FROM users WHERE id = ?"),
  setEnergy: db.prepare("UPDATE users SET energy = ?, exhaustedUntil = ? WHERE id = ?"),
  deleteTask: db.prepare("DELETE FROM tasks WHERE id = ? AND userId = ?"),
  getXp: db.prepare("SELECT xp FROM users WHERE id = ?"),
  addXp: db.prepare("UPDATE users SET xp = xp + ? WHERE id = ?"),
  countDoneTasks: db.prepare(
    "SELECT COUNT(*) as cnt FROM tasks WHERE userId = ? AND done = 1 AND kind != 'habit'",
  ),
  setOwnedItems: db.prepare("UPDATE users SET ownedItems = ? WHERE id = ?"),
  setEquippedHat: db.prepare("UPDATE users SET equippedHat = ? WHERE id = ?"),
  setOwnedFurniture: db.prepare(
    "UPDATE users SET ownedFurniture = ? WHERE id = ?",
  ),
  setFurniturePositions: db.prepare(
    "UPDATE users SET furniturePositions = ? WHERE id = ?",
  ),
  setPlacedFurniture: db.prepare(
    "UPDATE users SET placedFurniture = ? WHERE id = ?",
  ),
  getFurniture: db.prepare(
    "SELECT ownedFurniture, placedFurniture FROM users WHERE id = ?",
  ),
  setAvatarInfo: db.prepare(
    "UPDATE users SET displayName = ?, avatarColor = ? WHERE id = ?",
  ),
  getUserByGoogleId: db.prepare("SELECT * FROM users WHERE googleId = ?"),
  insertGoogleUser: db.prepare(
    "INSERT INTO users (id, coins, email, googleId, displayName, avatarColor, isAdmin) VALUES (?, 0, ?, ?, ?, 0, ?)",
  ),
  updateGoogleAuth: db.prepare(
    "UPDATE users SET email = ?, displayName = COALESCE(NULLIF(displayName, ''), ?) WHERE id = ?",
  ),
  setAdminFlag: db.prepare("UPDATE users SET isAdmin = 1, role = 'admin' WHERE id = ?"),
  listItems: db.prepare("SELECT data FROM items ORDER BY updatedAt"),
  getItem: db.prepare("SELECT data FROM items WHERE id = ?"),
  upsertItem: db.prepare("INSERT INTO items (id, data, updatedAt) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt"),
  deleteItem: db.prepare("DELETE FROM items WHERE id = ?"),
  getUserByTwitchId: db.prepare("SELECT * FROM users WHERE twitchId = ?"),
  linkTwitch: db.prepare(
    "UPDATE users SET twitchId = ?, twitchLogin = ?, twitchDisplayName = ?, twitchAccessToken = ?, twitchRefreshToken = ?, twitchTokenExpiresAt = ? WHERE id = ?",
  ),
  unlinkTwitch: db.prepare(
    "UPDATE users SET twitchId = NULL, twitchLogin = NULL, twitchDisplayName = NULL, twitchAccessToken = NULL, twitchRefreshToken = NULL, twitchTokenExpiresAt = 0 WHERE id = ?",
  ),
  getTwitchTokens: db.prepare(
    "SELECT twitchId, twitchAccessToken, twitchRefreshToken, twitchTokenExpiresAt FROM users WHERE id = ?",
  ),
  saveTwitchTokens: db.prepare(
    "UPDATE users SET twitchAccessToken = ?, twitchRefreshToken = ?, twitchTokenExpiresAt = ? WHERE id = ?",
  ),
  clearTwitchTokens: db.prepare(
    "UPDATE users SET twitchAccessToken = NULL, twitchRefreshToken = NULL, twitchTokenExpiresAt = 0 WHERE id = ?",
  ),
  saveDailyReset: db.prepare("UPDATE users SET lastDailyResetAt = ?, tzOffset = ? WHERE id = ?"),
  checkAchievement: db.prepare(
    "SELECT 1 FROM achievements WHERE userId = ? AND key = ?",
  ),
  insertAchievement: db.prepare(
    "INSERT OR IGNORE INTO achievements (userId, key) VALUES (?, ?)",
  ),
  getUserAchievements: db.prepare(
    "SELECT key FROM achievements WHERE userId = ?",
  ),
  // Private rooms
  getAllPrivateRooms: db.prepare("SELECT * FROM private_rooms"),
  getPrivateRoomByOwner: db.prepare(
    "SELECT * FROM private_rooms WHERE ownerId = ?",
  ),
  insertPrivateRoom: db.prepare(
    "INSERT INTO private_rooms (id, name, ownerId, createdAt) VALUES (?, ?, ?, ?)",
  ),
  banFromRoom: db.prepare(
    "INSERT INTO room_bans (roomId, userId, expiresAt, bannedAt) VALUES (?, ?, ?, ?) ON CONFLICT(roomId, userId) DO UPDATE SET expiresAt = excluded.expiresAt, bannedAt = excluded.bannedAt",
  ),
  getRoomBan: db.prepare(
    "SELECT expiresAt FROM room_bans WHERE roomId = ? AND userId = ?",
  ),
  unbanFromRoom: db.prepare("DELETE FROM room_bans WHERE roomId = ? AND userId = ?"),
};

function rowToTask(r: TaskRow): Task {
  let checklist: ChecklistItem[] = [];
  try {
    checklist = cleanChecklist(JSON.parse(r.checklist || "[]"));
  } catch {}
  return {
    id: r.id,
    userId: r.userId,
    text: r.text,
    note: r.note ?? "",
    kind: cleanKind(r.kind),
    difficulty: cleanDifficulty(r.difficulty),
    value: r.value ?? 0,
    category: r.category ?? null,
    createdAt: r.createdAt,
    done: !!r.done,
    up: !!r.up,
    down: !!r.down,
    countUp: r.countUp ?? 0,
    countDown: r.countDown ?? 0,
    days: r.days ?? 127,
    streak: r.streak ?? 0,
    dueAt: r.dueAt ?? null,
    checklist,
    completedAt: r.completedAt ?? null,
  };
}
function taskToRow(t: Task): TaskRow {
  return {
    ...t,
    done: t.done ? 1 : 0,
    up: t.up ? 1 : 0,
    down: t.down ? 1 : 0,
    checklist: JSON.stringify(t.checklist),
  };
}
function userTasks(userId: string): Task[] {
  return (sql.getTasks.all(userId) as TaskRow[]).map(rowToTask);
}
/** Ce que les autres voient sur les ardoises : à-faire ouverts, quotidiennes pas encore cochées, toutes les habitudes. */
const isPending = (t: Task): boolean => t.kind === "habit" || !t.done;

interface PrivateRoomRow {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}

// Editor-made items live in `items`; the built-in lists stay the code's. One lookup serves the shop, the room and the hats.
const catalogItems = (): CatalogItem[] => (sql.listItems.all() as { data: string }[]).map((r) => JSON.parse(r.data) as CatalogItem);
const catalogItem = (id: string): CatalogItem | null => { const r = sql.getItem.get(id) as { data: string } | undefined; return r ? (JSON.parse(r.data) as CatalogItem) : null; };
const hatItem = (id: string) => SHOP_ITEMS.find((i) => i.id === id) ?? (catalogItem(id)?.kind === "hat" ? catalogItem(id) : null);
const furnitureItem = (id: string) => FURNITURE_ITEMS.find((i) => i.id === id) ?? (catalogItem(id)?.kind === "furniture" ? catalogItem(id) : null);

/** Construit le payload positions pour furniture:state (defaults FURNITURE_ITEMS + overrides DB) */
function getFurniturePosPayload(
  furniturePosJson: string,
): Record<string, { col: number; row: number }> {
  const saved = JSON.parse(furniturePosJson || "{}") as Record<
    string,
    { col: number; row: number }
  >;
  const out: Record<string, { col: number; row: number }> = {};
  for (const item of FURNITURE_ITEMS) {
    out[item.id] = saved[item.id] ?? { col: item.col, row: item.row };
  }
  for (const id of Object.keys(saved)) out[id] ??= saved[id];// editor-made pieces have no default spot
  return out;
}

/** Retourne les meubles effectivement placés dans la chambre (avec fallback pour migration) */
function getEffectivePlaced(
  placedFurniture: string,
  ownedFurniture: string,
): string[] {
  const placed = (placedFurniture ?? "").split(",").filter(Boolean);
  if (placed.length === 0 && (ownedFurniture ?? "").length > 0) {
    return (ownedFurniture ?? "").split(",").filter(Boolean);
  }
  return placed;
}

// ── HTTP Auth endpoints ───────────────────────────────────────────────────
// No fallback: a guessable secret signs admin sessions. The server refuses to start rather than run with one.
const JWT_SECRET = process.env.JWT_SECRET ?? "";
if (JWT_SECRET.length < 32) {
  console.error("[config] JWT_SECRET must be set and at least 32 characters long (see README, .env.prod.example)");
  process.exit(1);
}
const JWT_ALGS: jwt.Algorithm[] = ["HS256"]; // pin the algorithm on verify: a token may not pick its own
// Twitch tokens rest encrypted under TOKEN_KEY (32 bytes, hex or base64). Same rule as the JWT secret: no key, no start.
const TOKEN_KEY: Buffer = parseKey(process.env.TOKEN_KEY) ?? ((): never => {
  console.error("[config] TOKEN_KEY must be 32 bytes in hex or base64 (see README, .env.prod.example)");
  return process.exit(1);
})();
// Rows written before the key existed: seal them once, now.
{
  const legacy = db.prepare("SELECT id, twitchAccessToken, twitchRefreshToken FROM users WHERE twitchRefreshToken IS NOT NULL").all() as { id: string; twitchAccessToken: string | null; twitchRefreshToken: string }[];
  const sealRow = db.prepare("UPDATE users SET twitchAccessToken = ?, twitchRefreshToken = ? WHERE id = ?");
  let n = 0;
  for (const r of legacy) if (!isSealed(r.twitchRefreshToken)) { sealRow.run(r.twitchAccessToken && seal(r.twitchAccessToken, TOKEN_KEY), seal(r.twitchRefreshToken, TOKEN_KEY), r.id); n++; }
  if (n) console.log(`[config] sealed ${n} Twitch token row(s) that were stored in clear`);
}
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const googleOAuthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.post("/auth/google", async (req, res): Promise<void> => {
  const { credential } = req.body as { credential?: string };
  if (!credential) {
    res.status(400).json({ error: "Missing credential" });
    return;
  }
  if (!GOOGLE_CLIENT_ID) {
    res
      .status(500)
      .json({ error: "Server misconfigured: GOOGLE_CLIENT_ID not set" });
    return;
  }
  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload()!;
    const googleId = payload.sub;
    const email = payload.email ?? null;
    const googleName = payload.name ?? email ?? "User";
    const isAdminLogin = !!ADMIN_EMAIL && email === ADMIN_EMAIL && payload.email_verified === true;
    let user = sql.getUserByGoogleId.get(googleId) as UserRow | undefined;
    let userId: string;
    if (!user) {
      userId = randomUUID();
      sql.insertGoogleUser.run(
        userId,
        email,
        googleId,
        googleName,
        isAdminLogin ? 1 : 0,
      );
      if (isAdminLogin) sql.setAdminFlag.run(userId);
      user = sql.getUserByGoogleId.get(googleId) as UserRow;
    } else {
      userId = user.id;
      sql.updateGoogleAuth.run(email, googleName, userId);
      if (isAdminLogin && user.role !== "admin") sql.setAdminFlag.run(userId);
      user = sql.getUserByGoogleId.get(googleId) as UserRow;
    }
    const token = jwt.sign({ userId, googleId }, JWT_SECRET, {
      expiresIn: "30d",
    });
    res.json({
      userId,
      token,
      name: user.displayName ?? googleName,
      color: user.avatarColor ?? 0,
      isAdmin: user.role === "admin",
      role: user.role,
      isGoogleUser: true,
      twitchLogin: user.twitchLogin,
      twitchDisplayName: user.twitchDisplayName,
    });
  } catch (err) {
    console.error("[auth/google]", err);
    res.status(401).json({ error: "Invalid Google credential" });
  }
});

// ponytail: per-IP throttle in memory, a real limiter if the landing ever draws a crowd
const waitlistHits = new Map<string, number[]>();
app.post("/api/waitlist", (req, res): void => {
  const ip = req.ip ?? "?", now = Date.now(), hits = (waitlistHits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= 5) { res.status(429).json({ error: "Doucement." }); return; }
  hits.push(now); waitlistHits.set(ip, hits);
  const email = cleanEmail((req.body as { email?: unknown })?.email);
  if (!email) { res.status(400).json({ error: "Adresse invalide." }); return; }
  sqlWaitlist.run(email, now);
  res.json({ ok: true });
});

app.get("/api/rooms", (_req, res): void => {
  res.json({ rooms: buildRoomSummaries() });
});

app.post("/auth/token", (req, res): void => {
  const { token } = req.body as { token?: string };
  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGS }) as { userId: string };
    const user = sql.getUser.get(decoded.userId) as UserRow | undefined;
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      userId: user.id,
      token,
      name: user.displayName ?? "",
      color: user.avatarColor ?? 0,
      isAdmin: user.role === "admin",
      role: user.role,
      isGoogleUser: !!user.googleId,
      twitchLogin: user.twitchLogin,
      twitchDisplayName: user.twitchDisplayName,
    });
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
});

// ── Twitch account linking ──────────────────────────────────────────────
const TWITCH_REDIRECT_URI = process.env.TWITCH_REDIRECT_URI ?? "http://localhost:3001/auth/twitch/callback";
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
if (!process.env.APP_URL) console.warn("[twitch] APP_URL is not set: OAuth returns will point at", APP_URL);

function requireAuth(req: express.Request, res: express.Response): string | null {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return null;
  }
  try {
    return (jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGS }) as { userId: string }).userId;
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
    return null;
  }
}

app.get("/auth/twitch/start", (req, res): void => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    res.status(500).json({ error: "Server misconfigured: TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET not set" });
    return;
  }
  // The state names who asked; the cookie proves the browser finishing the flow is the one that asked.
  // Without it, a link generated by an attacker and clicked by a streamer would bind the streamer's Twitch to the attacker's account.
  const nonce = randomUUID();
  const state = jwt.sign({ userId, purpose: "twitch-link", nonce }, JWT_SECRET, { expiresIn: "10m" });
  const secure = TWITCH_REDIRECT_URI.startsWith("https://") ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${TWITCH_LINK_COOKIE}=${nonce}; Max-Age=600; Path=/auth/twitch; HttpOnly; SameSite=Lax${secure}`);
  res.json({ url: buildAuthorizeUrl(TWITCH_REDIRECT_URI, state) });
});
const TWITCH_LINK_COOKIE = "twitch_link";
const cookieValue = (header: string | undefined, name: string): string | null =>
  header?.split(";").map((c) => c.trim().split("=")).find(([k]) => k === name)?.[1] ?? null;

app.get("/auth/twitch/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  if (error || !code || !state) {
    res.redirect(`${APP_URL}/app/?twitch=denied`);
    return;
  }
  let userId: string;
  try {
    const decoded = jwt.verify(state, JWT_SECRET, { algorithms: JWT_ALGS }) as { userId: string; purpose: string; nonce?: string };
    if (decoded.purpose !== "twitch-link") throw new Error("wrong purpose");
    if (!decoded.nonce || decoded.nonce !== cookieValue(req.headers.cookie, TWITCH_LINK_COOKIE)) throw new Error("state not from this browser");
    userId = decoded.userId;
  } catch {
    res.redirect(`${APP_URL}/app/?twitch=expired`);
    return;
  }
  res.setHeader("Set-Cookie", `${TWITCH_LINK_COOKIE}=; Max-Age=0; Path=/auth/twitch; HttpOnly; SameSite=Lax`);
  try {
    const tokens = await exchangeCodeForToken(code, TWITCH_REDIRECT_URI);
    const twitchUser = await getTwitchUser(tokens.accessToken);
    const existing = sql.getUserByTwitchId.get(twitchUser.id) as UserRow | undefined;
    if (existing && existing.id !== userId) {
      res.redirect(`${APP_URL}/app/?twitch=taken`);
      return;
    }
    sql.linkTwitch.run(
      twitchUser.id, twitchUser.login, twitchUser.display_name,
      seal(tokens.accessToken, TOKEN_KEY), seal(tokens.refreshToken, TOKEN_KEY), tokens.expiresAt, userId,
    );
    res.redirect(`${APP_URL}/app/?twitch=linked`);
  } catch (err) {
    console.error("[auth/twitch/callback]", err);
    res.redirect(`${APP_URL}/app/?twitch=error`);
  }
});

app.post("/auth/twitch/unlink", (req, res): void => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  sql.unlinkTwitch.run(userId);
  disconnectTwitchChat(userId);
  stopTwitchNpcs(io, userId);
  res.json({ ok: true });
});

/** A valid (refreshing if needed) Twitch user access token for this gamiTask user, or null if not linked / revoked. */
async function getValidTwitchAccessToken(userId: string): Promise<string | null> {
  const row = sql.getTwitchTokens.get(userId) as
    | { twitchId: string | null; twitchAccessToken: string | null; twitchRefreshToken: string | null; twitchTokenExpiresAt: number }
    | undefined;
  if (!row?.twitchId || !row.twitchRefreshToken) return null;
  const accessToken = open(row.twitchAccessToken, TOKEN_KEY);
  if (accessToken && Date.now() < row.twitchTokenExpiresAt - 60_000) return accessToken;
  try {
    const tokens = await refreshUserToken(open(row.twitchRefreshToken, TOKEN_KEY)!);
    sql.saveTwitchTokens.run(seal(tokens.accessToken, TOKEN_KEY), seal(tokens.refreshToken, TOKEN_KEY), tokens.expiresAt, userId);
    return tokens.accessToken;
  } catch {
    sql.clearTwitchTokens.run(userId);
    return null;
  }
}

/**
 * Applique une variation d'énergie. À 0 : épuisement — jauge remise à 50, −30 % des pièces,
 * personnage « épuisé » jusqu'au prochain minuit. Renvoie l'énergie finale.
 */
function applyEnergy(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  userId: string,
  delta: number,
): number {
  const row = sql.getEnergy.get(userId) as { energy: number; exhaustedUntil: number };
  let energy = Math.min(ENERGY_MAX, (row?.energy ?? ENERGY_MAX) + delta);
  let exhaustedUntil = row?.exhaustedUntil ?? 0;
  if (energy <= 0) {
    energy = ENERGY_MAX;
    const user = sql.getUser.get(userId) as UserRow;
    const coins = Math.floor(user.coins * 0.7);
    sql.setCoins.run(coins, userId);
    exhaustedUntil = startOfDay(Date.now(), user.tzOffset ?? 0) + 86_400_000;
    socket.emit("energy:exhausted", { coins });
    socket.emit("coins:update", { coins });
    const p = getPlayer(socket.id);
    if (p) p.coins = coins;
  }
  sql.setEnergy.run(energy, exhaustedUntil, userId);
  return energy;
}

/** Cron : rejoue les jours manqués depuis la dernière connexion. Appelé au join. */
function runRollover(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  userId: string,
  tzOffsetMinutes: number | undefined,
): void {
  const user = sql.getUser.get(userId) as UserRow;
  // The timezone is taken from the client once, on the first day ever processed, then frozen: a reconnect that
  // claims a 28-hour swing would otherwise pull a fresh day out of thin air and let every daily be re-checked.
  // ponytail: a traveller keeps their home midnight; a per-24h change allowance if that ever matters.
  const claimedTz =
    typeof tzOffsetMinutes === "number" && Number.isFinite(tzOffsetMinutes)
      ? Math.max(-840, Math.min(840, Math.round(tzOffsetMinutes)))
      : 0;
  const tz = (user.lastDailyResetAt ?? 0) > 0 ? (user.tzOffset ?? 0) : claimedTz;
  const now = Date.now();
  // Même journée locale déjà traitée : rien à faire (un rollover > 30 jours renvoie aussi days = 0 mais doit écrire ses remises à zéro, d'où le test sur les minuits et pas sur r.days).
  if ((user.lastDailyResetAt ?? 0) > 0 && startOfDay(user.lastDailyResetAt, tz) === startOfDay(now, tz)) { sql.saveDailyReset.run(startOfDay(now, tz), tz, userId); return; }
  const r = rollover(userTasks(userId), user.lastDailyResetAt ?? 0, now, tz, levelOf(user.xp ?? 0));
  sql.saveDailyReset.run(startOfDay(now, tz), tz, userId);
  const write = db.transaction((tasks: Task[]) => { for (const t of tasks) sql.updateTask.run(taskToRow(t)); });
  write(r.tasks);
  const energy = r.energyDelta ? applyEnergy(socket, userId, r.energyDelta) : (user.energy ?? ENERGY_MAX);
  socket.emit("day:rollover", { missed: r.missed, energy, energyDelta: r.energyDelta });
  const freshUser = sql.getUser.get(userId) as UserRow;
  socket.emit("tasks:state", {
    tasks: r.tasks,
    coins: freshUser.coins,
    energy,
    exhausted: (freshUser.exhaustedUntil ?? 0) > Date.now(),
  });
}

/** Émet un xp:update à un socket après avoir mis à jour les XP du joueur */
function getSetBonuses(owned: string[]): {
  xpPomo: number;
  coinsPomo: number;
  coinsTask: number;
} {
  const b = { xpPomo: 0, coinsPomo: 0, coinsTask: 0 };
  for (const set of FURNITURE_SETS) {
    if (set.items.every((id) => owned.includes(id))) {
      b.xpPomo += set.xpPomoBonus ?? 0;
      b.coinsPomo += set.coinsPomoBonus ?? 0;
      b.coinsTask += set.coinsTaskBonus ?? 0;
    }
  }
  return b;
}

function emitXpUpdate(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  userId: string,
  xpGained: number,
): void {
  sql.addXp.run(xpGained, userId);
  const { xp } = sql.getXp.get(userId) as { xp: number };
  const level = levelOf(xp);
  const xpForNextLevel = 50 * (level + 1) * (level + 1);
  const xpToNext = xpForNextLevel - xp;
  const prevLevel = levelOf(xp - xpGained);
  const levelUp = level > prevLevel;
  socket.emit("xp:update", { xp, level, xpToNext, levelUp });
  if (levelUp) {
    sql.setEnergy.run(ENERGY_MAX, 0, userId);
    socket.emit("energy:update", { energy: ENERGY_MAX });
    const p = getPlayer(socket.id);
    broadcastToOwnRoom(socket, "level-up:public", {
      socketId: socket.id,
      name: p?.name ?? "?",
      color: p?.color ?? 0xffffff,
      level,
    });
  }
}

function sanitize(text: string): string {
  return text
    .replace(
      /[<>&"']/g,
      (c) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          '"': "&quot;",
          "'": "&#39;",
        })[c] ?? c,
    )
    .slice(0, 200);
}

const VALID_CATEGORIES = new Set(["work", "perso", "urgent", "study"]);

// ── Rate limiting par socket ─────────────────────────────────────────────────
// Compteur glissant : { timestamps des appels récents }
const rateLimits = new Map<string, Map<string, number[]>>();
// Solo focuses the server saw start, by userId. ponytail: in memory — a server restart forgets a running
// focus and its reward is refused once; move to a users column if that ever bites.
const focusStarts = new Map<string, { at: number; minutes: number }>();

function allow(
  socketId: string,
  event: string,
  maxCalls: number,
  windowMs: number,
): boolean {
  if (!rateLimits.has(socketId)) rateLimits.set(socketId, new Map());
  const byEvent = rateLimits.get(socketId)!;
  const now = Date.now();
  const times = (byEvent.get(event) ?? []).filter((t) => now - t < windowMs);
  if (times.length >= maxCalls) return false;
  times.push(now);
  byEvent.set(event, times);
  return true;
}

function cleanRateLimit(socketId: string): void {
  rateLimits.delete(socketId);
}

// ── Achievements ─────────────────────────────────────────────────────────────
const ACHIEVEMENTS: Array<{
  key: string;
  label: string;
  desc: string;
  icon: string;
}> = [
  {
    key: "first-task",
    label: "1ère tâche !",
    desc: "Première tâche complétée",
    icon: "✅",
  },
  {
    key: "task-10",
    label: "10 tâches !",
    desc: "10 tâches complétées",
    icon: "🔟",
  },
  {
    key: "task-50",
    label: "50 tâches !",
    desc: "50 tâches complétées",
    icon: "🏆",
  },
  {
    key: "first-pomo",
    label: "1er Pomodoro !",
    desc: "Premier pomodoro terminé",
    icon: "🍅",
  },
  {
    key: "streak-5",
    label: "Streak ×5 !",
    desc: "5 pomodoros consécutifs",
    icon: "🔥",
  },
  {
    key: "coins-100",
    label: "100 pièces !",
    desc: "100 pièces accumulées",
    icon: "💰",
  },
  {
    key: "coins-500",
    label: "500 pièces !",
    desc: "500 pièces accumulées",
    icon: "👑",
  },
  {
    key: "first-collective",
    label: "Pomo collectif !",
    desc: "Premier pomo collectif terminé",
    icon: "🌐",
  },
];

function tryUnlock(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  userId: string,
  key: string,
): void {
  const already = sql.checkAchievement.get(userId, key);
  if (already) return;
  const def = ACHIEVEMENTS.find((a) => a.key === key);
  if (!def) return;
  sql.insertAchievement.run(userId, key);
  socket.emit("achievement:unlocked", {
    key: def.key,
    label: def.label,
    desc: def.desc,
    icon: def.icon,
  });
  broadcastToOwnRoom(socket,"achievement:public", {
    socketId: socket.id,
    label: def.label,
    icon: def.icon,
  });
}

// ── Pomodoro collectif ───────────────────────────────────────────────────────
const DURATIONS: Record<PomodoroPhase, number> = {
  focus: 25 * 60,
  "short-break": 5 * 60,
  "long-break": 15 * 60,
};

// ── État par-room ────────────────────────────────────────────────────────────
interface RoomState {
  id: RoomId;
  name: string;
  capacity: number;
  isPrivate: boolean;
  ownerId: string | null;
  players: Map<string, Player>;
  sharedPomo: SharedPomoState & {
    intervalId: ReturnType<typeof setInterval> | null;
  };
  pomoParticipants: Set<string>;
}

function createPublicRoomState(id: PublicRoomId): RoomState {
  return {
    id,
    name: PUBLIC_ROOM_NAMES[id],
    capacity: MAX_PUBLIC_ROOM,
    isPrivate: false,
    ownerId: null,
    players: new Map(),
    sharedPomo: {
      phase: "focus",
      remaining: DURATIONS["focus"],
      running: false,
      participants: 0,
      session: 0,
      names: [],
      intervalId: null,
    },
    pomoParticipants: new Set(),
  };
}

function createPrivateRoomState(
  id: RoomId,
  name: string,
  ownerId: string,
): RoomState {
  return {
    id,
    name,
    capacity: MAX_PRIVATE_ROOM,
    isPrivate: true,
    ownerId,
    players: new Map(),
    sharedPomo: {
      phase: "focus",
      remaining: DURATIONS["focus"],
      running: false,
      participants: 0,
      session: 0,
      names: [],
      intervalId: null,
    },
    pomoParticipants: new Set(),
  };
}

const rooms: Map<RoomId, RoomState> = new Map();
for (const id of PUBLIC_ROOM_IDS) rooms.set(id, createPublicRoomState(id));

// Load private rooms from DB at boot
for (const row of sql.getAllPrivateRooms.all() as PrivateRoomRow[]) {
  rooms.set(row.id, createPrivateRoomState(row.id, row.name, row.ownerId));
}

// Mapping socket → room pour les lookups rapides
const socketToRoom = new Map<string, RoomId>();
// Mapping socket → userId (global, un utilisateur n'a qu'une session quel que soit la room)
const socketToUserId = new Map<string, string>();

function getRoom(socketId: string): RoomState | undefined {
  const rid = socketToRoom.get(socketId);
  return rid ? rooms.get(rid) : undefined;
}

function getPlayer(socketId: string): Player | undefined {
  return getRoom(socketId)?.players.get(socketId);
}

/** Whether a user is currently excluded from a private room (a kick, temporary or permanent). */
function roomBanUntil(roomId: RoomId, userId: string): number | null | undefined {
  const row = sql.getRoomBan.get(roomId, userId) as { expiresAt: number | null } | undefined;
  if (!row) return undefined; // not banned
  if (row.expiresAt !== null && row.expiresAt <= Date.now()) return undefined; // ban expired
  return row.expiresAt; // null = permanent, otherwise the timestamp it lifts
}

function userLook(user: UserRow): Look {
  let raw: unknown = null;
  try {
    raw = JSON.parse(user.look ?? "null");
  } catch {}
  return sanitizeLook(raw, user.equippedHat ?? null, user.avatarColor);
}

function pomoTick(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: RoomState,
): void {
  const sp = room.sharedPomo;
  if (sp.remaining <= 1) {
    let nextPhase: PomodoroPhase;
    let nextSession = sp.session;
    if (sp.phase === "focus") {
      nextSession += 1;
      nextPhase = nextSession % 4 === 0 ? "long-break" : "short-break";
      for (const sid of room.pomoParticipants) {
        const userId = socketToUserId.get(sid);
        if (userId) {
          sql.upsertUser.run(userId);
          sql.addCoins.run(25, userId);
          const coins = (sql.getCoins.get(userId) as UserRow).coins;
          io.to(sid).emit("coins:update", { coins });
          const cp = room.players.get(sid);
          if (cp) cp.coins = coins;
          const sock = io.sockets.sockets.get(sid) as
            | Socket<ClientToServerEvents, ServerToClientEvents>
            | undefined;
          if (sock) {
            tryUnlock(io, sock, userId, "first-collective");
            if (coins >= 100) tryUnlock(io, sock, userId, "coins-100");
            if (coins >= 500) tryUnlock(io, sock, userId, "coins-500");
            emitXpUpdate(sock, userId, 75);
          }
        }
      }
      broadcastLeaderboard(io, room);
    } else {
      nextPhase = "focus";
    }
    sp.phase = nextPhase;
    sp.remaining = DURATIONS[nextPhase];
    sp.session = nextSession;
    sp.running = false;
    if (sp.intervalId) {
      clearInterval(sp.intervalId);
      sp.intervalId = null;
    }
    for (const sid of room.pomoParticipants) {
      io.to(sid).emit("pomo:phase", {
        phase: nextPhase,
        remaining: sp.remaining,
        session: nextSession,
        names: participantNames(room),
      });
    }
    startPomoIfNeeded(io, room);
    broadcastPomoState(io, room);
  } else {
    sp.remaining -= 1;
    for (const sid of room.pomoParticipants) {
      io.to(sid).emit("pomo:tick", {
        remaining: sp.remaining,
        phase: sp.phase,
        session: sp.session,
      });
    }
    // Tick léger pour les occupants qui ne participent pas (l'onglet "Avec la salle")
    if (sp.remaining % 10 === 0) {
      for (const sid of room.players.keys()) {
        if (room.pomoParticipants.has(sid)) continue;
        io.to(sid).emit("pomo:state", pomoState(room));
      }
    }
  }
}

function participantNames(room: RoomState): string[] {
  return [...room.pomoParticipants]
    .map((sid) => room.players.get(sid)?.name)
    .filter((n): n is string => !!n);
}

function pomoState(room: RoomState): SharedPomoState {
  const sp = room.sharedPomo;
  return {
    phase: sp.phase,
    remaining: sp.remaining,
    running: sp.running,
    participants: sp.participants,
    session: sp.session,
    names: participantNames(room),
  };
}

function broadcastPomoState(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: RoomState,
): void {
  io.to(room.id).emit("pomo:state", pomoState(room));
}

function startPomoIfNeeded(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: RoomState,
): void {
  const sp = room.sharedPomo;
  if (!sp.running && room.pomoParticipants.size > 0) {
    sp.running = true;
    sp.intervalId = setInterval(() => pomoTick(io, room), 1000);
  }
}

// ── HTTP + Socket.IO ─────────────────────────────────────────────────────────
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CORS_ORIGINS, methods: ["GET", "POST"] },
});

// A chatter who has linked Twitch to a gamiTask account shows up as themselves, not a random
// look — and not at all as an NPC while they're actually online, since they're already a real player.
configureTwitchNpcs(
  (twitchId) => {
    const user = sql.getUserByTwitchId.get(twitchId) as UserRow | undefined;
    if (!user) return null;
    return { userId: user.id, name: user.displayName ?? "", color: user.avatarColor ?? 0, look: userLook(user) };
  },
  (userId) => {
    for (const uid of socketToUserId.values()) if (uid === userId) return true;
    return false;
  },
);

// Leaderboard par room : chaque room voit son propre classement
function broadcastLeaderboard(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: RoomState,
): void {
  const entries = Array.from(room.players.values())
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      coins: p.coins ?? 0,
      state: p.state,
    }))
    .sort((a, b) => b.coins - a.coins);
  io.to(room.id).emit("leaderboard-update", entries);
}

/** Broadcast leaderboard for a socket's current room (convenience). */
function broadcastLeaderboardForSocket(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socketId: string,
): void {
  const r = getRoom(socketId);
  if (r) broadcastLeaderboard(io, r);
}

/** Emit to all sockets in the sender's room except the sender. */
function broadcastToOwnRoom<E extends keyof ServerToClientEvents>(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  const rid = socketToRoom.get(socket.id);
  if (!rid) return;
  (socket.to(rid).emit as (e: E, ...a: Parameters<ServerToClientEvents[E]>) => boolean)(event, ...args);
}

/** Emit to all sockets in a given socket's room (including itself). */
function emitToOwnRoom<E extends keyof ServerToClientEvents>(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socketId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  const rid = socketToRoom.get(socketId);
  if (!rid) return;
  (io.to(rid).emit as (e: E, ...a: Parameters<ServerToClientEvents[E]>) => boolean)(event, ...args);
}

/** Emit to whichever room a user's single active session currently sits in (a Twitch chat message arrives with no socket of its own). */
function emitToUsersRoom<E extends keyof ServerToClientEvents>(
  userId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  for (const [sid, uid] of socketToUserId.entries()) {
    if (uid === userId) {
      emitToOwnRoom(io, sid, event, ...args);
      return;
    }
  }
}

// A private room's id is its invite: it is listed only to its owner and to whoever is already inside.
// The link `?room=<id>` still works for anyone who was given it — the id is a UUID, nobody guesses it.
function buildRoomSummaries(forUserId?: string, inRoom?: RoomId): RoomSummary[] {
  const out: RoomSummary[] = [];
  for (const r of rooms.values()) {
    if (r.isPrivate && r.ownerId !== forUserId && r.id !== inRoom) continue;
    out.push({
      id: r.id,
      count: r.players.size,
      isPrivate: r.isPrivate,
      ownerId: r.ownerId,
    });
  }
  return out;
}

function broadcastRoomsList(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
  for (const [sid, s] of io.sockets.sockets) s.emit("rooms:list", { rooms: buildRoomSummaries(socketToUserId.get(sid), socketToRoom.get(sid)) });
}

io.on("connection", (socket) => {
  console.log(`[+] connected: ${socket.id}`);
  // socket.io lets a throwing listener take the whole process down. Every handler below registers
  // through this guard, so a malformed payload costs one logged error, not every session.
  const rawOn = socket.on.bind(socket);
  (socket as { on: unknown }).on = (event: string, fn: (...args: unknown[]) => void) =>
    rawOn(event as never, ((...args: unknown[]) => {
      try { fn(...args); } catch (err) { console.error(`[${event}] handler threw`, err); }
    }) as never);
  // Envoi initial de la liste des rooms (utile pour l'écran de sélection avant join)
  socket.emit("rooms:list", { rooms: buildRoomSummaries() });

  socket.on("join", ({ name: rawName, color: rawColor, userId: claimedId, roomId, token, tzOffsetMinutes }) => {
    const name = cleanName(rawName), color = cleanColor(rawColor);
    // A Google account is only ever joined through its token; the bare userId is trusted for guests alone.
    const tokenId = userIdFromToken(token, JWT_SECRET);
    const userId = tokenId ?? claimedId;
    if (token && !tokenId) { socket.emit("auth:invalid"); return; }
    sql.upsertUser.run(userId);
    const me = sql.getUser.get(userId) as UserRow;
    if (!tokenId && me.googleId) { socket.emit("auth:invalid"); return; }

    const requestedRoomId: RoomId = roomId ?? DEFAULT_ROOM_ID;
    const requestedRoom = rooms.get(requestedRoomId);
    const bannedUntil = requestedRoom?.isPrivate ? roomBanUntil(requestedRoomId, userId) : undefined;
    if (bannedUntil !== undefined) socket.emit("room:banned", { until: bannedUntil });
    const existingRoom = bannedUntil === undefined ? requestedRoom : undefined;
    const targetRoomId: RoomId = existingRoom ? requestedRoomId : DEFAULT_ROOM_ID;
    const targetRoom = existingRoom ?? rooms.get(DEFAULT_ROOM_ID)!;

    // Kick previous sockets of the same user across all rooms
    const existingSockets = Array.from(socketToUserId.entries())
      .filter(([, uid]) => uid === userId)
      .map(([sid]) => sid)
      .filter((sid) => sid !== socket.id);

    const affectedRooms = new Set<RoomId>();
    for (const previousSocketId of existingSockets) {
      const previousSocket = io.sockets.sockets.get(previousSocketId);
      const prevRoomId = socketToRoom.get(previousSocketId);
      if (prevRoomId) {
        const prevRoom = rooms.get(prevRoomId);
        if (!prevRoom) continue;
        prevRoom.players.delete(previousSocketId);
        if (prevRoom.pomoParticipants.delete(previousSocketId)) {
          prevRoom.sharedPomo.participants = prevRoom.pomoParticipants.size;
          if (prevRoom.pomoParticipants.size === 0 && prevRoom.sharedPomo.intervalId) {
            clearInterval(prevRoom.sharedPomo.intervalId);
            prevRoom.sharedPomo.intervalId = null;
            prevRoom.sharedPomo.running = false;
          }
          broadcastPomoState(io, prevRoom);
        }
        io.to(prevRoom.id).emit("player-left", { id: previousSocketId });
        affectedRooms.add(prevRoomId);
      }
      socketToRoom.delete(previousSocketId);
      socketToUserId.delete(previousSocketId);
      previousSocket?.leave(prevRoomId ?? targetRoomId);
      previousSocket?.emit("session:replaced");
    }
    for (const rid of affectedRooms) {
      const r = rooms.get(rid);
      if (r) broadcastLeaderboard(io, r);
    }

    // Capacity check (après kick des sockets précédentes du même user pour éviter un faux full)
    if (targetRoom.players.size >= targetRoom.capacity) {
      socket.emit("room:full", { roomId: targetRoomId });
      // Rollback si la précédente room est vide : rien à faire côté state, on laisse juste le client gérer
      if (affectedRooms.size > 0) broadcastRoomsList(io);
      return;
    }

    const user = sql.getUser.get(userId) as UserRow;
    const spawnCol = 1;
    const spawnRow = 10;
    const ownedFurnitureList = (user.ownedFurniture ?? "")
      .split(",")
      .filter(Boolean);
    const placedFurnitureList = getEffectivePlaced(
      user.placedFurniture ?? "",
      user.ownedFurniture ?? "",
    );
    const furniturePositionsPayload = getFurniturePosPayload(
      user.furniturePositions ?? "{}",
    );
    const pendingTaskIds = userTasks(userId).filter(isPending).map((t) => t.id);
    const player: Player = {
      id: socket.id,
      name,
      color,
      col: spawnCol,
      row: spawnRow,
      state: "idle",
      coins: user.coins,
      hat: user.equippedHat ?? null,
      pendingTaskIds,
      look: userLook(user),
    };
    targetRoom.players.set(socket.id, player);
    socketToRoom.set(socket.id, targetRoomId);
    socketToUserId.set(socket.id, userId);
    socket.join(targetRoomId);
    {
      const twitchRow = sql.getTwitchTokens.get(userId) as { twitchId: string | null } | undefined;
      if (twitchRow?.twitchId) {
        connectTwitchChat(userId, twitchRow.twitchId, () => getValidTwitchAccessToken(userId), (msg) => {
          const color = msg.color ? parseInt(msg.color.slice(1), 16) : 0x9146ff; // Twitch purple when the chatter has none set
          emitToUsersRoom(userId, "chat-message", {
            id: `twitch-chatter-${msg.chatterId}`, // matches the id twitchNpcs gives that NPC, so the message also floats above them if they're in the room
            name: msg.chatterName || msg.chatterLogin,
            color, text: sanitize(msg.text), ts: Date.now(),
          });
        });
        startTwitchNpcs(io, userId, targetRoomId, twitchRow.twitchId, () => getValidTwitchAccessToken(userId), targetRoom.isPrivate);
      }
    }
    sql.setAvatarInfo.run(name, color, userId);

    // Announce assigned room to the client first (so client can correct UI)
    socket.emit("room:info", { roomId: targetRoomId });
    socket.emit("me:state", { userId, role: me.role });
    socket.emit("catalog:state", { items: catalogItems() });// before any owned/placed list, so custom ids are known
    // Broadcast to existing occupants
    socket.to(targetRoomId).emit("player-joined", player);
    // Send existing players to the newcomer
    const otherPlayers = Array.from(targetRoom.players.values()).filter(
      (p) => p.id !== socket.id,
    );
    socket.emit("room-state", otherPlayers);
    socket.emit("npc:state", roomNpcSnapshot(targetRoomId));
    socket.emit("pomo:state", pomoState(targetRoom));
    console.log(`[join] ${name} → room:${targetRoomId} @ (${spawnCol},${spawnRow})`);

    // Per-user initial state (independent of room)
    socket.emit("tasks:state", {
      tasks: userTasks(userId),
      coins: user.coins,
      energy: user.energy ?? ENERGY_MAX,
      exhausted: (user.exhaustedUntil ?? 0) > Date.now(),
    });
    const xp = user.xp ?? 0;
    const level = levelOf(xp);
    const xpToNext = 50 * (level + 1) * (level + 1) - xp;
    socket.emit("xp:update", { xp, level, xpToNext, levelUp: false });
    const ownedList = (user.ownedItems ?? "").split(",").filter(Boolean);
    socket.emit("cosmetics:state", {
      owned: ownedList,
      equippedHat: user.equippedHat ?? null,
      // only a look the player already saved: a missing one must not wipe the client's local cache
      look: user.look ? player.look : undefined,
    });
    socket.emit("furniture:state", {
      owned: ownedFurnitureList,
      placed: placedFurnitureList,
      positions: furniturePositionsPayload,
    });
    runRollover(socket, userId, tzOffsetMinutes);
    broadcastLeaderboard(io, targetRoom);
    broadcastRoomsList(io);
  });

  // ── Room switch ──────────────────────────────────────────────────────────
  socket.on("room:switch", ({ roomId }) => {
    if (!allow(socket.id, "room:switch", 5, 10000)) return;
    const targetRoom = rooms.get(roomId);
    if (!targetRoom) return;
    const currentRoom = getRoom(socket.id);
    if (!currentRoom) return;
    if (currentRoom.id === roomId) return;
    const existing = currentRoom.players.get(socket.id);
    if (!existing) return;
    const userId = socketToUserId.get(socket.id);
    if (targetRoom.isPrivate && userId) {
      const bannedUntil = roomBanUntil(roomId, userId);
      if (bannedUntil !== undefined) {
        socket.emit("room:banned", { until: bannedUntil });
        return;
      }
    }
    if (targetRoom.players.size >= targetRoom.capacity) {
      socket.emit("room:full", { roomId });
      return;
    }

    // Leave pomo participation if any
    if (currentRoom.pomoParticipants.delete(socket.id)) {
      currentRoom.sharedPomo.participants = currentRoom.pomoParticipants.size;
      if (currentRoom.pomoParticipants.size === 0 && currentRoom.sharedPomo.intervalId) {
        clearInterval(currentRoom.sharedPomo.intervalId);
        currentRoom.sharedPomo.intervalId = null;
        currentRoom.sharedPomo.running = false;
      }
    }

    // Remove from old room
    currentRoom.players.delete(socket.id);
    socket.to(currentRoom.id).emit("player-left", { id: socket.id });
    socket.leave(currentRoom.id);
    broadcastLeaderboard(io, currentRoom);
    broadcastPomoState(io, currentRoom);

    // Re-spawn at entry point
    const spawnCol = 1;
    const spawnRow = 10;
    const rePlayer: Player = {
      ...existing,
      col: spawnCol,
      row: spawnRow,
      state: "idle",
    };
    targetRoom.players.set(socket.id, rePlayer);
    socketToRoom.set(socket.id, roomId);
    socket.join(roomId);
    if (userId) {
      const twitchRow = sql.getTwitchTokens.get(userId) as { twitchId: string | null } | undefined;
      if (twitchRow?.twitchId) startTwitchNpcs(io, userId, roomId, twitchRow.twitchId, () => getValidTwitchAccessToken(userId), targetRoom.isPrivate);
    }

    socket.emit("room:info", { roomId });
    socket.to(roomId).emit("player-joined", rePlayer);
    const otherPlayers = Array.from(targetRoom.players.values()).filter(
      (p) => p.id !== socket.id,
    );
    socket.emit("room-state", otherPlayers);
    socket.emit("npc:state", roomNpcSnapshot(roomId));
    socket.emit("pomo:state", pomoState(targetRoom));
    broadcastLeaderboard(io, targetRoom);
    broadcastRoomsList(io);
    console.log(`[room:switch] ${existing.name} ${currentRoom.id} → ${roomId}${userId ? " (" + userId.slice(0, 6) + ")" : ""}`);
  });

  // ── Rooms privées : création ──────────────────────────────────────────────
  socket.on("room:create-private", ({ name }) => {
    if (!allow(socket.id, "room:create-private", 3, 60000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const user = sql.getUser.get(userId) as UserRow | undefined;
    if (!user) return;
    // Réservé aux comptes Google (persistants)
    const row = db
      .prepare("SELECT googleId FROM users WHERE id = ?")
      .get(userId) as { googleId: string | null } | undefined;
    if (!row?.googleId && !ALLOW_GUEST_PRIVATE_ROOMS) return;
    // Un utilisateur ne peut avoir qu'une seule room privée
    const existing = sql.getPrivateRoomByOwner.get(userId) as
      | PrivateRoomRow
      | undefined;
    if (existing) return;
    const trimmed = name.trim().slice(0, 30);
    if (!trimmed) return;
    const roomId = randomUUID();
    sql.insertPrivateRoom.run(roomId, trimmed, userId, Date.now());
    rooms.set(roomId, createPrivateRoomState(roomId, trimmed, userId));
    broadcastRoomsList(io);
    console.log(`[room:create-private] ${user.displayName ?? "Invité"} → ${roomId} (${trimmed})`);
  });

  // Owner-only: throw someone out of this private room right now, and (optionally) keep them out for a while.
  socket.on("room:kick", ({ targetSocketId, durationMs }) => {
    if (!allow(socket.id, "room:kick", 10, 10000)) return;
    if (targetSocketId === socket.id) return;
    const room = getRoom(socket.id);
    if (!room || !room.isPrivate) return;
    const callerUserId = socketToUserId.get(socket.id);
    if (!callerUserId || room.ownerId !== callerUserId) return;
    const target = room.players.get(targetSocketId);
    if (!target) return;
    const targetUserId = socketToUserId.get(targetSocketId);
    const until = durationMs == null ? null : Date.now() + Math.max(0, durationMs);
    if (targetUserId) sql.banFromRoom.run(room.id, targetUserId, until, Date.now());

    room.players.delete(targetSocketId);
    io.to(room.id).emit("player-left", { id: targetSocketId });
    broadcastLeaderboard(io, room);
    broadcastRoomsList(io);

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      const fallback = rooms.get(DEFAULT_ROOM_ID)!;
      const movedPlayer: Player = { ...target, col: 1, row: 10, state: "idle" };
      fallback.players.set(targetSocketId, movedPlayer);
      socketToRoom.set(targetSocketId, fallback.id);
      targetSocket.leave(room.id);
      targetSocket.join(fallback.id);
      targetSocket.to(fallback.id).emit("player-joined", movedPlayer);
      const others = Array.from(fallback.players.values()).filter((p) => p.id !== targetSocketId);
      targetSocket.emit("room:info", { roomId: fallback.id });
      targetSocket.emit("room-state", others);
      targetSocket.emit("npc:state", roomNpcSnapshot(fallback.id));
      targetSocket.emit("room:kicked", { until });
      broadcastLeaderboard(io, fallback);
    }
    console.log(`[room:kick] ${target.name} ← ${room.id} by ${callerUserId.slice(0, 6)} (${until === null ? "permanent" : `until ${new Date(until).toISOString()}`})`);
  });

  socket.on("move", ({ col, row }) => {
    if (!allow(socket.id, "move", 30, 1000)) return;
    if (
      !Number.isInteger(col) ||
      !Number.isInteger(row) ||
      col < 0 ||
      col >= MAX_GRID ||
      row < 0 ||
      row >= MAX_GRID
    )
      return;
    const p = getPlayer(socket.id);
    if (!p) return;
    p.col = col;
    p.row = row;
    broadcastToOwnRoom(socket,"player-moved", { id: socket.id, col, row });
  });

  socket.on("avatar-state", ({ state }) => {
    const p = getPlayer(socket.id);
    if (!p) return;
    p.state = state;
    broadcastToOwnRoom(socket,"player-state", { id: socket.id, state });
    broadcastLeaderboardForSocket(io, socket.id);
  });

  socket.on("chat", ({ text }) => {
    if (!allow(socket.id, "chat", 5, 5000)) return;
    const p = getPlayer(socket.id);
    if (!p) return;
    const safe = sanitize(text);
    if (!safe.trim()) return;
    emitToOwnRoom(io, socket.id, "chat-message", {
      id: socket.id,
      name: p.name,
      color: p.color,
      text: safe,
      ts: Date.now(),
    });
  });

  socket.on("chat:typing", () => {
    if (!allow(socket.id, "chat:typing", 5, 3000)) return;
    const p = getPlayer(socket.id);
    if (!p) return;
    broadcastToOwnRoom(socket,"chat:typing", {
      id: socket.id,
      name: p.name,
      color: p.color,
    });
  });

  const VALID_EMOTES = new Set(["👋", "😄", "❤️", "👍", "☕", "🍅", "🎉", "😴"]);
  socket.on("chat:emote", ({ emoji }) => {
    if (!allow(socket.id, "chat:emote", 5, 3000)) return;
    if (!VALID_EMOTES.has(emoji)) return;
    const p = getPlayer(socket.id);
    if (!p) return;
    emitToOwnRoom(io, socket.id, "chat:emote", { id: socket.id, emoji });
  });

  // ── Tâches ───────────────────────────────────────────────────────────────
  socket.on("task:add", (payload) => {
    if (!allow(socket.id, "task:add", 10, 10000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const safe = sanitize(payload.text);
    if (!safe.trim()) return;
    sql.upsertUser.run(userId);
    const kind = cleanKind(payload.kind);
    const task: Task = {
      id: randomUUID(),
      userId,
      text: safe,
      note: cleanNote(payload.note),
      kind,
      difficulty: cleanDifficulty(payload.difficulty),
      value: 0,
      category: VALID_CATEGORIES.has(payload.category as string) ? payload.category : null,
      createdAt: Date.now(),
      done: false,
      up: kind === "habit" ? payload.up !== false : true,
      down: kind === "habit" ? !!payload.down : false,
      countUp: 0,
      countDown: 0,
      days: kind === "daily" ? cleanDays(payload.days) : 127,
      streak: 0,
      dueAt: kind === "todo" && Number.isFinite(payload.dueAt) ? Math.floor(payload.dueAt as number) : null,
      checklist: kind === "todo" ? cleanChecklist(payload.checklist) : [],
      completedAt: null,
    };
    if (task.kind === "habit" && !task.up && !task.down) task.up = true;
    sql.insertTask.run(taskToRow(task));
    socket.emit("task:added", task);
    const p = getPlayer(socket.id);
    if (p) {
      p.pendingTaskIds = [...(p.pendingTaskIds ?? []), task.id];
      broadcastToOwnRoom(socket, "tasks:public-update", { socketId: socket.id, taskIds: p.pendingTaskIds });
    }
  });

  socket.on("task:delete", ({ taskId }) => {
    if (!allow(socket.id, "task:delete", 10, 10000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    sql.deleteTask.run(taskId, userId);
    socket.emit("task:deleted", { taskId });
    const p = getPlayer(socket.id);
    if (p) {
      p.pendingTaskIds = (p.pendingTaskIds ?? []).filter((id) => id !== taskId);
      broadcastToOwnRoom(socket,"tasks:public-update", {
        socketId: socket.id,
        taskIds: p.pendingTaskIds,
      });
    }
  });

  socket.on("task:update", ({ taskId, patch }) => {
    if (!allow(socket.id, "task:update", 20, 10000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const row = sql.getTaskRow.get(taskId, userId) as TaskRow | undefined;
    if (!row || !patch || typeof patch !== "object") return;
    const t = rowToTask(row);
    if (typeof patch.text === "string") { const s = sanitize(patch.text); if (s.trim()) t.text = s; }
    if ("note" in patch) t.note = cleanNote(patch.note);
    if ("difficulty" in patch) t.difficulty = cleanDifficulty(patch.difficulty);
    if ("category" in patch) t.category = VALID_CATEGORIES.has(patch.category as string) ? (patch.category as string) : null;
    if (t.kind === "habit") {
      if ("up" in patch) t.up = !!patch.up;
      if ("down" in patch) t.down = !!patch.down;
      if (!t.up && !t.down) t.up = true;
    }
    if (t.kind === "daily" && "days" in patch) t.days = cleanDays(patch.days);
    if (t.kind === "todo") {
      if ("dueAt" in patch) t.dueAt = Number.isFinite(patch.dueAt) ? Math.floor(patch.dueAt as number) : null;
      if ("checklist" in patch) t.checklist = cleanChecklist(patch.checklist);
    }
    sql.updateTask.run(taskToRow(t));
    socket.emit("task:updated", t);
  });

  socket.on("task:score", ({ taskId, direction }) => {
    if (!allow(socket.id, "task:score", 30, 10000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (direction !== "up" && direction !== "down") return;
    const row = sql.getTaskRow.get(taskId, userId) as TaskRow | undefined;
    if (!row) return;
    const user = sql.getUser.get(userId) as UserRow;
    const level = levelOf(user.xp ?? 0);
    const r = score(rowToTask(row), direction, level);
    if (!r) return;
    sql.updateTask.run(taskToRow(r.task));
    // Pièces : gain de la coche + bonus mobilier appliqué signé (symétrique tick/untick), plancher 0.
    let coins = user.coins;
    let bonus = 0;
    if (r.coins !== 0) {
      const furnitureRow = sql.getFurniture.get(userId) as { ownedFurniture: string; placedFurniture: string };
      const placed = getEffectivePlaced(furnitureRow?.placedFurniture ?? "", furnitureRow?.ownedFurniture ?? "");
      if (placed.includes("plant")) bonus += 2;
      if (placed.includes("bookshelf")) bonus += 2;
      if (placed.includes("cactus")) bonus += 1;
      bonus += getSetBonuses(placed).coinsTask;
      if (r.coins > 0 && placed.includes("lamp")) emitXpUpdate(socket, userId, 5);
    }
    coins = Math.max(0, coins + coinsDelta(r.coins, bonus));
    sql.setCoins.run(coins, userId);
    if (r.xp !== 0) emitXpUpdate(socket, userId, r.xp);
    const energy = r.energyDelta ? applyEnergy(socket, userId, r.energyDelta) : (sql.getEnergy.get(userId) as { energy: number }).energy;
    coins = (sql.getCoins.get(userId) as UserRow).coins;
    const { xp } = sql.getXp.get(userId) as { xp: number };
    const newLevel = levelOf(xp);
    socket.emit("task:scored", {
      task: r.task, coins, xp, level: newLevel,
      xpToNext: 50 * (newLevel + 1) * (newLevel + 1) - xp,
      levelUp: newLevel > level, energy,
    });
    if (r.coins > 0) {
      const taskCount = (sql.countDoneTasks.get(userId) as { cnt: number }).cnt;
      if (taskCount === 1) tryUnlock(io, socket, userId, "first-task");
      if (taskCount >= 10) tryUnlock(io, socket, userId, "task-10");
      if (taskCount >= 50) tryUnlock(io, socket, userId, "task-50");
      if (coins >= 100) tryUnlock(io, socket, userId, "coins-100");
      if (coins >= 500) tryUnlock(io, socket, userId, "coins-500");
      if (r.task.kind !== "habit") broadcastToOwnRoom(socket, "task:completed-public", { socketId: socket.id });
    }
    const p = getPlayer(socket.id);
    if (p) {
      p.coins = coins;
      p.pendingTaskIds = userTasks(userId).filter(isPending).map((t) => t.id);
      broadcastToOwnRoom(socket, "tasks:public-update", { socketId: socket.id, taskIds: p.pendingTaskIds });
    }
    broadcastLeaderboardForSocket(io, socket.id);
  });

  // ── Acheter un meuble (Feng Shui) ────────────────────────────────────────────────────
  socket.on("furniture:buy", ({ itemId }) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const item = furnitureItem(itemId);
    if (!item) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedFurniture ?? "").split(",").filter(Boolean);
    if (owned.includes(itemId)) return;
    if (user.coins < item.price) return;
    sql.addCoins.run(-item.price, userId);
    const newOwned = [...owned, itemId].join(",");
    sql.setOwnedFurniture.run(newOwned, userId);
    const newPlacedOnBuy = getEffectivePlaced(
      user.placedFurniture ?? "",
      user.ownedFurniture ?? "",
    );
    const newPlacedList = [...newPlacedOnBuy, itemId];
    sql.setPlacedFurniture.run(newPlacedList.join(","), userId);
    const newCoins = (sql.getCoins.get(userId) as UserRow).coins;
    socket.emit("coins:update", { coins: newCoins });
    socket.emit("furniture:bought", { itemId, coins: newCoins });
    const buyPositionsPayload = getFurniturePosPayload(
      user.furniturePositions ?? "{}",
    );
    socket.emit("furniture:state", {
      owned: [...owned, itemId],
      placed: newPlacedList,
      positions: buyPositionsPayload,
    });
    const p = getPlayer(socket.id);
    if (p) p.coins = newCoins;
    broadcastLeaderboardForSocket(io, socket.id);
  });
  // ── Déplacer un meuble (Feng Shui) ─────────────────────────────────────────────
  socket.on("furniture:move", ({ itemId, col, row }) => {
    if (!allow(socket.id, "furniture:move", 20, 5000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const r = getRoom(socket.id);
    if (!r?.isPrivate || r.ownerId !== userId) return; // Placement uniquement dans sa propre room privée
    const item = furnitureItem(itemId);
    if (!item) return;
    if (col < 0 || col >= MAX_GRID || row < 0 || row >= MAX_GRID) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedFurniture ?? "").split(",").filter(Boolean);
    if (!owned.includes(itemId)) return;
    const positions = JSON.parse(
      (user.furniturePositions as string | null) ?? "{}",
    ) as Record<string, { col: number; row: number }>;
    positions[itemId] = { col, row };
    sql.setFurniturePositions.run(JSON.stringify(positions), userId);
    const movedPlaced = getEffectivePlaced(
      user.placedFurniture ?? "",
      user.ownedFurniture ?? "",
    );
    const movedPositionsPayload = getFurniturePosPayload(
      JSON.stringify(positions),
    );
    socket.emit("furniture:state", {
      owned,
      placed: movedPlaced,
      positions: movedPositionsPayload,
    });
  });
  // ── Ranger / Sortir un meuble de la chambre (toggle-place) ───────────────────
  socket.on("furniture:toggle-place", ({ itemId }) => {
    if (!allow(socket.id, "furniture:toggle-place", 20, 5000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const r = getRoom(socket.id);
    if (!r?.isPrivate || r.ownerId !== userId) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedFurniture ?? "").split(",").filter(Boolean);
    if (!owned.includes(itemId)) return;
    const placed = getEffectivePlaced(
      user.placedFurniture ?? "",
      user.ownedFurniture ?? "",
    );
    const newPlaced = placed.includes(itemId)
      ? placed.filter((id) => id !== itemId)
      : [...placed, itemId];
    sql.setPlacedFurniture.run(newPlaced.join(","), userId);
    const togglePositionsPayload = getFurniturePosPayload(
      user.furniturePositions ?? "{}",
    );
    socket.emit("furniture:state", {
      owned,
      placed: newPlaced,
      positions: togglePositionsPayload,
    });
  });
  // ── Confirmer le placement fantôme d'un meuble ─────────────────────────────
  socket.on("furniture:place", ({ itemId, col, row }) => {
    if (!allow(socket.id, "furniture:place", 20, 5000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const r = getRoom(socket.id);
    if (!r?.isPrivate || r.ownerId !== userId) return;
    const item = furnitureItem(itemId);
    if (!item) return;
    if (col < 0 || col >= MAX_GRID || row < 0 || row >= MAX_GRID) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedFurniture ?? "").split(",").filter(Boolean);
    if (!owned.includes(itemId)) return;
    const placedIds = getEffectivePlaced(
      user.placedFurniture ?? "",
      user.ownedFurniture ?? "",
    );
    const effectivePos = getFurniturePosPayload(
      user.furniturePositions ?? "{}",
    );
    for (const otherId of placedIds) {
      if (otherId !== itemId) {
        const pos = effectivePos[otherId];
        if (pos && pos.col === col && pos.row === row) return;
      }
    }
    const positions = JSON.parse(
      (user.furniturePositions as string | null) ?? "{}",
    ) as Record<string, { col: number; row: number }>;
    positions[itemId] = { col, row };
    sql.setFurniturePositions.run(JSON.stringify(positions), userId);
    const newPlacedAfter = placedIds.includes(itemId)
      ? placedIds
      : [...placedIds, itemId];
    sql.setPlacedFurniture.run(newPlacedAfter.join(","), userId);
    const placePositionsPayload = getFurniturePosPayload(
      JSON.stringify(positions),
    );
    socket.emit("furniture:state", {
      owned,
      placed: newPlacedAfter,
      positions: placePositionsPayload,
    });
  });
  // ── Acheter un item dans le shop ─────────────────────────────────────────────
  socket.on("shop:buy", ({ itemId }) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const item = hatItem(itemId);
    if (!item) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedItems ?? "").split(",").filter(Boolean);
    if (owned.includes(itemId)) return;
    if (user.coins < item.price) return;
    sql.addCoins.run(-item.price, userId);
    const newOwned = [...owned, itemId].join(",");
    sql.setOwnedItems.run(newOwned, userId);
    const newCoins = (sql.getCoins.get(userId) as UserRow).coins;
    socket.emit("coins:update", { coins: newCoins });
    socket.emit("shop:bought", { itemId, coins: newCoins });
    socket.emit("cosmetics:state", {
      owned: [...owned, itemId],
      equippedHat: user.equippedHat ?? null,
      look: user.look ? userLook(user) : undefined,
    });
    const p = getPlayer(socket.id);
    if (p) p.coins = newCoins;
    broadcastLeaderboardForSocket(io, socket.id);
  });

  // ── Équiper / déséquiper un cosmétique ───────────────────────────────────────────
  socket.on("cosmetic:equip", ({ hatId }) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (hatId !== null) {
      const user = sql.getUser.get(userId) as UserRow;
      const owned = (user.ownedItems ?? "").split(",").filter(Boolean);
      if (!owned.includes(hatId)) return;
    }
    sql.setEquippedHat.run(hatId, userId);
    const p = getPlayer(socket.id);
    if (p) p.hat = hatId;
    broadcastToOwnRoom(socket,"player-hat", { id: socket.id, hat: hatId });
    // Le look embarque aussi le chapeau : le rediffuser pour rester cohérent.
    if (p?.look) {
      const look: Look = { ...p.look, hat: hatId };
      p.look = look;
      broadcastToOwnRoom(socket,"player-look", { id: socket.id, look });
    }
  });

  // ── Mettre à jour son apparence ──────────────────────────────────────────────
  socket.on("look:update", ({ look: rawLook }) => {
    if (!allow(socket.id, "look:update", 5, 5000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const user = sql.getUser.get(userId) as UserRow | undefined;
    if (!user) return;
    const look = sanitizeLook(rawLook, user.equippedHat ?? null, user.avatarColor);
    sql.setLook.run(JSON.stringify(look), userId);
    // La couleur du t-shirt reste la couleur d'identité côté serveur.
    sql.setAvatarInfo.run(user.displayName, look.shirt, userId);
    const p = getPlayer(socket.id);
    if (p) {
      p.look = look;
      p.color = look.shirt;
    }
    broadcastToOwnRoom(socket,"player-look", { id: socket.id, look });
    socket.emit("cosmetics:state", {
      owned: (user.ownedItems ?? "").split(",").filter(Boolean),
      equippedHat: user.equippedHat ?? null,
      look,
    });
  });
  // ── Pomodoro personnel complété ──────────────────────────────────────────
  socket.on("pomodoro:start", ({ minutes }) => {
    if (!allow(socket.id, "pomodoro:start", 10, 60000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    focusStarts.set(userId, { at: Date.now(), minutes: cleanFocusMinutes(minutes) });
  });

  socket.on("pomodoro:complete", () => {
    if (!allow(socket.id, "pomodoro:complete", 2, 30000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const now = Date.now();
    if (!focusEarned(focusStarts.get(userId), now)) return; // no start seen, or not long enough ago: nothing to pay
    focusStarts.delete(userId);
    sql.upsertUser.run(userId);
    const STREAK_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 heures
    const streakRow = sql.getStreak.get(userId) as Pick<
      UserRow,
      "streak" | "lastPomoAt"
    >;
    const withinWindow = now - (streakRow?.lastPomoAt ?? 0) < STREAK_WINDOW_MS;
    const newStreak = withinWindow ? (streakRow?.streak ?? 0) + 1 : 1;
    const bonus = Math.min(newStreak * 5, 50);
    sql.saveStreak.run(newStreak, now, userId);
    sql.addCoins.run(25 + bonus, userId);
    // Bonus Feng Shui pomodoro
    const pFurnitureRow = sql.getFurniture.get(userId) as {
      ownedFurniture: string;
      placedFurniture: string;
    };
    const pFurniture = getEffectivePlaced(
      pFurnitureRow?.placedFurniture ?? "",
      pFurnitureRow?.ownedFurniture ?? "",
    );
    const setB = getSetBonuses(pFurniture);
    let pomoFengBonus = 0;
    if (pFurniture.includes("coffee")) pomoFengBonus += 5;
    pomoFengBonus += setB.coinsPomo;
    if (pomoFengBonus > 0) sql.addCoins.run(pomoFengBonus, userId);
    const coins = (sql.getCoins.get(userId) as UserRow).coins;
    socket.emit("coins:update", { coins });
    socket.emit("streak:update", { streak: newStreak, bonus });
    tryUnlock(io, socket, userId, "first-pomo");
    if (newStreak >= 5) tryUnlock(io, socket, userId, "streak-5");
    if (coins >= 100) tryUnlock(io, socket, userId, "coins-100");
    if (coins >= 500) tryUnlock(io, socket, userId, "coins-500");
    // XP : +50 par pomodoro personnel
    emitXpUpdate(socket, userId, 50);
    // Bonus Feng Shui XP : +10 XP avec lampe
    if (pFurniture.includes("lamp")) emitXpUpdate(socket, userId, 10);
    // Bonus Set Feng Shui XP
    if (setB.xpPomo > 0) emitXpUpdate(socket, userId, setB.xpPomo);
    const p = getPlayer(socket.id);
    if (p) p.coins = coins;
    broadcastLeaderboardForSocket(io, socket.id);
  });

  // ── Pomodoro collectif (par room) ────────────────────────────────────────
  socket.on("pomo:join", () => {
    const room = getRoom(socket.id);
    if (!room) return;
    if (room.pomoParticipants.has(socket.id)) return;
    room.pomoParticipants.add(socket.id);
    room.sharedPomo.participants = room.pomoParticipants.size;
    startPomoIfNeeded(io, room);
    broadcastPomoState(io, room);
    for (const sid of room.pomoParticipants) {
      io.to(sid).emit("pomo:tick", {
        remaining: room.sharedPomo.remaining,
        phase: room.sharedPomo.phase,
        session: room.sharedPomo.session,
      });
    }
    console.log(
      `[pomo:join] ${socket.id} (room:${room.id}) — ${room.pomoParticipants.size} participant(s)`,
    );
  });

  socket.on("pomo:leave", () => {
    const room = getRoom(socket.id);
    if (!room) return;
    if (!room.pomoParticipants.delete(socket.id)) return;
    room.sharedPomo.participants = room.pomoParticipants.size;
    if (room.pomoParticipants.size === 0 && room.sharedPomo.intervalId) {
      clearInterval(room.sharedPomo.intervalId);
      room.sharedPomo.intervalId = null;
      room.sharedPomo.running = false;
    }
    broadcastPomoState(io, room);
  });

  socket.on("disconnect", () => {
    cleanRateLimit(socket.id);
    const room = getRoom(socket.id);
    if (room) {
      room.players.delete(socket.id);
      socket.to(room.id).emit("player-left", { id: socket.id });
      if (room.pomoParticipants.delete(socket.id)) {
        room.sharedPomo.participants = room.pomoParticipants.size;
        if (room.pomoParticipants.size === 0 && room.sharedPomo.intervalId) {
          clearInterval(room.sharedPomo.intervalId);
          room.sharedPomo.intervalId = null;
          room.sharedPomo.running = false;
        }
        broadcastPomoState(io, room);
      }
      broadcastLeaderboard(io, room);
      broadcastRoomsList(io);
    }
    socketToRoom.delete(socket.id);
    const disconnectedUserId = socketToUserId.get(socket.id);
    socketToUserId.delete(socket.id);
    if (disconnectedUserId) {
      disconnectTwitchChat(disconnectedUserId);
      stopTwitchNpcs(io, disconnectedUserId);
    }
    console.log(`[-] disconnected: ${socket.id}`);
  });

  // ── Catalogue editor ─────────────────────────────────────────────────────
  function canEditCatalog(): boolean {
    const uid = socketToUserId.get(socket.id);
    const u = uid ? (sql.getUser.get(uid) as UserRow | undefined) : undefined;
    return !!u && canEdit(u.role);
  }
  socket.on("catalog:save", ({ item }) => {
    if (!canEditCatalog()) return;
    const clean = sanitizeItem(item);
    if (!clean) { socket.emit("catalog:error", { message: "Objet invalide." }); return; }
    sql.upsertItem.run(clean.id, JSON.stringify(clean), Date.now());
    io.emit("catalog:state", { items: catalogItems() });
  });
  // A decor override changed under everyone's feet: the client rebuilds its room and asks who is still in it.
  socket.on("room:refresh", () => {
    const r = getRoom(socket.id);
    if (!r) return;
    socket.emit("room-state", Array.from(r.players.values()).filter((p) => p.id !== socket.id));
  });
  socket.on("catalog:delete", ({ id }) => {
    if (!canEditCatalog()) return;
    sql.deleteItem.run(id);
    io.emit("catalog:state", { items: catalogItems() });
  });

  // ── Profil joueur ──────────────────────────────────────────────────────────
  socket.on("profile:request", ({ socketId }) => {
    const targetSid = socketId ?? socket.id;
    const targetUserId = socketToUserId.get(targetSid);
    if (!targetUserId) return;
    const user = sql.getUser.get(targetUserId) as UserRow | undefined;
    if (!user) return;
    // Prefer in-memory player name/color (always up to date for connected players)
    const inMemoryPlayer = getPlayer(targetSid);
    const achievementKeys = (
      sql.getUserAchievements.all(targetUserId) as { key: string }[]
    ).map((r) => r.key);
    const xp = user.xp ?? 0;
    const lvl = levelOf(xp);
    const xpForThisLevel = 50 * lvl * lvl;
    const xpForNextLevel = 50 * (lvl + 1) * (lvl + 1);
    socket.emit("profile:data", {
      userId: targetUserId,
      name: inMemoryPlayer?.name ?? user.displayName ?? "Invité",
      color: inMemoryPlayer?.color ?? user.avatarColor ?? 0x4f8ef7,
      hat: inMemoryPlayer?.hat ?? user.equippedHat ?? null,
      level: lvl,
      xp,
      xpProgress: xp - xpForThisLevel,
      xpToNext: xpForNextLevel - xpForThisLevel,
      coins: user.coins ?? 0,
      streak: user.streak ?? 0,
      energy: user.energy ?? ENERGY_MAX,
      achievements: achievementKeys,
      isAdmin: !!user.isAdmin,
    });
  });
});

// Last: a route or the JSON body parser that throws answers with a plain status, never Express's HTML page and stack.
app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error("[http]", err);
  res.status(status).json({ error: status >= 500 ? "server error" : "bad request" });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
httpServer.listen(PORT, () => {
  console.log(`[+] Server running on port ${PORT}`);
});
