import { DEFAULT_ROOM_ID, type RoomId, type Player } from "../types.js";
import { levelOf, xpForLevel, ENERGY_MAX } from "../scoring.js";
import { cleanName, cleanColor } from "../look.js";
import { userIdFromToken } from "../auth.js";
import { seal, open } from "../secretbox.js";
import { refreshUserToken } from "../twitch.js";
import { connectChat as connectTwitchChat, disconnectChat as disconnectTwitchChat } from "../twitchChat.js";
import { startTwitchNpcs, stopTwitchNpcs, roomNpcSnapshot } from "../twitchNpcs.js";
import { JWT_SECRET, TOKEN_KEY } from "../config.js";
import { sql, userTasks, isPending, catalogItems, getFurniturePosPayload, type UserRow } from "../db.js";
import { rooms, socketToRoom, socketToUserId, getRoom, roomBanUntil, userLook, emitToUsersRoom, broadcastRoomsList } from "../rooms.js";
import { pomoState, broadcastPomoState, leavePomo } from "../pomo.js";
import { allow, cleanRateLimit, runRollover, sanitize } from "../rewards.js";
import type { IoServer, AppSocket } from "../context.js";

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

export function registerJoin(socket: AppSocket, io: IoServer): void {
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
        if (leavePomo(prevRoom, previousSocketId)) broadcastPomoState(io, prevRoom);
        io.to(prevRoom.id).emit("player-left", { id: previousSocketId });
        affectedRooms.add(prevRoomId);
      }
      socketToRoom.delete(previousSocketId);
      socketToUserId.delete(previousSocketId);
      previousSocket?.leave(prevRoomId ?? targetRoomId);
      previousSocket?.emit("session:replaced");
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
    const placedFurnitureList = (user.placedFurniture ?? "").split(",").filter(Boolean);
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
          emitToUsersRoom(io, userId, "chat-message", {
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
    const xpToNext = xpForLevel(level + 1) - xp;
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

    leavePomo(currentRoom, socket.id); // broadcastPomoState follows below either way

    // Remove from old room
    currentRoom.players.delete(socket.id);
    socket.to(currentRoom.id).emit("player-left", { id: socket.id });
    socket.leave(currentRoom.id);
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
    broadcastRoomsList(io);
    console.log(`[room:switch] ${existing.name} ${currentRoom.id} → ${roomId}${userId ? " (" + userId.slice(0, 6) + ")" : ""}`);
  });

  socket.on("disconnect", () => {
    cleanRateLimit(socket.id);
    const room = getRoom(socket.id);
    if (room) {
      room.players.delete(socket.id);
      socket.to(room.id).emit("player-left", { id: socket.id });
      if (leavePomo(room, socket.id)) broadcastPomoState(io, room);
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
}
