import { randomUUID } from "crypto";
import type { Task } from "../types.js";
import { score, levelOf, xpForLevel, cleanKind, cleanDifficulty, cleanDays, cleanChecklist, cleanNote, coinsDelta } from "../scoring.js";
import { sql, rowToTask, taskToRow, userTasks, isPending, type UserRow, type TaskRow } from "../db.js";
import { socketToUserId, getPlayer, broadcastToOwnRoom } from "../rooms.js";
import { allow, sanitize, VALID_CATEGORIES, applyEnergy, emitXpUpdate, getSetBonuses, tryUnlock } from "../rewards.js";
import type { IoServer, AppSocket } from "../context.js";

export function registerTasks(socket: AppSocket, io: IoServer): void {
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
      focusCount: 0,
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
    const r = score(rowToTask(row), direction);
    if (!r) return;
    sql.updateTask.run(taskToRow(r.task));
    // Pièces : gain de la coche + bonus mobilier appliqué signé (symétrique tick/untick), plancher 0.
    let coins = user.coins;
    let bonus = 0;
    if (r.coins !== 0) {
      const furnitureRow = sql.getFurniture.get(userId) as { ownedFurniture: string; placedFurniture: string };
      const placed = (furnitureRow?.placedFurniture ?? "").split(",").filter(Boolean);
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
      xpToNext: xpForLevel(newLevel + 1) - xp,
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
  });
}
