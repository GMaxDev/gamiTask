import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { type ClientToServerEvents, type ServerToClientEvents } from "./types.js";
import { configureTwitchNpcs } from "./twitchNpcs.js";
import { CORS_ORIGINS, PORT } from "./config.js";
import { sql, type UserRow } from "./db.js";
import { socketToUserId, userLook, buildRoomSummaries } from "./rooms.js";
import { registerRoutes } from "./http.js";
import { registerJoin } from "./handlers/join.js";
import { registerTasks } from "./handlers/tasks.js";
import { registerShop } from "./handlers/shop.js";
import { registerChat } from "./handlers/chat.js";
import { registerPomodoro } from "./handlers/pomodoro.js";
import { registerRooms } from "./handlers/rooms.js";
import { registerCatalog } from "./handlers/catalog.js";

const app = express();

// ── HTTP + Socket.IO ─────────────────────────────────────────────────────────
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CORS_ORIGINS, methods: ["GET", "POST"] },
});

// A chatter who has linked Twitch to a gamiTask account shows up as themselves, not a random
// look — and not at all as an NPC while they're actually online, since they're already a real player.
configureTwitchNpcs(
  (twitchId) => {
    const user = sql.getUserByTwitchId.get(twitchId) as UserRow | undefined;
    if (!user) return null;
    return { userId: user.id, name: user.displayName ?? "", color: user.avatarColor ?? 0, look: userLook(user) };
  },
  (userId) => {
    for (const uid of socketToUserId.values()) if (uid === userId) return true;
    return false;
  },
);

registerRoutes(app, io);

io.on("connection", (socket) => {
  console.log(`[+] connected: ${socket.id}`);
  // socket.io lets a throwing listener take the whole process down. Every handler below registers
  // through this guard, so a malformed payload costs one logged error, not every session.
  const rawOn = socket.on.bind(socket);
  (socket as { on: unknown }).on = (event: string, fn: (...args: unknown[]) => void) =>
    rawOn(event as never, ((...args: unknown[]) => {
      try { fn(...args); } catch (err) { console.error(`[${event}] handler threw`, err); }
    }) as never);
  // Envoi initial de la liste des rooms (utile pour l'écran de sélection avant join)
  socket.emit("rooms:list", { rooms: buildRoomSummaries() });

  registerJoin(socket, io);
  registerRooms(socket, io);
  registerChat(socket, io);
  registerTasks(socket, io);
  registerShop(socket);
  registerPomodoro(socket, io);
  registerCatalog(socket, io);
});

httpServer.listen(PORT, () => {
  console.log(`[+] Server running on port ${PORT}`);
});
