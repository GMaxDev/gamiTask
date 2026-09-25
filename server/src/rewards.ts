import { Server, Socket } from "socket.io";
import { ACHIEVEMENTS, FURNITURE_SETS, type Task, type ClientToServerEvents, type ServerToClientEvents } from "./types.js";
import { rollover, levelOf, xpForLevel, escapeHtml, startOfDay, ENERGY_MAX } from "./scoring.js";
import { db, sql, taskToRow, userTasks, type UserRow } from "./db.js";
import { getPlayer, broadcastToOwnRoom } from "./rooms.js";

/**
 * Applique une variation d'énergie. À 0 : épuisement — jauge remise à 50, −30 % des pièces,
 * personnage « épuisé » jusqu'au prochain minuit. Renvoie l'énergie finale.
 */
export function applyEnergy(
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
export function runRollover(
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
  const r = rollover(userTasks(userId), user.lastDailyResetAt ?? 0, now, tz);
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
export function getSetBonuses(owned: string[]): {
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

export function emitXpUpdate(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  userId: string,
  xpGained: number,
): void {
  sql.addXp.run(xpGained, userId);
  const { xp } = sql.getXp.get(userId) as { xp: number };
  const level = levelOf(xp);
  const xpToNext = xpForLevel(level + 1) - xp;
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

export const sanitize = (text: string): string => escapeHtml(text).slice(0, 200);

export const VALID_CATEGORIES = new Set(["work", "perso", "urgent", "study"]);

// ── Rate limiting par socket ─────────────────────────────────────────────────
// Compteur glissant : { timestamps des appels récents }
const rateLimits = new Map<string, Map<string, number[]>>();
// Solo focuses the server saw start, by userId. ponytail: in memory — a server restart forgets a running
// focus and its reward is refused once; move to a users column if that ever bites.
export const focusStarts = new Map<string, { at: number; minutes: number; taskId?: string }>();

export function allow(
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

export function cleanRateLimit(socketId: string): void {
  rateLimits.delete(socketId);
}

export function tryUnlock(
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
