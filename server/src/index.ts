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
  PUBLIC_ROOMS_META,
  PRIVATE_ROOM_THEME,
  MAX_PUBLIC_ROOM,
  MAX_PRIVATE_ROOM,
  DEFAULT_ROOM_ID,
  isPublicRoomId,
  type RoomSummary,
  type RoomId,
  type PublicRoomId,
  type Player,
  type Task,
  type SharedPomoState,
  type PomodoroPhase,
  type VideoState,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type GuildData,
  type Look,
} from "./types.js";
import { sanitizeLook } from "./look.js";

// Grid bound shared by every room. The 3D café is 24x20; 32 leaves room for bigger layouts.
const MAX_GRID = 32;
// Until accounts ship, guests may own a private room. Set to "false" once auth lands.
const ALLOW_GUEST_PRIVATE_ROOMS = process.env.ALLOW_GUEST_PRIVATE_ROOMS !== "false";
const CORS_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173").split(",");

const app = express();
app.use(cors());
app.use(express.json());

// ── Base de données SQLite ───────────────────────────────────────────────────
interface UserRow {
  id: string;
  coins: number;
  col: number;
  row: number;
  streak: number;
  lastPomoAt: number;
  xp: number;
  degradation: number;
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
  look: string | null;
}
interface TaskRow {
  id: string;
  userId: string;
  text: string;
  done: number;
  createdAt: number;
  category: string | null;
  type: string;
}

const db = new Database(process.env.DB_PATH ?? "./data.db");
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
  db.exec(
    `ALTER TABLE users ADD COLUMN placedFurniture TEXT NOT NULL DEFAULT ''`,
  );
  db.exec(
    `UPDATE users SET placedFurniture = ownedFurniture WHERE placedFurniture = '' AND ownedFurniture != ''`,
  );
} catch {}
db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_googleId ON users(googleId) WHERE googleId IS NOT NULL`,
);
db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`,
);

// ── Tables Guildes ───────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS guilds (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    ownerId     TEXT    NOT NULL,
    level       INTEGER NOT NULL DEFAULT 1,
    bossHp      INTEGER NOT NULL DEFAULT 100,
    bossMaxHp   INTEGER NOT NULL DEFAULT 100,
    bossLevel   INTEGER NOT NULL DEFAULT 1,
    bossDefeated INTEGER NOT NULL DEFAULT 0,
    createdAt   INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guild_members (
    userId  TEXT PRIMARY KEY,
    guildId TEXT NOT NULL
  );
`);

// ── Table Private Rooms ─────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS private_rooms (
    id        TEXT    PRIMARY KEY,
    name      TEXT    NOT NULL,
    ownerId   TEXT    NOT NULL UNIQUE,
    createdAt INTEGER NOT NULL
  );
`);

const sql = {
  upsertUser: db.prepare(
    "INSERT OR IGNORE INTO users (id, coins) VALUES (?, 0)",
  ),
  getUser: db.prepare(
    "SELECT id, coins, col, row, streak, lastPomoAt, xp, degradation, lastDailyResetAt, ownedItems, equippedHat, ownedFurniture, furniturePositions, placedFurniture, displayName, avatarColor, isAdmin, look FROM users WHERE id = ?",
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
    "INSERT INTO tasks (id, userId, text, done, createdAt, category, type) VALUES (?, ?, ?, 0, ?, ?, ?)",
  ),
  getTask: db.prepare(
    "SELECT id, userId, done FROM tasks WHERE id = ? AND userId = ?",
  ),
  updateTaskDone: db.prepare("UPDATE tasks SET done = ? WHERE id = ?"),
  updateTaskText: db.prepare(
    "UPDATE tasks SET text = ?, category = ? WHERE id = ? AND userId = ?",
  ),
  deleteTask: db.prepare("DELETE FROM tasks WHERE id = ? AND userId = ?"),
  savePosition: db.prepare("UPDATE users SET col = ?, row = ? WHERE id = ?"),
  getXp: db.prepare("SELECT xp FROM users WHERE id = ?"),
  addXp: db.prepare("UPDATE users SET xp = xp + ? WHERE id = ?"),
  countDoneTasks: db.prepare(
    "SELECT COUNT(*) as cnt FROM tasks WHERE userId = ? AND done = 1",
  ),
  countUncompletedDailies: db.prepare(
    "SELECT COUNT(*) as cnt FROM tasks WHERE userId = ? AND type = 'daily' AND done = 0",
  ),
  resetDailies: db.prepare(
    "UPDATE tasks SET done = 0 WHERE userId = ? AND type = 'daily'",
  ),
  getDegradation: db.prepare("SELECT degradation FROM users WHERE id = ?"),
  setDegradation: db.prepare("UPDATE users SET degradation = ? WHERE id = ?"),
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
  setAdminFlag: db.prepare("UPDATE users SET isAdmin = ? WHERE id = ?"),
  saveDailyReset: db.prepare(
    "UPDATE users SET lastDailyResetAt = ?, degradation = ? WHERE id = ?",
  ),
  checkAchievement: db.prepare(
    "SELECT 1 FROM achievements WHERE userId = ? AND key = ?",
  ),
  insertAchievement: db.prepare(
    "INSERT OR IGNORE INTO achievements (userId, key) VALUES (?, ?)",
  ),
  getUserAchievements: db.prepare(
    "SELECT key FROM achievements WHERE userId = ?",
  ),
  // Guildes
  getGuild: db.prepare("SELECT * FROM guilds WHERE id = ?"),
  getGuildByName: db.prepare("SELECT * FROM guilds WHERE name = ?"),
  insertGuild: db.prepare(
    "INSERT INTO guilds (id, name, ownerId, bossHp, bossMaxHp, bossLevel, bossDefeated, level, createdAt) VALUES (?, ?, ?, 100, 100, 1, 0, 1, ?)",
  ),
  deleteGuild: db.prepare("DELETE FROM guilds WHERE id = ?"),
  getGuildMembers: db.prepare(
    "SELECT gm.userId, COALESCE(u.displayName, u.id) as name, u.avatarColor as color FROM guild_members gm JOIN users u ON u.id = gm.userId WHERE gm.guildId = ?",
  ),
  getGuildMemberIds: db.prepare(
    "SELECT userId FROM guild_members WHERE guildId = ?",
  ),
  getUserGuild: db.prepare(
    "SELECT g.* FROM guilds g JOIN guild_members gm ON gm.guildId = g.id WHERE gm.userId = ?",
  ),
  insertGuildMember: db.prepare(
    "INSERT OR IGNORE INTO guild_members (userId, guildId) VALUES (?, ?)",
  ),
  deleteGuildMember: db.prepare("DELETE FROM guild_members WHERE userId = ?"),
  deleteGuildMembers: db.prepare("DELETE FROM guild_members WHERE guildId = ?"),
  updateBossHp: db.prepare("UPDATE guilds SET bossHp = ? WHERE id = ?"),
  defeatBoss: db.prepare(
    "UPDATE guilds SET bossHp = ?, bossMaxHp = ?, bossLevel = ?, bossDefeated = bossDefeated + 1 WHERE id = ?",
  ),
  transferGuildOwner: db.prepare("UPDATE guilds SET ownerId = ? WHERE id = ?"),
  countGuildMembers: db.prepare(
    "SELECT COUNT(*) as cnt FROM guild_members WHERE guildId = ?",
  ),
  // Private rooms
  getAllPrivateRooms: db.prepare("SELECT * FROM private_rooms"),
  getPrivateRoomByOwner: db.prepare(
    "SELECT * FROM private_rooms WHERE ownerId = ?",
  ),
  insertPrivateRoom: db.prepare(
    "INSERT INTO private_rooms (id, name, ownerId, createdAt) VALUES (?, ?, ?, ?)",
  ),
  deletePrivateRoom: db.prepare("DELETE FROM private_rooms WHERE id = ?"),
};

