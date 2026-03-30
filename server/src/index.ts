import 'dotenv/config';
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
  type Player,
  type Task,
  type SharedPomoState,
  type PomodoroPhase,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type GuildData,
} from "./types.js";

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

const db = new Database("./data.db");
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
  db.exec(`ALTER TABLE users ADD COLUMN degradation INTEGER NOT NULL DEFAULT 0`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN lastDailyResetAt INTEGER NOT NULL DEFAULT 0`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN ownedItems TEXT NOT NULL DEFAULT ''`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN equippedHat TEXT`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN ownedFurniture TEXT NOT NULL DEFAULT ''`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN furniturePositions TEXT NOT NULL DEFAULT '{}'`);
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
  db.exec(`ALTER TABLE users ADD COLUMN avatarColor INTEGER NOT NULL DEFAULT 0`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN isAdmin INTEGER NOT NULL DEFAULT 0`);
} catch {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN placedFurniture TEXT NOT NULL DEFAULT ''`);
  db.exec(`UPDATE users SET placedFurniture = ownedFurniture WHERE placedFurniture = '' AND ownedFurniture != ''`);
} catch {}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_googleId ON users(googleId) WHERE googleId IS NOT NULL`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`);

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

const sql = {
  upsertUser: db.prepare(
    "INSERT OR IGNORE INTO users (id, coins) VALUES (?, 0)",
  ),
  getUser: db.prepare(
    "SELECT id, coins, col, row, streak, lastPomoAt, xp, degradation, lastDailyResetAt, ownedItems, equippedHat, ownedFurniture, furniturePositions, placedFurniture, displayName, avatarColor, isAdmin FROM users WHERE id = ?",
  ),
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
  setOwnedFurniture: db.prepare("UPDATE users SET ownedFurniture = ? WHERE id = ?"),
  setFurniturePositions: db.prepare("UPDATE users SET furniturePositions = ? WHERE id = ?"),
  setPlacedFurniture: db.prepare("UPDATE users SET placedFurniture = ? WHERE id = ?"),
  getFurniture: db.prepare("SELECT ownedFurniture, placedFurniture FROM users WHERE id = ?"),
  setAvatarInfo: db.prepare("UPDATE users SET displayName = ?, avatarColor = ? WHERE id = ?"),
  getUserByGoogleId: db.prepare("SELECT * FROM users WHERE googleId = ?"),
  insertGoogleUser: db.prepare(
    "INSERT INTO users (id, coins, email, googleId, displayName, avatarColor, isAdmin) VALUES (?, 0, ?, ?, ?, 0, ?)",
  ),
  updateGoogleAuth: db.prepare(
    "UPDATE users SET email = ?, displayName = ? WHERE id = ?",
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
  getGuildMemberIds: db.prepare("SELECT userId FROM guild_members WHERE guildId = ?"),
  getUserGuild: db.prepare(
    "SELECT g.* FROM guilds g JOIN guild_members gm ON gm.guildId = g.id WHERE gm.userId = ?",
  ),
  insertGuildMember: db.prepare("INSERT OR IGNORE INTO guild_members (userId, guildId) VALUES (?, ?)"),
  deleteGuildMember: db.prepare("DELETE FROM guild_members WHERE userId = ?"),
  deleteGuildMembers: db.prepare("DELETE FROM guild_members WHERE guildId = ?"),
  updateBossHp: db.prepare("UPDATE guilds SET bossHp = ? WHERE id = ?"),
  defeatBoss: db.prepare(
    "UPDATE guilds SET bossHp = ?, bossMaxHp = ?, bossLevel = ?, bossDefeated = bossDefeated + 1 WHERE id = ?",
  ),
  transferGuildOwner: db.prepare("UPDATE guilds SET ownerId = ? WHERE id = ?"),
  countGuildMembers: db.prepare("SELECT COUNT(*) as cnt FROM guild_members WHERE guildId = ?"),
};

/** Calcule le niveau à partir des XP totaux. Formule : level = floor(sqrt(xp / 50)) */
function computeLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 50));
}

interface GuildRow {
  id: string; name: string; ownerId: string; level: number;
  bossHp: number; bossMaxHp: number; bossLevel: number; bossDefeated: number; createdAt: number;
}
interface GuildMemberRow { userId: string; name: string; color: number; }

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
  socketToUserId: Map<string, string>,
  players: Map<string, Player & { coins?: number }>,
  guild: GuildRow,
): void {
  const newBossLevel = guild.bossLevel + 1;
  const newBossMaxHp = 100 * newBossLevel;
  sql.defeatBoss.run(newBossMaxHp, newBossMaxHp, newBossLevel, guild.id);
  const reward = 50 * guild.bossLevel;
  const memberIds = (sql.getGuildMemberIds.all(guild.id) as { userId: string }[]).map((m) => m.userId);
  for (const userId of memberIds) {
    sql.addCoins.run(reward, userId);
    const newCoins = (sql.getCoins.get(userId) as UserRow).coins;
    for (const [socketId, uid] of socketToUserId.entries()) {
      if (uid === userId) {
        io.to(socketId).emit("coins:update", { coins: newCoins });
        io.to(socketId).emit("guild:boss-defeated", { bossLevel: guild.bossLevel, reward });
        const p = players.get(socketId);
        if (p) p.coins = newCoins;
        break;
      }
    }
  }
}

/** Construit le payload positions pour furniture:state (defaults FURNITURE_ITEMS + overrides DB) */
function getFurniturePosPayload(furniturePosJson: string): Record<string, { col: number; row: number }> {
  const saved = JSON.parse(furniturePosJson || "{}") as Record<string, { col: number; row: number }>;
  const out: Record<string, { col: number; row: number }> = {};
  for (const item of FURNITURE_ITEMS) {
    out[item.id] = saved[item.id] ?? { col: item.col, row: item.row };
  }
  return out;
}

/** Retourne les meubles effectivement placés dans la chambre (avec fallback pour migration) */
function getEffectivePlaced(placedFurniture: string, ownedFurniture: string): string[] {
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
  if (!credential) { res.status(400).json({ error: "Missing credential" }); return; }
  if (!GOOGLE_CLIENT_ID) { res.status(500).json({ error: "Server misconfigured: GOOGLE_CLIENT_ID not set" }); return; }
  try {
    const ticket = await googleOAuthClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload()!;
    const googleId = payload.sub;
    const email = payload.email ?? null;
    const googleName = payload.name ?? email ?? "User";
    const isAdminLogin = !!ADMIN_EMAIL && email === ADMIN_EMAIL;
    let user = sql.getUserByGoogleId.get(googleId) as UserRow | undefined;
    let userId: string;
    if (!user) {
      userId = randomUUID();
      sql.insertGoogleUser.run(userId, email, googleId, googleName, isAdminLogin ? 1 : 0);
      user = sql.getUserByGoogleId.get(googleId) as UserRow;
    } else {
      userId = user.id;
      sql.updateGoogleAuth.run(email, googleName, userId);
      if (isAdminLogin && !user.isAdmin) sql.setAdminFlag.run(1, userId);
      user = sql.getUserByGoogleId.get(googleId) as UserRow;
    }
    const token = jwt.sign({ userId, googleId }, JWT_SECRET, { expiresIn: "30d" });
    res.json({
      userId,
      token,
      name: user.displayName ?? googleName,
      color: user.avatarColor ?? 0,
      isAdmin: isAdminLogin || !!(user.isAdmin),
    });
  } catch (err) {
    console.error("[auth/google]", err);
    res.status(401).json({ error: "Invalid Google credential" });
  }
});

app.post("/auth/token", (req, res): void => {
  const { token } = req.body as { token?: string };
  if (!token) { res.status(400).json({ error: "Missing token" }); return; }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = sql.getUser.get(decoded.userId) as UserRow | undefined;
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const isAdmin = !!ADMIN_EMAIL && user.email === ADMIN_EMAIL || !!(user.isAdmin);
    res.json({
      userId: user.id,
      token,
      name: user.displayName ?? "",
      color: user.avatarColor ?? 0,
      isAdmin,
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
        const attackHp = Math.min(memberGuild.bossMaxHp, memberGuild.bossHp + cnt * 5);
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
function getSetBonuses(owned: string[]): { xpPomo: number; coinsPomo: number; coinsTask: number } {
  const b = { xpPomo: 0, coinsPomo: 0, coinsTask: 0 };
  for (const set of FURNITURE_SETS) {
    if (set.items.every((id) => owned.includes(id))) {
      b.xpPomo    += set.xpPomoBonus    ?? 0;
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
    const p = players.get(socket.id);
    socket.broadcast.emit("level-up:public", {
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
  { key: "first-task",       label: "1ère tâche !",    desc: "Première tâche complétée",          icon: "✅" },
  { key: "task-10",          label: "10 tâches !",      desc: "10 tâches complétées",              icon: "🔟" },
  { key: "task-50",          label: "50 tâches !",      desc: "50 tâches complétées",              icon: "🏆" },
  { key: "first-pomo",       label: "1er Pomodoro !",   desc: "Premier pomodoro terminé",          icon: "🍅" },
  { key: "streak-5",         label: "Streak ×5 !",      desc: "5 pomodoros consécutifs",           icon: "🔥" },
  { key: "coins-100",        label: "100 pièces !",     desc: "100 pièces accumulées",             icon: "💰" },
  { key: "coins-500",        label: "500 pièces !",     desc: "500 pièces accumulées",             icon: "👑" },
  { key: "first-collective", label: "Pomo collectif !", desc: "Premier pomo collectif terminé",    icon: "🌐" },
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
  socket.broadcast.emit("achievement:public", {
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

const sharedPomo: SharedPomoState & {
  intervalId: ReturnType<typeof setInterval> | null;
} = {
  phase: "focus",
  remaining: DURATIONS["focus"],
  running: false,
  participants: 0,
  session: 0,
  intervalId: null,
};
const pomoParticipants = new Set<string>();

function pomoTick(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
  if (sharedPomo.remaining <= 1) {
    // Avancer de phase
    let nextPhase: PomodoroPhase;
    let nextSession = sharedPomo.session;
    if (sharedPomo.phase === "focus") {
      nextSession += 1;
      nextPhase = nextSession % 4 === 0 ? "long-break" : "short-break";
      // Récompenser tous les participants collectifs avec +25 pièces
      for (const sid of pomoParticipants) {
        const userId = socketToUserId.get(sid);
        if (userId) {
          sql.upsertUser.run(userId);
          sql.addCoins.run(25, userId);
          const coins = (sql.getCoins.get(userId) as UserRow).coins;
          io.to(sid).emit("coins:update", { coins });
          const cp = players.get(sid);
          if (cp) cp.coins = coins;
          const sock = io.sockets.sockets.get(sid) as
            | Socket<ClientToServerEvents, ServerToClientEvents>
            | undefined;
          if (sock) {
            tryUnlock(io, sock, userId, "first-collective");
            if (coins >= 100) tryUnlock(io, sock, userId, "coins-100");
            if (coins >= 500) tryUnlock(io, sock, userId, "coins-500");
            // XP : +75 par pomo collectif terminé
            emitXpUpdate(sock, userId, 75);
          }
          // Nettoyage coopératif : le pomo collectif réduit la dégradation de chaque participant
          const currentDeg = (sql.getUser.get(userId) as UserRow).degradation ?? 0;
          if (currentDeg > 0) {
            const newDeg = currentDeg - 1;
            sql.setDegradation.run(newDeg, userId);
            io.to(sid).emit("degradation:update", { level: newDeg });
          }
          // Boss de guilde : pomo collectif inflige 15 dégâts au boss
          const memberGuild = sql.getUserGuild.get(userId) as GuildRow | undefined;
          if (memberGuild) {
            const freshGuild = sql.getGuild.get(memberGuild.id) as GuildRow;
            const newBossHp = Math.max(0, freshGuild.bossHp - 15);
            sql.updateBossHp.run(newBossHp, freshGuild.id);
            if (newBossHp <= 0) {
              handleBossDefeat(io, socketToUserId, players, freshGuild);
            } else {
              io.to(sid).emit("guild:boss-attacked", { damage: 15, newHp: newBossHp, maxHp: freshGuild.bossMaxHp });
              emitGuildState(io, socketToUserId, freshGuild.id);
            }
          }
        }
      }
      broadcastLeaderboard(io);
    } else {
      nextPhase = "focus";
    }
    sharedPomo.phase = nextPhase;
    sharedPomo.remaining = DURATIONS[nextPhase];
    sharedPomo.session = nextSession;
    sharedPomo.running = false;
    if (sharedPomo.intervalId) {
      clearInterval(sharedPomo.intervalId);
      sharedPomo.intervalId = null;
    }
    // Notifier tous les participants
    for (const sid of pomoParticipants) {
      io.to(sid).emit("pomo:phase", {
        phase: nextPhase,
        remaining: sharedPomo.remaining,
        session: nextSession,
      });
    }
  } else {
    sharedPomo.remaining -= 1;
    for (const sid of pomoParticipants) {
      io.to(sid).emit("pomo:tick", {
        remaining: sharedPomo.remaining,
        phase: sharedPomo.phase,
        session: sharedPomo.session,
      });
    }
  }
}

function startPomoIfNeeded(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
  if (!sharedPomo.running && pomoParticipants.size > 0) {
    sharedPomo.running = true;
    sharedPomo.intervalId = setInterval(() => pomoTick(io), 1000);
  }
}

// ── HTTP + Socket.IO ─────────────────────────────────────────────────────────
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] },
});

// Room state — single room for MVP
const players = new Map<string, Player>();
const socketToUserId = new Map<string, string>();

function broadcastLeaderboard(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
  const entries = Array.from(players.values())
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      coins: p.coins ?? 0,
      state: p.state,
    }))
    .sort((a, b) => b.coins - a.coins);
  io.emit("leaderboard-update", entries);
}

io.on("connection", (socket) => {
  console.log(`[+] connected: ${socket.id}`);

  // Send current room state to the newcomer
  socket.emit("room-state", Array.from(players.values()));

  socket.on("join", ({ name, color, userId }) => {
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    // Spawn toujours au point d'entrée fixe — la position persistée est ignorée au login
    const spawnCol = 1;
    const spawnRow = 10;
    const player: Player = {
      id: socket.id,
      name,
      color,
      col: spawnCol,
      row: spawnRow,
      state: "idle",
      coins: user.coins,
      hat: user.equippedHat ?? null,
    };
    players.set(socket.id, player);
    socketToUserId.set(socket.id, userId);
    // Persister le pseudo + couleur choisis au join (utile pour les comptes Google)
    sql.setAvatarInfo.run(name, color, userId);
    socket.broadcast.emit("player-joined", player);
    console.log(`[join] ${name} @ (${spawnCol},${spawnRow})`);

    // Envoyer ses tâches + pièces + position sauvegardée
    const rows = sql.getTasks.all(userId) as TaskRow[];
    const tasks: Task[] = rows.map((r) => ({
      ...r,
      done: !!r.done,
      category: r.category ?? null,
      type: (r.type as "task" | "daily") ?? "task",
    }));
    socket.emit("tasks:state", { tasks, coins: user.coins });
    // Envoyer l'état XP initial
    const xp = user.xp ?? 0;
    const level = computeLevel(xp);
    const xpToNext = 50 * (level + 1) * (level + 1) - xp;
    socket.emit("xp:update", { xp, level, xpToNext, levelUp: false });
    // Envoyer l'état cosmétiques initial
    const ownedList = (user.ownedItems ?? "").split(",").filter(Boolean);
    socket.emit("cosmetics:state", { owned: ownedList, equippedHat: user.equippedHat ?? null });
    // Envoyer l'état mobilier initial
    const ownedFurnitureList = (user.ownedFurniture ?? "").split(",").filter(Boolean);
    const placedFurnitureList = getEffectivePlaced(user.placedFurniture ?? "", user.ownedFurniture ?? "");
    socket.emit("furniture:state", { owned: ownedFurnitureList, placed: placedFurnitureList, positions: getFurniturePosPayload(user.furniturePositions ?? "{}") });
    // Vérifier le reset quotidien des dailies + envoyer la dégradation
    checkAndApplyDailyReset(socket, userId);
    broadcastLeaderboard(io);
  });

  socket.on("move", ({ col, row }) => {
    if (!allow(socket.id, "move", 30, 1000)) return;
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || col >= 12 || row < 0 || row >= 12) return;
    const p = players.get(socket.id);
    if (!p) return;
    p.col = col;
    p.row = row;
    socket.broadcast.emit("player-moved", { id: socket.id, col, row });
  });

  socket.on("avatar-state", ({ state }) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.state = state;
    socket.broadcast.emit("player-state", { id: socket.id, state });
    broadcastLeaderboard(io);
  });

  socket.on("chat", ({ text }) => {
    if (!allow(socket.id, "chat", 5, 5000)) return;
    const p = players.get(socket.id);
    if (!p) return;
    const safe = sanitize(text);
    if (!safe.trim()) return;
    io.emit("chat-message", {
      id: socket.id,
      name: p.name,
      color: p.color,
      text: safe,
      ts: Date.now(),
    });
  });

  socket.on("chat:typing", () => {
    if (!allow(socket.id, "chat:typing", 5, 3000)) return;
    const p = players.get(socket.id);
    if (!p) return;
    socket.broadcast.emit("chat:typing", {
      id: socket.id,
      name: p.name,
      color: p.color,
    });
  });

  const VALID_EMOJIS = new Set(["👍","🎉","🔥","❤️"]);
  socket.on("chat:react", ({ msgTs, emoji }) => {
    if (!allow(socket.id, "chat:react", 10, 5000)) return;
    if (!VALID_EMOJIS.has(emoji)) return;
    const p = players.get(socket.id);
    if (!p) return;
    io.emit("chat:react", { msgTs, emoji, fromId: socket.id, fromColor: p.color });
  });

  const VALID_EMOTES = new Set(["😂","😍","😎","🥳","😭","🤯"]);
  socket.on("chat:emote", ({ emoji }) => {
    if (!allow(socket.id, "chat:emote", 5, 3000)) return;
    if (!VALID_EMOTES.has(emoji)) return;
    const p = players.get(socket.id);
    if (!p) return;
    io.emit("chat:emote", { id: socket.id, emoji });
  });

  socket.on("private-message", ({ to, text }) => {
    if (!allow(socket.id, "private-message", 5, 5000)) return;
    const p = players.get(socket.id);
    if (!p) return;
    if (!players.has(to)) return;
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
      const furnitureRow = sql.getFurniture.get(userId) as { ownedFurniture: string; placedFurniture: string };
      const ownedFurniture = getEffectivePlaced(furnitureRow?.placedFurniture ?? "", furnitureRow?.ownedFurniture ?? "");
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
      socket.broadcast.emit("task:completed-public", { socketId: socket.id });
    }
    const p = players.get(socket.id);
    if (p) p.coins = coins;
    broadcastLeaderboard(io);
  });

  socket.on("task:delete", ({ userId, taskId }) => {
    if (!allow(socket.id, "task:delete", 10, 10000)) return;
    sql.deleteTask.run(taskId, userId);
    socket.emit("task:deleted", { taskId });
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
    db.prepare("DELETE FROM achievements WHERE userId = ? AND key = ?").run(userId, key);
    tryUnlock(io, socket, userId, key);
  });

  // ── Debug : octroyer des XP ───────────────────────────────────────────────
  socket.on("debug:grant-xp", ({ userId, amount }) => {
    sql.upsertUser.run(userId);
    emitXpUpdate(socket, userId, amount);
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
    const cleanFurniture = getEffectivePlaced(user.placedFurniture ?? "", user.ownedFurniture ?? "");
    const baseCost = cleanFurniture.includes("couch") ? 40 : 50;
    const cost = baseCost * lvls;
    if (user.coins < cost) return;
    sql.addCoins.run(-cost, userId);
    const newCoins = Math.max(0, user.coins - cost);
    const newDegradation = level - lvls;
    sql.setDegradation.run(newDegradation, userId);
    socket.emit("degradation:update", { level: newDegradation });
    socket.emit("coins:update", { coins: newCoins });
    const p = players.get(socket.id);
    if (p) p.coins = newCoins;
    broadcastLeaderboard(io);
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
    const newPlacedOnBuy = getEffectivePlaced(user.placedFurniture ?? "", user.ownedFurniture ?? "");
    const newPlacedList = [...newPlacedOnBuy, itemId];
    sql.setPlacedFurniture.run(newPlacedList.join(","), userId);
    const newCoins = (sql.getCoins.get(userId) as UserRow).coins;
    socket.emit("coins:update", { coins: newCoins });
    socket.emit("furniture:bought", { itemId, coins: newCoins });
    socket.emit("furniture:state", { owned: [...owned, itemId], placed: newPlacedList, positions: getFurniturePosPayload(user.furniturePositions ?? "{}") });
    const p = players.get(socket.id);
    if (p) p.coins = newCoins;
    broadcastLeaderboard(io);
  });
  // ── Déplacer un meuble (Feng Shui) ─────────────────────────────────────────────
  socket.on("furniture:move", ({ userId, itemId, col, row }) => {
    if (!allow(socket.id, "furniture:move", 20, 5000)) return;
    const item = FURNITURE_ITEMS.find((i) => i.id === itemId);
    if (!item) return;
    if (col < 0 || col >= 12 || row < 0 || row >= 12) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedFurniture ?? "").split(",").filter(Boolean);
    if (!owned.includes(itemId)) return;
    const positions = JSON.parse((user.furniturePositions as string | null) ?? "{}") as Record<string, { col: number; row: number }>;
    positions[itemId] = { col, row };
    sql.setFurniturePositions.run(JSON.stringify(positions), userId);
    const movedPlaced = getEffectivePlaced(user.placedFurniture ?? "", user.ownedFurniture ?? "");
    socket.emit("furniture:state", { owned, placed: movedPlaced, positions: getFurniturePosPayload(JSON.stringify(positions)) });
  });
  // ── Ranger / Sortir un meuble de la chambre (toggle-place) ───────────────────
  socket.on("furniture:toggle-place", ({ userId, itemId }) => {
    if (!allow(socket.id, "furniture:toggle-place", 20, 5000)) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedFurniture ?? "").split(",").filter(Boolean);
    if (!owned.includes(itemId)) return;
    const placed = getEffectivePlaced(user.placedFurniture ?? "", user.ownedFurniture ?? "");
    const newPlaced = placed.includes(itemId)
      ? placed.filter((id) => id !== itemId)
      : [...placed, itemId];
    sql.setPlacedFurniture.run(newPlaced.join(","), userId);
    socket.emit("furniture:state", { owned, placed: newPlaced, positions: getFurniturePosPayload(user.furniturePositions ?? "{}") });
  });
  // ── Confirmer le placement fantôme d'un meuble ─────────────────────────────
  socket.on("furniture:place", ({ userId, itemId, col, row }) => {
    if (!allow(socket.id, "furniture:place", 20, 5000)) return;
    const item = FURNITURE_ITEMS.find((i) => i.id === itemId);
    if (!item) return;
    if (col < 0 || col >= 12 || row < 0 || row >= 12) return;
    sql.upsertUser.run(userId);
    const user = sql.getUser.get(userId) as UserRow;
    const owned = (user.ownedFurniture ?? "").split(",").filter(Boolean);
    if (!owned.includes(itemId)) return;
    const placedIds = getEffectivePlaced(user.placedFurniture ?? "", user.ownedFurniture ?? "");
    const effectivePos = getFurniturePosPayload(user.furniturePositions ?? "{}");
    for (const otherId of placedIds) {
      if (otherId !== itemId) {
        const pos = effectivePos[otherId];
        if (pos && pos.col === col && pos.row === row) return;
      }
    }
    const positions = JSON.parse((user.furniturePositions as string | null) ?? "{}") as Record<string, { col: number; row: number }>;
    positions[itemId] = { col, row };
    sql.setFurniturePositions.run(JSON.stringify(positions), userId);
    const newPlacedAfter = placedIds.includes(itemId) ? placedIds : [...placedIds, itemId];
    sql.setPlacedFurniture.run(newPlacedAfter.join(","), userId);
    socket.emit("furniture:state", { owned, placed: newPlacedAfter, positions: getFurniturePosPayload(JSON.stringify(positions)) });
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
    socket.emit("cosmetics:state", { owned: [...owned, itemId], equippedHat: user.equippedHat ?? null });
    const p = players.get(socket.id);
    if (p) p.coins = newCoins;
    broadcastLeaderboard(io);
  });

  // ── Équiper / déséquiper un cosmétique ───────────────────────────────────────────
  socket.on("cosmetic:equip", ({ userId, hatId }) => {
    if (hatId !== null) {
      const user = sql.getUser.get(userId) as UserRow;
      const owned = (user.ownedItems ?? "").split(",").filter(Boolean);
      if (!owned.includes(hatId)) return;
    }
    sql.setEquippedHat.run(hatId, userId);
    const p = players.get(socket.id);
    if (p) p.hat = hatId;
    socket.broadcast.emit("player-hat", { id: socket.id, hat: hatId });
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
    const pFurnitureRow = sql.getFurniture.get(userId) as { ownedFurniture: string; placedFurniture: string };
    const pFurniture = getEffectivePlaced(pFurnitureRow?.placedFurniture ?? "", pFurnitureRow?.ownedFurniture ?? "");
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
        handleBossDefeat(io, socketToUserId, players, memberGuild);
      } else {
        socket.emit("guild:boss-attacked", { damage: 10, newHp: newBossHp, maxHp: memberGuild.bossMaxHp });
      }
      emitGuildState(io, socketToUserId, memberGuild.id);
    }
    const p = players.get(socket.id);
    if (p) p.coins = coins;
    broadcastLeaderboard(io);
  });

  // ── Pomodoro collectif ───────────────────────────────────────────────────
  socket.on("pomo:join", () => {
    if (pomoParticipants.has(socket.id)) return;
    pomoParticipants.add(socket.id);
    sharedPomo.participants = pomoParticipants.size;
    // Démarrer le timer d'abord pour que running soit correct dans pomo:state
    startPomoIfNeeded(io);
    // Envoyer l'état actuel au nouveau participant
    socket.emit("pomo:state", {
      phase: sharedPomo.phase,
      remaining: sharedPomo.remaining,
      running: sharedPomo.running,
      participants: sharedPomo.participants,
      session: sharedPomo.session,
    });
    // Notifier tous les participants du nouveau compte
    for (const sid of pomoParticipants) {
      io.to(sid).emit("pomo:tick", {
        remaining: sharedPomo.remaining,
        phase: sharedPomo.phase,
        session: sharedPomo.session,
      });
    }
    console.log(
      `[pomo:join] ${socket.id} — ${pomoParticipants.size} participant(s)`,
    );
  });

  socket.on("pomo:leave", () => {
    pomoParticipants.delete(socket.id);
    sharedPomo.participants = pomoParticipants.size;
    if (pomoParticipants.size === 0 && sharedPomo.intervalId) {
      clearInterval(sharedPomo.intervalId);
      sharedPomo.intervalId = null;
      sharedPomo.running = false;
    }
  });

  socket.on("disconnect", () => {
    cleanRateLimit(socket.id);
    players.delete(socket.id);
    socketToUserId.delete(socket.id);
    socket.broadcast.emit("player-left", { id: socket.id });
    // Quitter le pomo collectif si participant
    if (pomoParticipants.delete(socket.id)) {
      sharedPomo.participants = pomoParticipants.size;
      if (pomoParticipants.size === 0 && sharedPomo.intervalId) {
        clearInterval(sharedPomo.intervalId);
        sharedPomo.intervalId = null;
        sharedPomo.running = false;
      }
    }
    broadcastLeaderboard(io);
    console.log(`[-] disconnected: ${socket.id}`);
  });

  // ── Admin ─────────────────────────────────────────────────────────────────
  function isAdmin(): boolean {
    const uid = socketToUserId.get(socket.id);
    if (!uid) return false;
    const u = sql.getUser.get(uid) as UserRow | undefined;
    return !!(u?.isAdmin) || (!!ADMIN_EMAIL && u?.email === ADMIN_EMAIL);
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
        const p = players.get(sid);
        if (p) p.coins = user.coins;
        break;
      }
    }
    broadcastLeaderboard(io);
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
    const safe = message.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c] ?? c).slice(0, 200);
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
    const inMemoryPlayer = players.get(targetSid);
    const achievementKeys = (sql.getUserAchievements.all(targetUserId) as { key: string }[]).map((r) => r.key);
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
    const remaining = (sql.countGuildMembers.get(guild.id) as { cnt: number }).cnt;
    if (remaining === 0) {
      // Dissoudre la guilde
      sql.deleteGuild.run(guild.id);
    } else if (guild.ownerId === userId) {
      // Transférer la propriété au premier membre restant
      const [nextMember] = sql.getGuildMemberIds.all(guild.id) as { userId: string }[];
      if (nextMember) sql.transferGuildOwner.run(nextMember.userId, guild.id);
      emitGuildState(io, socketToUserId, guild.id);
    } else {
      emitGuildState(io, socketToUserId, guild.id);
    }
    // Émettre une guilde vide au joueur qui part
    socket.emit("guild:state", {
      id: "", name: "", ownerId: "", level: 0,
      bossHp: 0, bossMaxHp: 100, bossLevel: 1, bossDefeated: 0, members: [],
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

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
httpServer.listen(PORT, () => {
  console.log(`[+] Server running on port ${PORT}`);
});

