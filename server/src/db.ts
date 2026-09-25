import Database from "better-sqlite3";
import { SHOP_ITEMS, FURNITURE_ITEMS, type Task, type ChecklistItem } from "./types.js";
import { cleanKind, cleanDifficulty, cleanChecklist } from "./scoring.js";
import type { Role } from "./auth.js";
import type { CatalogItem } from "./catalog.js";
import { seal, isSealed } from "./secretbox.js";
import { DB_PATH, TOKEN_KEY } from "./config.js";

// ── Base de données SQLite ───────────────────────────────────────────────────
export interface UserRow {
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
export interface TaskRow {
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
  focusCount: number;
}

export const db = new Database(DB_PATH);
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
for (const col of [
  "users ADD COLUMN streak INTEGER NOT NULL DEFAULT 0",
  "users ADD COLUMN lastPomoAt INTEGER NOT NULL DEFAULT 0",
  "tasks ADD COLUMN category TEXT",
  "tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'task'",
  "users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0",
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
  "users ADD COLUMN lastDailyResetAt INTEGER NOT NULL DEFAULT 0",
  "users ADD COLUMN ownedItems TEXT NOT NULL DEFAULT ''",
  "users ADD COLUMN equippedHat TEXT",
  "users ADD COLUMN ownedFurniture TEXT NOT NULL DEFAULT ''",
  "users ADD COLUMN furniturePositions TEXT NOT NULL DEFAULT '{}'",
  "users ADD COLUMN email TEXT",
  "users ADD COLUMN googleId TEXT",
  "users ADD COLUMN displayName TEXT",
  "users ADD COLUMN look TEXT",
  "users ADD COLUMN avatarColor INTEGER NOT NULL DEFAULT 0",
  "users ADD COLUMN isAdmin INTEGER NOT NULL DEFAULT 0",
  "users ADD COLUMN twitchId TEXT",
  "users ADD COLUMN twitchLogin TEXT",
  "users ADD COLUMN twitchDisplayName TEXT",
  "users ADD COLUMN twitchAccessToken TEXT",
  "users ADD COLUMN twitchRefreshToken TEXT",
  "users ADD COLUMN twitchTokenExpiresAt INTEGER NOT NULL DEFAULT 0",
  "tasks ADD COLUMN focusCount INTEGER NOT NULL DEFAULT 0",
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
export const sqlWaitlist = db.prepare("INSERT OR IGNORE INTO waitlist (email, createdAt) VALUES (?, ?)");

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

export const sql = {
  upsertUser: db.prepare(
    "INSERT OR IGNORE INTO users (id, coins) VALUES (?, 0)",
  ),
  getUser: db.prepare(
    "SELECT id, coins, streak, lastPomoAt, xp, lastDailyResetAt, ownedItems, equippedHat, ownedFurniture, furniturePositions, placedFurniture, displayName, avatarColor, role, look, email, googleId, twitchId, twitchLogin, twitchDisplayName, energy, exhaustedUntil, tzOffset FROM users WHERE id = ?",
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
  bumpFocusCount: db.prepare("UPDATE tasks SET focusCount = focusCount + 1 WHERE id = ? AND userId = ?"),
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
    "INSERT INTO users (id, coins, email, googleId, displayName, avatarColor) VALUES (?, 0, ?, ?, ?, 0)",
  ),
  updateGoogleAuth: db.prepare(
    "UPDATE users SET email = ?, displayName = COALESCE(NULLIF(displayName, ''), ?) WHERE id = ?",
  ),
  setAdminFlag: db.prepare("UPDATE users SET role = 'admin' WHERE id = ?"),
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

export function rowToTask(r: TaskRow): Task {
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
    focusCount: r.focusCount ?? 0,
  };
}
export function taskToRow(t: Task): TaskRow {
  return {
    ...t,
    done: t.done ? 1 : 0,
    up: t.up ? 1 : 0,
    down: t.down ? 1 : 0,
    checklist: JSON.stringify(t.checklist),
  };
}
export function userTasks(userId: string): Task[] {
  return (sql.getTasks.all(userId) as TaskRow[]).map(rowToTask);
}
/** Ce que les autres voient sur les ardoises : à-faire ouverts, quotidiennes pas encore cochées, toutes les habitudes. */
export const isPending = (t: Task): boolean => t.kind === "habit" || !t.done;

export interface PrivateRoomRow {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}

// Editor-made items live in `items`; the built-in lists stay the code's. One lookup serves the shop, the room and the hats.
export const catalogItems = (): CatalogItem[] => (sql.listItems.all() as { data: string }[]).map((r) => JSON.parse(r.data) as CatalogItem);
export const catalogItem = (id: string): CatalogItem | null => { const r = sql.getItem.get(id) as { data: string } | undefined; return r ? (JSON.parse(r.data) as CatalogItem) : null; };
export const hatItem = (id: string) => SHOP_ITEMS.find((i) => i.id === id) ?? (catalogItem(id)?.kind === "hat" ? catalogItem(id) : null);
export const furnitureItem = (id: string) => FURNITURE_ITEMS.find((i) => i.id === id) ?? (catalogItem(id)?.kind === "furniture" ? catalogItem(id) : null);

/** Construit le payload positions pour furniture:state (defaults FURNITURE_ITEMS + overrides DB) */
export function getFurniturePosPayload(
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

// Rows written before the key existed: seal them once, now.
{
  const legacy = db.prepare("SELECT id, twitchAccessToken, twitchRefreshToken FROM users WHERE twitchRefreshToken IS NOT NULL").all() as { id: string; twitchAccessToken: string | null; twitchRefreshToken: string }[];
  const sealRow = db.prepare("UPDATE users SET twitchAccessToken = ?, twitchRefreshToken = ? WHERE id = ?");
  let n = 0;
  for (const r of legacy) if (!isSealed(r.twitchRefreshToken)) { sealRow.run(r.twitchAccessToken && seal(r.twitchAccessToken, TOKEN_KEY), seal(r.twitchRefreshToken, TOKEN_KEY), r.id); n++; }
  if (n) console.log(`[config] sealed ${n} Twitch token row(s) that were stored in clear`);
}
