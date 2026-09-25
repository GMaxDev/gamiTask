import { MAX_GRID } from "../config.js";
import { getPlayer, broadcastToOwnRoom, emitToOwnRoom } from "../rooms.js";
import { allow, sanitize } from "../rewards.js";
import type { IoServer, AppSocket } from "../context.js";

export function registerChat(socket: AppSocket, io: IoServer): void {
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

  const VALID_EMOTES = new Set(["👋", "😄", "❤️", "👍", "☕", "🍅", "🎉", "😴"]);
  socket.on("chat:emote", ({ emoji }) => {
    if (!allow(socket.id, "chat:emote", 5, 3000)) return;
    if (!VALID_EMOTES.has(emoji)) return;
    const p = getPlayer(socket.id);
    if (!p) return;
    emitToOwnRoom(io, socket.id, "chat:emote", { id: socket.id, emoji });
  });
}
