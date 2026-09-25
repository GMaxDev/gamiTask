import { Server, Socket } from "socket.io";
import {
  DURATIONS,
  PUBLIC_ROOM_IDS,
  PUBLIC_ROOM_NAMES,
  MAX_PUBLIC_ROOM,
  MAX_PRIVATE_ROOM,
  type RoomSummary,
  type RoomId,
  type Player,
  type SharedPomoState,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type Look,
} from "./types.js";
import { sanitizeLook } from "./look.js";
import { sql, type UserRow, type PrivateRoomRow } from "./db.js";

// ── État par-room ────────────────────────────────────────────────────────────
export interface RoomState {
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

export function createRoomState(id: RoomId, name: string, ownerId: string | null): RoomState {
  return {
    id,
    name,
    capacity: ownerId ? MAX_PRIVATE_ROOM : MAX_PUBLIC_ROOM,
    isPrivate: ownerId !== null,
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

export const rooms: Map<RoomId, RoomState> = new Map();
for (const id of PUBLIC_ROOM_IDS) rooms.set(id, createRoomState(id, PUBLIC_ROOM_NAMES[id], null));

// Load private rooms from DB at boot
for (const row of sql.getAllPrivateRooms.all() as PrivateRoomRow[]) {
  rooms.set(row.id, createRoomState(row.id, row.name, row.ownerId));
}

// Mapping socket → room pour les lookups rapides
export const socketToRoom = new Map<string, RoomId>();
// Mapping socket → userId (global, un utilisateur n'a qu'une session quel que soit la room)
export const socketToUserId = new Map<string, string>();

export function getRoom(socketId: string): RoomState | undefined {
  const rid = socketToRoom.get(socketId);
  return rid ? rooms.get(rid) : undefined;
}

export function getPlayer(socketId: string): Player | undefined {
  return getRoom(socketId)?.players.get(socketId);
}

/** Whether a user is currently excluded from a private room (a kick, temporary or permanent). */
export function roomBanUntil(roomId: RoomId, userId: string): number | null | undefined {
  const row = sql.getRoomBan.get(roomId, userId) as { expiresAt: number | null } | undefined;
  if (!row) return undefined; // not banned
  if (row.expiresAt !== null && row.expiresAt <= Date.now()) return undefined; // ban expired
  return row.expiresAt; // null = permanent, otherwise the timestamp it lifts
}

export function userLook(user: UserRow): Look {
  let raw: unknown = null;
  try {
    raw = JSON.parse(user.look ?? "null");
  } catch {}
  return sanitizeLook(raw, user.equippedHat ?? null, user.avatarColor);
}

/** Emit to all sockets in the sender's room except the sender. */
export function broadcastToOwnRoom<E extends keyof ServerToClientEvents>(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  const rid = socketToRoom.get(socket.id);
  if (!rid) return;
  (socket.to(rid).emit as (e: E, ...a: Parameters<ServerToClientEvents[E]>) => boolean)(event, ...args);
}

/** Emit to all sockets in a given socket's room (including itself). */
export function emitToOwnRoom<E extends keyof ServerToClientEvents>(
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
export function emitToUsersRoom<E extends keyof ServerToClientEvents>(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
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
export function buildRoomSummaries(forUserId?: string, inRoom?: RoomId): RoomSummary[] {
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

export function broadcastRoomsList(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
  for (const [sid, s] of io.sockets.sockets) s.emit("rooms:list", { rooms: buildRoomSummaries(socketToUserId.get(sid), socketToRoom.get(sid)) });
}
