import { Server, Socket } from "socket.io";
import { DURATIONS, type SharedPomoState, type PomodoroPhase, type ClientToServerEvents, type ServerToClientEvents } from "./types.js";
import { sql, type UserRow } from "./db.js";
import { socketToUserId, type RoomState } from "./rooms.js";
import { tryUnlock, emitXpUpdate } from "./rewards.js";

export function pomoTick(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: RoomState,
): void {
  const sp = room.sharedPomo;
  if (sp.remaining <= 1) {
    let nextPhase: PomodoroPhase;
    let nextSession = sp.session;
    if (sp.phase === "focus") {
      nextSession += 1;
      nextPhase = nextSession % 4 === 0 ? "long-break" : "short-break";
      for (const sid of room.pomoParticipants) {
        const userId = socketToUserId.get(sid);
        if (userId) {
          sql.upsertUser.run(userId);
          sql.addCoins.run(25, userId);
          const coins = (sql.getCoins.get(userId) as UserRow).coins;
          io.to(sid).emit("coins:update", { coins });
          const cp = room.players.get(sid);
          if (cp) cp.coins = coins;
          const sock = io.sockets.sockets.get(sid) as
            | Socket<ClientToServerEvents, ServerToClientEvents>
            | undefined;
          if (sock) {
            tryUnlock(io, sock, userId, "first-collective");
            if (coins >= 100) tryUnlock(io, sock, userId, "coins-100");
            if (coins >= 500) tryUnlock(io, sock, userId, "coins-500");
            emitXpUpdate(sock, userId, 75);
          }
        }
      }
    } else {
      nextPhase = "focus";
    }
    sp.phase = nextPhase;
    sp.remaining = DURATIONS[nextPhase];
    sp.session = nextSession;
    sp.running = false;
    if (sp.intervalId) {
      clearInterval(sp.intervalId);
      sp.intervalId = null;
    }
    for (const sid of room.pomoParticipants) {
      io.to(sid).emit("pomo:phase", {
        phase: nextPhase,
        remaining: sp.remaining,
        session: nextSession,
        names: participantNames(room),
      });
    }
    startPomoIfNeeded(io, room);
    broadcastPomoState(io, room);
  } else {
    sp.remaining -= 1;
    for (const sid of room.pomoParticipants) {
      io.to(sid).emit("pomo:tick", {
        remaining: sp.remaining,
        phase: sp.phase,
        session: sp.session,
      });
    }
    // Tick léger pour les occupants qui ne participent pas (l'onglet "Avec la salle")
    if (sp.remaining % 10 === 0) {
      for (const sid of room.players.keys()) {
        if (room.pomoParticipants.has(sid)) continue;
        io.to(sid).emit("pomo:state", pomoState(room));
      }
    }
  }
}

export function participantNames(room: RoomState): string[] {
  return [...room.pomoParticipants]
    .map((sid) => room.players.get(sid)?.name)
    .filter((n): n is string => !!n);
}

export function pomoState(room: RoomState): SharedPomoState {
  const sp = room.sharedPomo;
  return {
    phase: sp.phase,
    remaining: sp.remaining,
    running: sp.running,
    participants: sp.participants,
    session: sp.session,
    names: participantNames(room),
  };
}

export function broadcastPomoState(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: RoomState,
): void {
  io.to(room.id).emit("pomo:state", pomoState(room));
}

/** Drops a socket from the room pomodoro, stopping the timer when nobody is left. Returns false if it was not a participant. */
export function leavePomo(room: RoomState, socketId: string): boolean {
  if (!room.pomoParticipants.delete(socketId)) return false;
  room.sharedPomo.participants = room.pomoParticipants.size;
  if (room.pomoParticipants.size === 0 && room.sharedPomo.intervalId) {
    clearInterval(room.sharedPomo.intervalId);
    room.sharedPomo.intervalId = null;
    room.sharedPomo.running = false;
  }
  return true;
}

export function startPomoIfNeeded(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: RoomState,
): void {
  const sp = room.sharedPomo;
  if (!sp.running && room.pomoParticipants.size > 0) {
    sp.running = true;
    sp.intervalId = setInterval(() => pomoTick(io, room), 1000);
  }
}