interface PrivateRoomRow {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}

/** Calcule le niveau à partir des XP totaux. Formule : level = floor(sqrt(xp / 50)) */
function computeLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 50));
}

interface GuildRow {
  id: string;
  name: string;
  ownerId: string;
  level: number;
  bossHp: number;
  bossMaxHp: number;
  bossLevel: number;
  bossDefeated: number;
  createdAt: number;
}
interface GuildMemberRow {
  userId: string;
  name: string;
  color: number;
}

/** Émet guild:state à tous les membres en ligne d'une guilde */
function emitGuildState(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socketToUserId: Map<string, string>,
  guildId: string,
): void {
  const guild = sql.getGuild.get(guildId) as GuildRow | undefined;
  if (!guild) return;
  const rawMembers = sql.getGuildMembers.all(guildId) as GuildMemberRow[];
  const onlineUserIds = new Set(socketToUserId.values());
  const members = rawMembers.map((m) => ({
    userId: m.userId,
    name: m.name,
    color: m.color ?? 0x4f8ef7,
    isOwner: m.userId === guild.ownerId,
    isOnline: onlineUserIds.has(m.userId),
  }));
  const payload: GuildData = {
    id: guild.id,
    name: guild.name,
    ownerId: guild.ownerId,
    level: guild.level,
    bossHp: guild.bossHp,
    bossMaxHp: guild.bossMaxHp,
    bossLevel: guild.bossLevel,
    bossDefeated: guild.bossDefeated,
    members,
  };
  for (const [socketId, userId] of socketToUserId.entries()) {
    if (members.some((m) => m.userId === userId)) {
      io.to(socketId).emit("guild:state", payload);
    }
  }
}

/** Gère la défaite du boss : récompense les membres, monte le boss de niveau */
function handleBossDefeat(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  guild: GuildRow,
): void {
  const newBossLevel = guild.bossLevel + 1;
  const newBossMaxHp = 100 * newBossLevel;
  sql.defeatBoss.run(newBossMaxHp, newBossMaxHp, newBossLevel, guild.id);
  const reward = 50 * guild.bossLevel;
  const memberIds = (
    sql.getGuildMemberIds.all(guild.id) as { userId: string }[]
  ).map((m) => m.userId);
  for (const userId of memberIds) {
    sql.addCoins.run(reward, userId);
    const newCoins = (sql.getCoins.get(userId) as UserRow).coins;
    for (const [socketId, uid] of socketToUserId.entries()) {
      if (uid === userId) {
        io.to(socketId).emit("coins:update", { coins: newCoins });
        io.to(socketId).emit("guild:boss-defeated", {
          bossLevel: guild.bossLevel,
          reward,
        });
        const p = getPlayer(socketId);
        if (p) p.coins = newCoins;
        break;
      }
    }
  }
}

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
const JWT_SECRET = process.env.JWT_SECRET ?? "gamitask_dev_secret";
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
    const isAdminLogin = !!ADMIN_EMAIL && email === ADMIN_EMAIL;
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
      user = sql.getUserByGoogleId.get(googleId) as UserRow;
    } else {
      userId = user.id;
      sql.updateGoogleAuth.run(email, googleName, userId);
      if (isAdminLogin && !user.isAdmin) sql.setAdminFlag.run(1, userId);
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
      isAdmin: isAdminLogin || !!user.isAdmin,
      isGoogleUser: true,
    });
  } catch (err) {
    console.error("[auth/google]", err);
    res.status(401).json({ error: "Invalid Google credential" });
  }
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
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = sql.getUser.get(decoded.userId) as UserRow | undefined;
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const isAdmin =
      (!!ADMIN_EMAIL && user.email === ADMIN_EMAIL) || !!user.isAdmin;
    res.json({
      userId: user.id,
      token,
      name: user.displayName ?? "",
      color: user.avatarColor ?? 0,
      isAdmin,
      isGoogleUser: !!user.googleId,
    });
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
});

/**
 * Vérifie si un nouveau jour a commencé depuis le dernier reset des dailies.
 * Si oui, compte les dailies non complétées, applique la dégradation, et remet les dailies à 0.
 * Émet toujours un degradation:update au socket appelant.
 */
