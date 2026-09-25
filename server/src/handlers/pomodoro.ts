import { cleanFocusMinutes, focusEarned } from "../scoring.js";
import { sql, rowToTask, type UserRow, type TaskRow } from "../db.js";
import { socketToUserId, getRoom, getPlayer } from "../rooms.js";
import { broadcastPomoState, leavePomo, startPomoIfNeeded } from "../pomo.js";
import { allow, focusStarts, emitXpUpdate, getSetBonuses, tryUnlock } from "../rewards.js";
import type { IoServer, AppSocket } from "../context.js";

export function registerPomodoro(socket: AppSocket, io: IoServer): void {
  // ── Pomodoro personnel complété ──────────────────────────────────────────
  socket.on("pomodoro:start", ({ minutes, taskId }) => {
    if (!allow(socket.id, "pomodoro:start", 10, 60000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    focusStarts.set(userId, { at: Date.now(), minutes: cleanFocusMinutes(minutes), taskId: typeof taskId === "string" ? taskId.slice(0, 64) : undefined });
  });

  socket.on("pomodoro:complete", () => {
    if (!allow(socket.id, "pomodoro:complete", 2, 30000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const now = Date.now();
    const started = focusStarts.get(userId);
    if (!focusEarned(started, now)) return; // no start seen, or not long enough ago: nothing to pay
    focusStarts.delete(userId);
    // A focus spent on one task is counted on it — only if it is still this user's task.
    if (started?.taskId) {
      sql.bumpFocusCount.run(started.taskId, userId);
      const row = sql.getTaskRow.get(started.taskId, userId) as TaskRow | undefined;
      if (row) socket.emit("task:updated", rowToTask(row));
    }
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
    const pFurniture = (pFurnitureRow?.placedFurniture ?? "").split(",").filter(Boolean);
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
    if (leavePomo(room, socket.id)) broadcastPomoState(io, room);
  });
}
