// Server-owned roster of a linked streamer's live Twitch chatters, rendered as wandering NPCs
// visible to EVERYONE in the room — not a client-local illusion like the earlier prototypes.
// One owner (a gamiTask user) drives a set of NPCs in whichever room they currently occupy;
// a periodic tick re-fetches their chat roster (diffing joins/leaves) and nudges each NPC to a
// new spot, reusing the exact player-moved/joined/left plumbing the client already renders with.
import type { Server } from "socket.io";
import type { ClientToServerEvents, Look, RoomId, ServerToClientEvents, TwitchNpc } from "./types.js";
import { getChatters } from "./twitch.js";
import { randomNpcLook } from "./npcLook.js";

// Bridges to the real account system (injected, not imported directly, to avoid a circular
// dependency with index.ts): a chatter who has linked Twitch to a gamiTask account gets their
// real name/look instead of a random one, and — if they're actually connected right now — no
// decorative NPC at all, since they're already rendered as themselves via the real player pipeline.
export interface GamitaskIdentity { userId: string; name: string; color: number; look: Look }
let lookupGamitaskUser: (twitchId: string) => GamitaskIdentity | null = () => null;
let isUserOnline: (userId: string) => boolean = () => false;
export function configureTwitchNpcs(
  lookup: (twitchId: string) => GamitaskIdentity | null,
  online: (userId: string) => boolean,
): void {
  lookupGamitaskUser = lookup;
  isUserOnline = online;
}

const TICK_MS = 8000;
const MOVE_CHANCE = 0.6;
// A conservative interior band that fits inside even the smallest room (the 12x10 private one),
// so NPCs never wander into a wall — at the cost of not roaming a big public room's full floor.
const safeSpot = () => ({ col: 2 + Math.floor(Math.random() * 8), row: 2 + Math.floor(Math.random() * 6) });

interface Owner {
  roomId: RoomId;
  broadcasterId: string;
  getAccessToken: () => Promise<string | null>;
  timer: ReturnType<typeof setInterval>;
  npcIds: Set<string>;
}

const roomNpcs = new Map<RoomId, Map<string, TwitchNpc>>();
const owners = new Map<string, Owner>(); // key: gamiTask userId

function roomMap(roomId: RoomId): Map<string, TwitchNpc> {
  let m = roomNpcs.get(roomId);
  if (!m) {
    m = new Map();
    roomNpcs.set(roomId, m);
  }
  return m;
}

async function tick(io: Server<ClientToServerEvents, ServerToClientEvents>, userId: string): Promise<void> {
  const owner = owners.get(userId);
  if (!owner) return;
  const token = await owner.getAccessToken();
  if (!token) return;
  let chatters;
  try {
    chatters = await getChatters(owner.broadcasterId, token);
  } catch (err) {
    console.error("[twitchNpcs] chatters lookup failed", err);
    return;
  }
  if (!owners.has(userId)) return; // torn down while the fetch was in flight
  const npcs = roomMap(owner.roomId);
  const seen = new Set<string>();
  for (const c of chatters) {
    const id = `twitch-chatter-${c.id}`;
    const known = lookupGamitaskUser(c.id);
    // Already present as a real, live player elsewhere in the pipeline — leaving them out of
    // `seen` makes them get cleaned up below exactly like a chatter who left, no special-casing.
    if (known && isUserOnline(known.userId)) continue;
    seen.add(id);
    if (npcs.has(id)) continue;
    const { name, color, look } = known
      ? { name: known.name || c.name || c.login, color: known.color, look: known.look }
      : { name: c.name || c.login, ...randomNpcLook() };
    const spot = safeSpot();
    const npc: TwitchNpc = { id, name, color, look, col: spot.col, row: spot.row };
    npcs.set(id, npc);
    owner.npcIds.add(id);
    io.to(owner.roomId).emit("npc:joined", npc);
  }
  for (const id of [...owner.npcIds]) {
    if (seen.has(id)) continue;
    npcs.delete(id);
    owner.npcIds.delete(id);
    io.to(owner.roomId).emit("npc:left", { id });
  }
  for (const id of owner.npcIds) {
    if (Math.random() >= MOVE_CHANCE) continue;
    const npc = npcs.get(id);
    if (!npc) continue;
    const spot = safeSpot();
    npc.col = spot.col;
    npc.row = spot.row;
    io.to(owner.roomId).emit("npc:moved", { id, col: spot.col, row: spot.row });
  }
}

export function startTwitchNpcs(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  userId: string,
  roomId: RoomId,
  broadcasterId: string,
  getAccessToken: () => Promise<string | null>,
): void {
  stopTwitchNpcs(io, userId);
  const timer = setInterval(() => {
    tick(io, userId);
  }, TICK_MS);
  owners.set(userId, { roomId, broadcasterId, getAccessToken, timer, npcIds: new Set() });
  tick(io, userId);
}

export function stopTwitchNpcs(io: Server<ClientToServerEvents, ServerToClientEvents>, userId: string): void {
  const owner = owners.get(userId);
  if (!owner) return;
  clearInterval(owner.timer);
  owners.delete(userId);
  const npcs = roomNpcs.get(owner.roomId);
  if (!npcs) return;
  for (const id of owner.npcIds) {
    npcs.delete(id);
    io.to(owner.roomId).emit("npc:left", { id });
  }
}

export function roomNpcSnapshot(roomId: RoomId): TwitchNpc[] {
  return [...(roomNpcs.get(roomId)?.values() ?? [])];
}
