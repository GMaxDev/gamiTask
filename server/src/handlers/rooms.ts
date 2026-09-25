import { randomUUID } from "crypto";
import { DEFAULT_ROOM_ID, type Player } from "../types.js";
import { levelOf, xpForLevel, ENERGY_MAX } from "../scoring.js";
import { roomNpcSnapshot } from "../twitchNpcs.js";
import { sql, type UserRow, type PrivateRoomRow } from "../db.js";
import { rooms, socketToRoom, socketToUserId, getRoom, getPlayer, createRoomState, broadcastRoomsList } from "../rooms.js";
import { allow } from "../rewards.js";
import type { IoServer, AppSocket } from "../context.js";

export function registerRooms(socket: AppSocket, io: IoServer): void {
  // ── Rooms privées : création ──────────────────────────────────────────────
  socket.on("room:create-private", ({ name }) => {
    if (!allow(socket.id, "room:create-private", 3, 60000)) return;
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const user = sql.getUser.get(userId) as UserRow | undefined;
    if (!user) return;
    // Un utilisateur ne peut avoir qu'une seule room privée
    const existing = sql.getPrivateRoomByOwner.get(userId) as
      | PrivateRoomRow
      | undefined;
    if (existing) return;
    const trimmed = name.trim().slice(0, 30);
    if (!trimmed) return;
    const roomId = randomUUID();
    sql.insertPrivateRoom.run(roomId, trimmed, userId, Date.now());
    rooms.set(roomId, createRoomState(roomId, trimmed, userId));
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
    }
    console.log(`[room:kick] ${target.name} ← ${room.id} by ${callerUserId.slice(0, 6)} (${until === null ? "permanent" : `until ${new Date(until).toISOString()}`})`);
  });

  // A decor override changed under everyone's feet: the client rebuilds its room and asks who is still in it.
  socket.on("room:refresh", () => {
    const r = getRoom(socket.id);
    if (!r) return;
    socket.emit("room-state", Array.from(r.players.values()).filter((p) => p.id !== socket.id));
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
    const xpForThisLevel = xpForLevel(lvl);
    const xpForNextLevel = xpForLevel(lvl + 1);
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
      isAdmin: user.role === "admin",
    });
  });
}