function checkAndApplyDailyReset(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  userId: string,
): void {
  const user = sql.getUser.get(userId) as UserRow;
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const todayMs = todayMidnight.getTime();
  const lastReset = user.lastDailyResetAt ?? 0;

  if (lastReset < todayMs) {
    // Nouveau jour : compter les dailies non complétées (les ratées)
    const { cnt } = sql.countUncompletedDailies.get(userId) as { cnt: number };
    // Immunité débutant : pas de dégradation avant le niveau 5
    const playerLevel = computeLevel(user.xp ?? 0);
    const newDegradation =
      playerLevel < 5
        ? (user.degradation ?? 0) // immunité active — on garde le niveau actuel sans augmenter
        : Math.min(5, (user.degradation ?? 0) + cnt);
    sql.resetDailies.run(userId);
    sql.saveDailyReset.run(todayMs, newDegradation, userId);
    socket.emit("degradation:update", { level: newDegradation });
    // Boss de guilde : contre-attaque (+5 HP par daily ratée, capped à bossMaxHp)
    if (cnt > 0) {
      const memberGuild = sql.getUserGuild.get(userId) as GuildRow | undefined;
      if (memberGuild) {
        const attackHp = Math.min(
          memberGuild.bossMaxHp,
          memberGuild.bossHp + cnt * 5,
        );
        sql.updateBossHp.run(attackHp, memberGuild.id);
        emitGuildState(io, socketToUserId, memberGuild.id);
      }
    }
  } else {
    // Même jour : envoyer le niveau actuel
    socket.emit("degradation:update", { level: user.degradation ?? 0 });
  }
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
  const level = computeLevel(xp);
  const xpForNextLevel = 50 * (level + 1) * (level + 1);
  const xpToNext = xpForNextLevel - xp;
  const prevLevel = computeLevel(xp - xpGained);
  const levelUp = level > prevLevel;
  socket.emit("xp:update", { xp, level, xpToNext, levelUp });
  if (levelUp) {
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
  emoji: string;
  accent: number;
  floorTint: number;
  background: number;
  description: string;
  capacity: number;
  isPrivate: boolean;
  ownerId: string | null;
  ownerName: string | null;
  players: Map<string, Player>;
  sharedPomo: SharedPomoState & {
    intervalId: ReturnType<typeof setInterval> | null;
  };
  pomoParticipants: Set<string>;
  sharedVideo: VideoState;
}

function createPublicRoomState(id: PublicRoomId): RoomState {
  const meta = PUBLIC_ROOMS_META[id];
  return {
    id,
    name: meta.name,
    emoji: meta.emoji,
    accent: meta.accent,
    floorTint: meta.floorTint,
    background: meta.background,
    description: meta.description,
    capacity: MAX_PUBLIC_ROOM,
    isPrivate: false,
    ownerId: null,
    ownerName: null,
    players: new Map(),
    sharedPomo: {
      phase: "focus",
      remaining: DURATIONS["focus"],
      running: false,
      participants: 0,
      session: 0,
      intervalId: null,
    },
    pomoParticipants: new Set(),
    sharedVideo: {
      videoId: null,
      playing: false,
      timestamp: 0,
      syncedAt: 0,
      playbackRate: 1,
      ownerId: null,
      ownerName: "",
    },
  };
}

function createPrivateRoomState(
  id: RoomId,
  name: string,
  ownerId: string,
  ownerName: string,
): RoomState {
  return {
    id,
    name,
    emoji: PRIVATE_ROOM_THEME.emoji,
    accent: PRIVATE_ROOM_THEME.accent,
    floorTint: PRIVATE_ROOM_THEME.floorTint,
    background: PRIVATE_ROOM_THEME.background,
    description: `Room privée de ${ownerName}`,
    capacity: MAX_PRIVATE_ROOM,
    isPrivate: true,
    ownerId,
    ownerName,
    players: new Map(),
    sharedPomo: {
      phase: "focus",
      remaining: DURATIONS["focus"],
      running: false,
      participants: 0,
      session: 0,
      intervalId: null,
    },
    pomoParticipants: new Set(),
    sharedVideo: {
      videoId: null,
      playing: false,
      timestamp: 0,
      syncedAt: 0,
      playbackRate: 1,
      ownerId: null,
      ownerName: "",
    },
  };
}

const rooms: Map<RoomId, RoomState> = new Map();
for (const id of PUBLIC_ROOM_IDS) rooms.set(id, createPublicRoomState(id));

// Load private rooms from DB at boot
for (const row of sql.getAllPrivateRooms.all() as PrivateRoomRow[]) {
  const owner = sql.getUser.get(row.ownerId) as UserRow | undefined;
  const ownerName = owner?.displayName ?? "Invité";
  rooms.set(row.id, createPrivateRoomState(row.id, row.name, row.ownerId, ownerName));
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
          const currentDeg =
            (sql.getUser.get(userId) as UserRow).degradation ?? 0;
          if (currentDeg > 0) {
            const newDeg = currentDeg - 1;
            sql.setDegradation.run(newDeg, userId);
            io.to(sid).emit("degradation:update", { level: newDeg });
          }
          const memberGuild = sql.getUserGuild.get(userId) as
            | GuildRow
            | undefined;
          if (memberGuild) {
            const freshGuild = sql.getGuild.get(memberGuild.id) as GuildRow;
            const newBossHp = Math.max(0, freshGuild.bossHp - 15);
            sql.updateBossHp.run(newBossHp, freshGuild.id);
            if (newBossHp <= 0) {
              handleBossDefeat(io, freshGuild);
            } else {
              io.to(sid).emit("guild:boss-attacked", {
                damage: 15,
                newHp: newBossHp,
                maxHp: freshGuild.bossMaxHp,
              });
              emitGuildState(io, socketToUserId, freshGuild.id);
            }
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

function pomoState(room: RoomState): SharedPomoState {
  const sp = room.sharedPomo;
  return {
    phase: sp.phase,
    remaining: sp.remaining,
    running: sp.running,
    participants: sp.participants,
    session: sp.session,
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

function buildRoomSummaries(): RoomSummary[] {
  const out: RoomSummary[] = [];
  for (const r of rooms.values()) {
    out.push({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      accent: r.accent,
      floorTint: r.floorTint,
      background: r.background,
      description: r.description,
      capacity: r.capacity,
      count: r.players.size,
      isPrivate: r.isPrivate,
      ownerId: r.ownerId,
      ownerName: r.ownerName,
    });
  }
  return out;
}

function broadcastRoomsList(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
  io.emit("rooms:list", { rooms: buildRoomSummaries() });
}

io.on("connection", (socket) => {
  console.log(`[+] connected: ${socket.id}`);
  // Envoi initial de la liste des rooms (utile pour l'écran de sélection avant join)
  socket.emit("rooms:list", { rooms: buildRoomSummaries() });

  socket.on("join", ({ name, color, userId, roomId }) => {
    sql.upsertUser.run(userId);

    const requestedRoomId: RoomId = roomId ?? DEFAULT_ROOM_ID;
    const existingRoom = rooms.get(requestedRoomId);
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
        if (prevRoom.sharedVideo.ownerId === previousSocketId) {
          prevRoom.sharedVideo.videoId = null;
          prevRoom.sharedVideo.playing = false;
          prevRoom.sharedVideo.timestamp = 0;
          prevRoom.sharedVideo.ownerId = null;
          prevRoom.sharedVideo.ownerName = "";
          io.to(prevRoom.id).emit("video:update", { ...prevRoom.sharedVideo });
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
    const pendingTaskIds = (sql.getTasks.all(userId) as TaskRow[])
      .filter((r) => !r.done)
      .map((r) => r.id);
    const player: Player = {
      id: socket.id,
      name,
      color,
      col: spawnCol,
      row: spawnRow,
      state: "idle",
      coins: user.coins,
      hat: user.equippedHat ?? null,
      placed: placedFurnitureList,
      positions: furniturePositionsPayload,
      pendingTaskIds,
      look: userLook(user),
    };
    // Habbo-style : les meubles d'un joueur ne s'affichent QUE dans sa propre
    // room privée. Dans tout autre contexte (rooms publiques, room privée d'un
    // autre user), on strip placed/positions.
    const shouldHideFurniture = !(
      targetRoom.isPrivate && targetRoom.ownerId === userId
    );
    if (shouldHideFurniture) {
      player.placed = [];
      player.positions = {};
    }
    targetRoom.players.set(socket.id, player);
    socketToRoom.set(socket.id, targetRoomId);
    socketToUserId.set(socket.id, userId);
    socket.join(targetRoomId);
    sql.setAvatarInfo.run(name, color, userId);

    // Announce assigned room to the client first (so client can correct UI)
    socket.emit("room:info", { roomId: targetRoomId });
    // Broadcast to existing occupants
    socket.to(targetRoomId).emit("player-joined", player);
    // Send existing players to the newcomer
    const otherPlayers = Array.from(targetRoom.players.values()).filter(
      (p) => p.id !== socket.id,
    );
    socket.emit("room-state", otherPlayers);
    socket.emit("pomo:state", pomoState(targetRoom));
    console.log(`[join] ${name} → room:${targetRoomId} @ (${spawnCol},${spawnRow})`);

    // Per-user initial state (independent of room)
    const rows = sql.getTasks.all(userId) as TaskRow[];
    const tasks: Task[] = rows.map((r) => ({
      ...r,
      done: !!r.done,
      category: r.category ?? null,
      type: (r.type as "task" | "daily") ?? "task",
    }));
    socket.emit("tasks:state", { tasks, coins: user.coins });
    const xp = user.xp ?? 0;
    const level = computeLevel(xp);
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
    checkAndApplyDailyReset(socket, userId);
    broadcastLeaderboard(io, targetRoom);
    broadcastRoomsList(io);

    // Send current video state of this room to the newcomer
    const roomVideo = targetRoom.sharedVideo;
    if (roomVideo.videoId) {
      const elapsed = roomVideo.playing
        ? Date.now() / 1000 - roomVideo.syncedAt
        : 0;
      socket.emit("video:state", {
        ...roomVideo,
        timestamp: roomVideo.timestamp + elapsed * roomVideo.playbackRate,
        syncedAt: Date.now() / 1000,
      });
    }
  });

  // ── Room switch ──────────────────────────────────────────────────────────
  socket.on("room:switch", ({ roomId }) => {
    if (!allow(socket.id, "room:switch", 5, 10000)) return;
    const targetRoom = rooms.get(roomId);
    if (!targetRoom) return;
    const currentRoom = getRoom(socket.id);
    if (!currentRoom) return;
    if (currentRoom.id === roomId) return;
    if (targetRoom.players.size >= targetRoom.capacity) {
      socket.emit("room:full", { roomId });
      return;
    }
    const existing = currentRoom.players.get(socket.id);
    if (!existing) return;
    const userId = socketToUserId.get(socket.id);

    // Leave pomo participation if any
    if (currentRoom.pomoParticipants.delete(socket.id)) {
      currentRoom.sharedPomo.participants = currentRoom.pomoParticipants.size;
      if (currentRoom.pomoParticipants.size === 0 && currentRoom.sharedPomo.intervalId) {
        clearInterval(currentRoom.sharedPomo.intervalId);
        currentRoom.sharedPomo.intervalId = null;
        currentRoom.sharedPomo.running = false;
      }
    }

    // If owned video in old room, stop it for that room
    if (currentRoom.sharedVideo.ownerId === socket.id) {
      currentRoom.sharedVideo.videoId = null;
      currentRoom.sharedVideo.playing = false;
      currentRoom.sharedVideo.timestamp = 0;
      currentRoom.sharedVideo.ownerId = null;
      currentRoom.sharedVideo.ownerName = "";
      io.to(currentRoom.id).emit("video:update", { ...currentRoom.sharedVideo });
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
    const shouldHideFurniture = !(
      targetRoom.isPrivate && targetRoom.ownerId === userId
    );
    const rePlayer: Player = {
      ...existing,
      col: spawnCol,
      row: spawnRow,
      state: "idle",
      placed: shouldHideFurniture ? [] : existing.placed,
      positions: shouldHideFurniture ? {} : existing.positions,
    };
    targetRoom.players.set(socket.id, rePlayer);
    socketToRoom.set(socket.id, roomId);
    socket.join(roomId);

    socket.emit("room:info", { roomId });
    socket.to(roomId).emit("player-joined", rePlayer);
    const otherPlayers = Array.from(targetRoom.players.values()).filter(
      (p) => p.id !== socket.id,
    );
    socket.emit("room-state", otherPlayers);
    socket.emit("pomo:state", pomoState(targetRoom));
    broadcastLeaderboard(io, targetRoom);
    broadcastRoomsList(io);

    // Send target room's current video state
    const roomVideo = targetRoom.sharedVideo;
    if (roomVideo.videoId) {
      const elapsed = roomVideo.playing
        ? Date.now() / 1000 - roomVideo.syncedAt
        : 0;
      socket.emit("video:state", {
        ...roomVideo,
        timestamp: roomVideo.timestamp + elapsed * roomVideo.playbackRate,
        syncedAt: Date.now() / 1000,
      });
    } else {
      socket.emit("video:update", { ...roomVideo });
    }
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
    const ownerName = user.displayName ?? "Invité";
    rooms.set(roomId, createPrivateRoomState(roomId, trimmed, userId, ownerName));
    broadcastRoomsList(io);
    console.log(`[room:create-private] ${ownerName} → ${roomId} (${trimmed})`);
  });

  // ── Rooms privées : suppression (owner uniquement) ────────────────────────
  socket.on("room:delete-private", () => {
    if (!allow(socket.id, "room:delete-private", 3, 60000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const existing = sql.getPrivateRoomByOwner.get(userId) as
      | PrivateRoomRow
      | undefined;
    if (!existing) return;
    const room = rooms.get(existing.id);
    if (!room) return;
    // Déplacer tous les occupants vers la room par défaut
    const occupants = Array.from(room.players.keys());
    const fallback = rooms.get(DEFAULT_ROOM_ID)!;
    for (const sid of occupants) {
      const sock = io.sockets.sockets.get(sid);
      const p = room.players.get(sid);
      room.players.delete(sid);
      socket.to(room.id).emit("player-left", { id: sid });
      sock?.leave(room.id);
      if (!p || !sock) continue;
      // Ré-inscrire dans la room par défaut
      const movedPlayer: Player = {
        ...p,
        col: 1,
        row: 10,
        state: "idle",
        // meubles préservés puisque la room par défaut est publique
      };
      fallback.players.set(sid, movedPlayer);
      socketToRoom.set(sid, fallback.id);
      sock.join(fallback.id);
      sock.emit("private-room:deleted", {
        roomId: room.id,
        fallbackRoomId: fallback.id,
      });
      sock.emit("room:info", { roomId: fallback.id });
      sock.to(fallback.id).emit("player-joined", movedPlayer);
      const others = Array.from(fallback.players.values()).filter(
        (op) => op.id !== sid,
      );
      sock.emit("room-state", others);
    }
    rooms.delete(existing.id);
    sql.deletePrivateRoom.run(existing.id);
    broadcastLeaderboard(io, fallback);
    broadcastRoomsList(io);
    console.log(`[room:delete-private] ${existing.id}`);
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

  const VALID_EMOJIS = new Set(["👍", "🎉", "🔥", "❤️"]);
  socket.on("chat:react", ({ msgTs, emoji }) => {
    if (!allow(socket.id, "chat:react", 10, 5000)) return;
    if (!VALID_EMOJIS.has(emoji)) return;
    const p = getPlayer(socket.id);
    if (!p) return;
    emitToOwnRoom(io, socket.id, "chat:react", {
      msgTs,
      emoji,
      fromId: socket.id,
      fromColor: p.color,
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

  socket.on("private-message", ({ to, text }) => {
    if (!allow(socket.id, "private-message", 5, 5000)) return;
    const p = getPlayer(socket.id);
    if (!p) return;
    if (!getPlayer(to)) return;
    const safe = sanitize(text);
    if (!safe.trim()) return;
    io.to(to).emit("private-message", {
      from: socket.id,
      fromName: p.name,
      fromColor: p.color,
      text: safe,
      ts: Date.now(),
    });
  });

  // ── Tâches ───────────────────────────────────────────────────────────────
  socket.on("task:add", ({ userId, text, category, type }) => {
    if (!allow(socket.id, "task:add", 10, 10000)) return;
    const safe = sanitize(text);
    if (!safe.trim()) return;
    const safeCategory = VALID_CATEGORIES.has(category as string)
      ? category
      : null;
    const safeType: "task" | "daily" = type === "daily" ? "daily" : "task";
    sql.upsertUser.run(userId);
    const id = randomUUID();
    const createdAt = Date.now();
    sql.insertTask.run(id, userId, safe, createdAt, safeCategory, safeType);
    const task: Task = {
      id,
      userId,
      text: safe,
      done: false,
      createdAt,
      category: safeCategory,
      type: safeType,
    };
    socket.emit("task:added", task);
    const p = getPlayer(socket.id);
    if (p) {
      p.pendingTaskIds = [...(p.pendingTaskIds ?? []), id];
      broadcastToOwnRoom(socket,"tasks:public-update", {
        socketId: socket.id,
        taskIds: p.pendingTaskIds,
      });
    }
  });

  socket.on("task:toggle", ({ userId, taskId }) => {
    if (!allow(socket.id, "task:toggle", 20, 10000)) return;
    const row = sql.getTask.get(taskId, userId) as TaskRow | undefined;
    if (!row) return;
    const newDone = row.done ? 0 : 1;
    sql.updateTaskDone.run(newDone, taskId);
    const userRow = sql.getCoins.get(userId) as UserRow;
    let coins = userRow.coins;
    if (newDone === 1) {
      sql.addCoins.run(10, userId);
      coins += 10;
      // Bonus Feng Shui : +2🪙 par plante, +2🪙 par étagère
      const furnitureRow = sql.getFurniture.get(userId) as {
        ownedFurniture: string;
        placedFurniture: string;
      };
      const ownedFurniture = getEffectivePlaced(
        furnitureRow?.placedFurniture ?? "",
        furnitureRow?.ownedFurniture ?? "",
      );
      let fengBonus = 0;
      if (ownedFurniture.includes("plant")) fengBonus += 2;
      if (ownedFurniture.includes("bookshelf")) fengBonus += 2;
      if (ownedFurniture.includes("cactus")) fengBonus += 1;
      // Bonus Set Feng Shui
      const taskSetB = getSetBonuses(ownedFurniture);
      fengBonus += taskSetB.coinsTask;
      if (fengBonus > 0) {
        sql.addCoins.run(fengBonus, userId);
        coins += fengBonus;
      }
      if (ownedFurniture.includes("lamp")) {
        emitXpUpdate(socket, userId, 5); // +5 XP bonus par tâche avec lampe
      }
      const taskCount = (sql.countDoneTasks.get(userId) as { cnt: number }).cnt;
      if (taskCount === 1) tryUnlock(io, socket, userId, "first-task");
      if (taskCount >= 10) tryUnlock(io, socket, userId, "task-10");
      if (taskCount >= 50) tryUnlock(io, socket, userId, "task-50");
      if (coins >= 100) tryUnlock(io, socket, userId, "coins-100");
      if (coins >= 500) tryUnlock(io, socket, userId, "coins-500");
    } else {
      const newCoins = Math.max(0, coins - 10);
      sql.setCoins.run(newCoins, userId);
      coins = newCoins;
    }
    socket.emit("task:toggled", { taskId, done: !!newDone, coins });
    if (newDone === 1) {
      broadcastToOwnRoom(socket,"task:completed-public", { socketId: socket.id });
    }
    const p = getPlayer(socket.id);
    if (p) {
      p.coins = coins;
      if (newDone === 1) {
        p.pendingTaskIds = (p.pendingTaskIds ?? []).filter((id) => id !== taskId);
      } else {
        p.pendingTaskIds = [...(p.pendingTaskIds ?? []), taskId];
      }
      broadcastToOwnRoom(socket,"tasks:public-update", {
        socketId: socket.id,
        taskIds: p.pendingTaskIds,
      });
    }
    broadcastLeaderboardForSocket(io, socket.id);
  });

  socket.on("task:delete", ({ userId, taskId }) => {
    if (!allow(socket.id, "task:delete", 10, 10000)) return;
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

  socket.on("task:update", ({ userId, taskId, text, category }) => {
    if (!allow(socket.id, "task:update", 10, 10000)) return;
    const safe = sanitize(text);
    if (!safe.trim()) return;
    const row = sql.getTask.get(taskId, userId) as { id: string } | undefined;
    if (!row) return;
    const safeCategory = VALID_CATEGORIES.has(category as string)
      ? category
      : null;
    sql.updateTaskText.run(safe, safeCategory, taskId, userId);
    socket.emit("task:updated", { taskId, text: safe, category: safeCategory });
  });

  socket.on("position:save", ({ userId, col, row }) => {
    sql.upsertUser.run(userId);
    sql.savePosition.run(col, row, userId);
  });

  // ── Debug : forcer le déclenchement d'un achievement ─────────────────────
  socket.on("debug:unlock", ({ userId, key }) => {
    sql.insertAchievement.run(userId, ""); // no-op flush
    // Supprimer cet achievement pour permettre le re-déclenchement en debug
    db.prepare("DELETE FROM achievements WHERE userId = ? AND key = ?").run(
      userId,
      key,
    );
    tryUnlock(io, socket, userId, key);
  });

  // ── Debug : octroyer des XP ───────────────────────────────────────────────
  socket.on("debug:grant-xp", ({ userId, amount }) => {
    sql.upsertUser.run(userId);
    emitXpUpdate(socket, userId, amount);
  });

  // ── Debug : ajouter des pièces ────────────────────────────────────────────
  socket.on("debug:grant-coins", ({ userId, amount }) => {
    sql.upsertUser.run(userId);
    sql.addCoins.run(amount, userId);
    const coins = (sql.getCoins.get(userId) as UserRow).coins;
    socket.emit("coins:update", { coins });
  });

  // ── Debug : remettre les XP à zéro ───────────────────────────────────────
  socket.on("debug:reset-xp", ({ userId }) => {
    sql.upsertUser.run(userId);
    db.prepare("UPDATE users SET xp = 0 WHERE id = ?").run(userId);
    socket.emit("xp:update", { xp: 0, level: 0, xpToNext: 50, levelUp: false });
  });

  // ── Debug : forcer un niveau de dégradation ──────────────────────────────
  socket.on("debug:set-degradation", ({ userId, level }) => {
    sql.upsertUser.run(userId);
    const clamped = Math.max(0, Math.min(5, level));
    sql.setDegradation.run(clamped, userId);
    socket.emit("degradation:update", { level: clamped });
  });

  // ── Nettoyer la room (dépenser 50 pièces par niveau de dégradation) ───────
  socket.on("room:clean", ({ levels }) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const user = sql.getUser.get(userId) as UserRow;
    const level = user.degradation ?? 0;
    if (level === 0) return;
    const lvls = Math.max(1, Math.min(levels ?? 1, level)); // entre 1 et le niveau actuel
    // Feng Shui : Canapé réduit le coût de base de 10
    const cleanFurniture = getEffectivePlaced(
      user.placedFurniture ?? "",
      user.ownedFurniture ?? "",
    );
    const baseCost = cleanFurniture.includes("couch") ? 40 : 50;
    const cost = baseCost * lvls;
    if (user.coins < cost) return;
    sql.addCoins.run(-cost, userId);
    const newCoins = Math.max(0, user.coins - cost);
    const newDegradation = level - lvls;
    sql.setDegradation.run(newDegradation, userId);
    socket.emit("degradation:update", { level: newDegradation });
    socket.emit("coins:update", { coins: newCoins });
    const p = getPlayer(socket.id);
    if (p) p.coins = newCoins;
    broadcastLeaderboardForSocket(io, socket.id);
  });
  // ── Acheter un meuble (Feng Shui) ────────────────────────────────────────────────────
  socket.on("furniture:buy", ({ userId, itemId }) => {
    const item = FURNITURE_ITEMS.find((i) => i.id === itemId);
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
    if (p) {
      p.coins = newCoins;
      p.placed = newPlacedList;
      p.positions = buyPositionsPayload;
    }
    // Ne broadcast les meubles que si l'acheteur est dans sa propre room privée
    // (sinon personne ne doit les voir dans la scène)
    const r = getRoom(socket.id);
    if (r?.isPrivate && r.ownerId === userId) {
      broadcastToOwnRoom(socket, "furniture:player-update", {
        id: socket.id,
        placed: newPlacedList,
        positions: buyPositionsPayload,
      });
    }
    broadcastLeaderboardForSocket(io, socket.id);
  });
  // ── Déplacer un meuble (Feng Shui) ─────────────────────────────────────────────
  socket.on("furniture:move", ({ userId, itemId, col, row }) => {
    if (!allow(socket.id, "furniture:move", 20, 5000)) return;
    const r = getRoom(socket.id);
    if (!r?.isPrivate || r.ownerId !== userId) return; // Placement uniquement dans sa propre room privée
    const item = FURNITURE_ITEMS.find((i) => i.id === itemId);
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
    const mp = getPlayer(socket.id);
    if (mp) {
      mp.placed = movedPlaced;
      mp.positions = movedPositionsPayload;
    }
    broadcastToOwnRoom(socket,"furniture:player-update", {
      id: socket.id,
      placed: movedPlaced,
      positions: movedPositionsPayload,
    });
  });
  // ── Ranger / Sortir un meuble de la chambre (toggle-place) ───────────────────
  socket.on("furniture:toggle-place", ({ userId, itemId }) => {
    if (!allow(socket.id, "furniture:toggle-place", 20, 5000)) return;
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
    const tp = getPlayer(socket.id);
    if (tp) {
      tp.placed = newPlaced;
      tp.positions = togglePositionsPayload;
    }
    broadcastToOwnRoom(socket,"furniture:player-update", {
      id: socket.id,
      placed: newPlaced,
      positions: togglePositionsPayload,
    });
  });
  // ── Confirmer le placement fantôme d'un meuble ─────────────────────────────
  socket.on("furniture:place", ({ userId, itemId, col, row }) => {
    if (!allow(socket.id, "furniture:place", 20, 5000)) return;
    const r = getRoom(socket.id);
    if (!r?.isPrivate || r.ownerId !== userId) return;
    const item = FURNITURE_ITEMS.find((i) => i.id === itemId);
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
    const pp = getPlayer(socket.id);
    if (pp) {
      pp.placed = newPlacedAfter;
      pp.positions = placePositionsPayload;
    }
    broadcastToOwnRoom(socket,"furniture:player-update", {
      id: socket.id,
      placed: newPlacedAfter,
      positions: placePositionsPayload,
    });
  });
  // ── Acheter un item dans le shop ─────────────────────────────────────────────
  socket.on("shop:buy", ({ userId, itemId }) => {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
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
  socket.on("cosmetic:equip", ({ userId, hatId }) => {
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
  socket.on("look:update", ({ userId, look: rawLook }) => {
    if (!allow(socket.id, "look:update", 5, 5000)) return;
    if (socketToUserId.get(socket.id) !== userId) return;
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
  socket.on("pomodoro:complete", ({ userId }) => {
    if (!allow(socket.id, "pomodoro:complete", 2, 30000)) return;
    sql.upsertUser.run(userId);
    const STREAK_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 heures
    const now = Date.now();
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
    // Dégradation : un pomo nettoit un niveau
    const currentDeg = (sql.getUser.get(userId) as UserRow).degradation ?? 0;
    if (currentDeg > 0) {
      const newDeg = currentDeg - 1;
      sql.setDegradation.run(newDeg, userId);
      socket.emit("degradation:update", { level: newDeg });
    }
    // Boss de guilde : un pomo personnel inflige 10 dégâts au boss
    const memberGuild = sql.getUserGuild.get(userId) as GuildRow | undefined;
    if (memberGuild) {
      const newBossHp = Math.max(0, memberGuild.bossHp - 10);
      sql.updateBossHp.run(newBossHp, memberGuild.id);
      if (newBossHp <= 0) {
        handleBossDefeat(io, memberGuild);
      } else {
        socket.emit("guild:boss-attacked", {
          damage: 10,
          newHp: newBossHp,
          maxHp: memberGuild.bossMaxHp,
        });
      }
      emitGuildState(io, socketToUserId, memberGuild.id);
    }
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

  // ── Video ambiance (par room) ────────────────────────────────────────────
  socket.on("video:set", ({ videoId }) => {
    if (!allow(socket.id, "video:set", 5, 10000)) return;
    const room = getRoom(socket.id);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;
    room.sharedVideo.videoId = videoId;
    room.sharedVideo.playing = true;
    room.sharedVideo.timestamp = 0;
    room.sharedVideo.syncedAt = Date.now() / 1000;
    room.sharedVideo.playbackRate = 1;
    room.sharedVideo.ownerId = socket.id;
    room.sharedVideo.ownerName = p.name;
    io.to(room.id).emit("video:update", { ...room.sharedVideo });
    console.log(`[video] ${p.name} set video in room:${room.id}: ${videoId}`);
  });

  socket.on("video:sync", ({ timestamp, playing, rate }) => {
    const room = getRoom(socket.id);
    if (!room) return;
    if (room.sharedVideo.ownerId !== socket.id) return;
    room.sharedVideo.timestamp = Math.max(0, timestamp);
    room.sharedVideo.playing = playing;
    room.sharedVideo.playbackRate = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].includes(rate) ? rate : 1;
    room.sharedVideo.syncedAt = Date.now() / 1000;
    socket.to(room.id).emit("video:update", { ...room.sharedVideo });
  });

  socket.on("video:stop", () => {
    const room = getRoom(socket.id);
    if (!room) return;
    if (room.sharedVideo.ownerId !== socket.id) return;
    room.sharedVideo.videoId = null;
    room.sharedVideo.playing = false;
    room.sharedVideo.timestamp = 0;
    room.sharedVideo.ownerId = null;
    room.sharedVideo.ownerName = "";
    io.to(room.id).emit("video:update", { ...room.sharedVideo });
    console.log(`[video] stopped in room:${room.id} by ${socket.id}`);
  });

  socket.on("disconnect", () => {
    cleanRateLimit(socket.id);
    const room = getRoom(socket.id);
    if (room) {
      if (room.sharedVideo.ownerId === socket.id) {
        room.sharedVideo.videoId = null;
        room.sharedVideo.playing = false;
        room.sharedVideo.timestamp = 0;
        room.sharedVideo.ownerId = null;
        room.sharedVideo.ownerName = "";
        io.to(room.id).emit("video:update", { ...room.sharedVideo });
      }
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
    socketToUserId.delete(socket.id);
    console.log(`[-] disconnected: ${socket.id}`);
  });

  // ── Admin ─────────────────────────────────────────────────────────────────
  function isAdmin(): boolean {
    const uid = socketToUserId.get(socket.id);
    if (!uid) return false;
    const u = sql.getUser.get(uid) as UserRow | undefined;
    return !!u?.isAdmin || (!!ADMIN_EMAIL && u?.email === ADMIN_EMAIL);
  }

  socket.on("admin:give-coins", ({ targetUserId, amount }) => {
    if (!isAdmin()) return;
    if (amount <= 0 || amount > 100_000) return;
    sql.upsertUser.run(targetUserId);
    sql.addCoins.run(amount, targetUserId);
    const user = sql.getUser.get(targetUserId) as UserRow;
    for (const [sid, uid] of socketToUserId.entries()) {
      if (uid === targetUserId) {
        io.to(sid).emit("coins:update", { coins: user.coins });
        const p = getPlayer(sid);
        if (p) p.coins = user.coins;
        break;
      }
    }
    broadcastLeaderboardForSocket(io, socket.id);
  });

  socket.on("admin:give-xp", ({ targetUserId, xp: amount }) => {
    if (!isAdmin()) return;
    if (amount <= 0 || amount > 1_000_000) return;
    sql.upsertUser.run(targetUserId);
    for (const [sid, uid] of socketToUserId.entries()) {
      if (uid === targetUserId) {
        const sock = io.sockets.sockets.get(sid) as
          | Socket<ClientToServerEvents, ServerToClientEvents>
          | undefined;
        if (sock) emitXpUpdate(sock, targetUserId, amount);
        break;
      }
    }
    // If user is offline, just add XP to DB
    sql.addXp.run(amount, targetUserId);
  });

  socket.on("admin:set-degradation", ({ targetUserId, level }) => {
    if (!isAdmin()) return;
    const lvl = Math.max(0, Math.min(5, level));
    sql.upsertUser.run(targetUserId);
    sql.setDegradation.run(lvl, targetUserId);
    for (const [sid, uid] of socketToUserId.entries()) {
      if (uid === targetUserId) {
        io.to(sid).emit("degradation:update", { level: lvl });
        break;
      }
    }
  });

  socket.on("admin:announce", ({ message }) => {
    if (!isAdmin()) return;
    const safe = message
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
    if (!safe.trim()) return;
    io.emit("admin:announce", { message: safe });
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
    const lvl = computeLevel(xp);
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
      degradation: user.degradation ?? 0,
      achievements: achievementKeys,
      isAdmin: !!user.isAdmin,
    });
  });

  // ── Guildes ───────────────────────────────────────────────────────────────
  socket.on("guild:create", ({ name }) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    // Valider le nom
    const trimmed = name.trim().slice(0, 30);
    if (!trimmed) return;
    // Vérifier que l'user n'est déjà dans une guilde
    const existing = sql.getUserGuild.get(userId) as GuildRow | undefined;
    if (existing) return;
    // Vérifier unicité du nom
    if (sql.getGuildByName.get(trimmed)) return;
    const guildId = randomUUID();
    sql.insertGuild.run(guildId, trimmed, userId, Date.now());
    sql.insertGuildMember.run(userId, guildId);
    emitGuildState(io, socketToUserId, guildId);
  });

  socket.on("guild:join", ({ guildId }) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    // Vérifier que l'user n'est pas déjà dans une guilde
    const existing = sql.getUserGuild.get(userId) as GuildRow | undefined;
    if (existing) return;
    const guild = sql.getGuild.get(guildId) as GuildRow | undefined;
    if (!guild) return;
    sql.insertGuildMember.run(userId, guildId);
    emitGuildState(io, socketToUserId, guildId);
  });

  socket.on("guild:leave", () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const guild = sql.getUserGuild.get(userId) as GuildRow | undefined;
    if (!guild) return;
    sql.deleteGuildMember.run(userId);
    const remaining = (sql.countGuildMembers.get(guild.id) as { cnt: number })
      .cnt;
    if (remaining === 0) {
      // Dissoudre la guilde
      sql.deleteGuild.run(guild.id);
    } else if (guild.ownerId === userId) {
      // Transférer la propriété au premier membre restant
      const [nextMember] = sql.getGuildMemberIds.all(guild.id) as {
        userId: string;
      }[];
      if (nextMember) sql.transferGuildOwner.run(nextMember.userId, guild.id);
      emitGuildState(io, socketToUserId, guild.id);
    } else {
      emitGuildState(io, socketToUserId, guild.id);
    }
    // Émettre une guilde vide au joueur qui part
    socket.emit("guild:state", {
      id: "",
      name: "",
      ownerId: "",
      level: 0,
      bossHp: 0,
      bossMaxHp: 100,
      bossLevel: 1,
      bossDefeated: 0,
      members: [],
    } as GuildData);
  });

  socket.on("guild:state-request", () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const guild = sql.getUserGuild.get(userId) as GuildRow | undefined;
    if (!guild) return;
    emitGuildState(io, socketToUserId, guild.id);
  });
});

// ── Feedback (bug report / feature idea) → GitHub Issues ─────────────────────
app.post("/api/feedback", async (req, res): Promise<void> => {
  const { type, title, description, userName } = req.body as {
    type?: string;
    title?: string;
    description?: string;
    userName?: string;
  };

  if (!title || !description) {
    res.status(400).json({ error: "title et description requis" });
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    res.status(503).json({ error: "GitHub token non configuré" });
    return;
  }

  const typeLabel = type === "bug" ? "bug" : "enhancement";
  const typeEmoji = type === "bug" ? "🐛" : "💡";
  const issueTitle = `${typeEmoji} ${title}`;
  const issueBody = [
    `**Type** : ${type === "bug" ? "Bug report" : "Idée / Feature"}`,
    `**Soumis par** : ${userName ?? "Anonyme"}`,
    ``,
    `### Description`,
    description,
    ``,
    `---`,
    `*Soumis depuis l'application GamiTask*`,
  ].join("\n");

  try {
    const response = await fetch(
      "https://api.github.com/repos/GMaxDev/gamiTask/issues",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: [typeLabel],
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("[feedback] GitHub API error:", err);
      res.status(502).json({ error: "GitHub API error" });
      return;
    }

    const issue = (await response.json()) as {
      number: number;
      html_url: string;
    };
    res.json({ number: issue.number, url: issue.html_url });
  } catch (e) {
    console.error("[feedback] Fetch error:", e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
httpServer.listen(PORT, () => {
  console.log(`[+] Server running on port ${PORT}`);
});
