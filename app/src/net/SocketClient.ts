import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Player,
  AvatarState,
  Task,
  SharedPomoState,
  PomodoroPhase,
  ProfileData,
  GuildData,
} from "./types";

export type ChatMessage = {
  id: string;
  name: string;
  color?: number;
  text: string;
  ts: number;
};

export type RoomCallbacks = {
  onRoomState: (players: Player[]) => void;
  onPlayerJoined: (player: Player) => void;
  onPlayerMoved: (id: string, col: number, row: number) => void;
  onPlayerState: (id: string, state: AvatarState) => void;
  onPlayerLeft: (id: string) => void;
  onChatMessage: (msg: ChatMessage) => void;
  onTasksState: (tasks: Task[], coins: number) => void;
  onTaskAdded: (task: Task) => void;
  onTaskToggled: (taskId: string, done: boolean, coins: number) => void;
  onTaskUpdated: (
    taskId: string,
    text: string,
    category: string | null,
  ) => void;
  onTaskDeleted: (taskId: string) => void;
  onCoinsUpdate: (coins: number) => void;
  onStreakUpdate: (streak: number, bonus: number) => void;
  onPositionSaved: (col: number, row: number) => void;
  onPomoState: (state: SharedPomoState) => void;
  onPomoTick: (
    remaining: number,
    phase: PomodoroPhase,
    session: number,
  ) => void;
  onPomoPhase: (
    phase: PomodoroPhase,
    remaining: number,
    session: number,
  ) => void;
  onLeaderboardUpdate: (
    entries: Array<{
      id: string;
      name: string;
      color: number;
      coins: number;
      state: AvatarState;
    }>,
  ) => void;
  onPrivateMessage: (msg: {
    from: string;
    fromName: string;
    fromColor: number;
    text: string;
    ts: number;
  }) => void;
  onTaskCompletedPublic: (socketId: string) => void;
  onAchievementUnlocked: (payload: {
    key: string;
    label: string;
    desc: string;
    icon: string;
  }) => void;
  onAchievementPublic: (socketId: string, label: string, icon: string) => void;
  onTyping: (id: string, name: string, color: number) => void;
  onChatReact: (msgTs: number, emoji: string, fromId: string, fromColor: number) => void;
  onXpUpdate: (xp: number, level: number, xpToNext: number, levelUp: boolean) => void;
  onLevelUpPublic: (socketId: string, name: string, color: number, level: number) => void;
  onDegradationUpdate: (level: number) => void;
  onCosmeticsState: (data: { owned: string[]; equippedHat: string | null }) => void;
  onShopBought: (data: { itemId: string; coins: number }) => void;
  onPlayerHat: (data: { id: string; hat: string | null }) => void;
  onFurnitureState: (data: { owned: string[]; placed: string[]; positions: Record<string, { col: number; row: number }> }) => void;
  onFurnitureBought: (data: { itemId: string; coins: number }) => void;
  onFurniturePlayerUpdate: (data: { id: string; placed: string[]; positions: Record<string, { col: number; row: number }> }) => void;
  onAdminAnnounce: (payload: { message: string }) => void;
  onProfileData: (data: ProfileData) => void;
  onGuildState: (data: GuildData) => void;
  onGuildBossAttacked: (payload: { damage: number; newHp: number; maxHp: number }) => void;
  onGuildBossDefeated: (payload: { bossLevel: number; reward: number }) => void;
  onEmote: (id: string, emoji: string) => void;
};

export class SocketClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents>;

  constructor(callbacks: RoomCallbacks) {
    this.socket = io(import.meta.env.VITE_API_URL ?? "http://localhost:3001", { transports: ["websocket"] });

    this.socket.on("room-state", callbacks.onRoomState);
    this.socket.on("player-joined", callbacks.onPlayerJoined);
    this.socket.on("player-moved", ({ id, col, row }) =>
      callbacks.onPlayerMoved(id, col, row),
    );
    this.socket.on("player-state", ({ id, state }) =>
      callbacks.onPlayerState(id, state),
    );
    this.socket.on("player-left", ({ id }) => callbacks.onPlayerLeft(id));
    this.socket.on("chat-message", callbacks.onChatMessage);
    this.socket.on("tasks:state", ({ tasks, coins }) =>
      callbacks.onTasksState(tasks, coins),
    );
    this.socket.on("task:added", (task) => callbacks.onTaskAdded(task));
    this.socket.on("task:toggled", ({ taskId, done, coins }) =>
      callbacks.onTaskToggled(taskId, done, coins),
    );
    this.socket.on("task:updated", ({ taskId, text, category }) =>
      callbacks.onTaskUpdated(taskId, text, category),
    );
    this.socket.on("task:deleted", ({ taskId }) =>
      callbacks.onTaskDeleted(taskId),
    );
    this.socket.on("coins:update", ({ coins }) =>
      callbacks.onCoinsUpdate(coins),
    );
    this.socket.on("streak:update", ({ streak, bonus }) =>
      callbacks.onStreakUpdate(streak, bonus),
    );
    this.socket.on("position:saved", ({ col, row }) =>
      callbacks.onPositionSaved(col, row),
    );
    this.socket.on("pomo:state", (state) => callbacks.onPomoState(state));
    this.socket.on("pomo:tick", ({ remaining, phase, session }) =>
      callbacks.onPomoTick(remaining, phase, session),
    );
    this.socket.on("pomo:phase", ({ phase, remaining, session }) =>
      callbacks.onPomoPhase(phase, remaining, session),
    );
    this.socket.on("leaderboard-update", callbacks.onLeaderboardUpdate);
    this.socket.on("private-message", callbacks.onPrivateMessage);
    this.socket.on("task:completed-public", ({ socketId }) =>
      callbacks.onTaskCompletedPublic(socketId),
    );
    this.socket.on("achievement:unlocked", callbacks.onAchievementUnlocked);
    this.socket.on("achievement:public", ({ socketId, label, icon }) =>
      callbacks.onAchievementPublic(socketId, label, icon),
    );
    this.socket.on("chat:typing", ({ id, name, color }) =>
      callbacks.onTyping(id, name, color),
    );
    this.socket.on("chat:react", ({ msgTs, emoji, fromId, fromColor }) =>
      callbacks.onChatReact(msgTs, emoji, fromId, fromColor),
    );
    this.socket.on("chat:emote", ({ id, emoji }) =>
      callbacks.onEmote(id, emoji),
    );
    this.socket.on("xp:update", ({ xp, level, xpToNext, levelUp }) =>
      callbacks.onXpUpdate(xp, level, xpToNext, levelUp),
    );
    this.socket.on("level-up:public", ({ socketId, name, color, level }) =>
      callbacks.onLevelUpPublic(socketId, name, color, level),
    );
    this.socket.on("degradation:update", ({ level }) =>
      callbacks.onDegradationUpdate(level),
    );
    this.socket.on("cosmetics:state", (data) =>
      callbacks.onCosmeticsState(data),
    );
    this.socket.on("shop:bought", (data) =>
      callbacks.onShopBought(data),
    );
    this.socket.on("player-hat", (data) =>
      callbacks.onPlayerHat(data),
    );
    this.socket.on("furniture:state", (data) =>
      callbacks.onFurnitureState(data),
    );
    this.socket.on("furniture:bought", (data) =>
      callbacks.onFurnitureBought(data),
    );
    this.socket.on("furniture:player-update", (data) =>
      callbacks.onFurniturePlayerUpdate(data),
    );
    this.socket.on("admin:announce", (data) =>
      callbacks.onAdminAnnounce(data),
    );
    this.socket.on("profile:data", (data) =>
      callbacks.onProfileData(data),
    );
    this.socket.on("guild:state", (data) =>
      callbacks.onGuildState(data),
    );
    this.socket.on("guild:boss-attacked", (payload) =>
      callbacks.onGuildBossAttacked(payload),
    );
    this.socket.on("guild:boss-defeated", (payload) =>
      callbacks.onGuildBossDefeated(payload),
    );
  }

  get socketId(): string | undefined {
    return this.socket.id;
  }

  join(
    name: string,
    color: number,
    col: number,
    row: number,
    userId: string,
  ): void {
    this.socket.emit("join", { name, color, col, row, userId });
  }

  move(col: number, row: number): void {
    this.socket.emit("move", { col, row });
  }

  setAvatarState(state: AvatarState): void {
    this.socket.emit("avatar-state", { state });
  }

  sendChat(text: string): void {
    this.socket.emit("chat", { text });
  }

  sendTyping(): void {
    this.socket.emit("chat:typing");
  }

  sendChatReact(msgTs: number, emoji: string): void {
    this.socket.emit("chat:react", { msgTs, emoji });
  }

  sendEmote(emoji: string): void {
    this.socket.emit("chat:emote", { emoji });
  }

  sendPrivateMessage(to: string, text: string): void {
    this.socket.emit("private-message", { to, text });
  }

  addTask(userId: string, text: string, category: string | null, type: "task" | "daily" = "task"): void {
    this.socket.emit("task:add", { userId, text, category, type });
  }

  toggleTask(userId: string, taskId: string): void {
    this.socket.emit("task:toggle", { userId, taskId });
  }

  updateTask(
    userId: string,
    taskId: string,
    text: string,
    category: string | null,
  ): void {
    this.socket.emit("task:update", { userId, taskId, text, category });
  }

  deleteTask(userId: string, taskId: string): void {
    this.socket.emit("task:delete", { userId, taskId });
  }

  savePosition(userId: string, col: number, row: number): void {
    this.socket.emit("position:save", { userId, col, row });
  }

  pomodoroComplete(userId: string): void {
    this.socket.emit("pomodoro:complete", { userId });
  }

  joinCollectivePomo(): void {
    this.socket.emit("pomo:join");
  }

  leaveCollectivePomo(): void {
    this.socket.emit("pomo:leave");
  }

  debugUnlock(userId: string, key: string): void {
    this.socket.emit("debug:unlock", { userId, key });
  }

  debugGrantXp(userId: string, amount: number): void {
    this.socket.emit("debug:grant-xp", { userId, amount });
  }

  debugResetXp(userId: string): void {
    this.socket.emit("debug:reset-xp", { userId });
  }

  debugSetDegradation(userId: string, level: number): void {
    this.socket.emit("debug:set-degradation", { userId, level });
  }

  cleanRoom(levels: number): void {
    this.socket.emit("room:clean", { levels });
  }

  buyItem(userId: string, itemId: string): void {
    this.socket.emit("shop:buy", { userId, itemId });
  }

  equipHat(userId: string, hatId: string | null): void {
    this.socket.emit("cosmetic:equip", { userId, hatId });
  }

  buyFurniture(userId: string, itemId: string): void {
    this.socket.emit("furniture:buy", { userId, itemId });
  }

  moveFurniture(userId: string, itemId: string, col: number, row: number): void {
    this.socket.emit("furniture:move", { userId, itemId, col, row });
  }

  toggleFurniturePlaced(userId: string, itemId: string): void {
    this.socket.emit("furniture:toggle-place", { userId, itemId });
  }

  placeFurniture(userId: string, itemId: string, col: number, row: number): void {
    this.socket.emit("furniture:place", { userId, itemId, col, row });
  }

  adminGiveCoins(targetUserId: string, amount: number): void {
    this.socket.emit("admin:give-coins", { targetUserId, amount });
  }

  adminGiveXp(targetUserId: string, xp: number): void {
    this.socket.emit("admin:give-xp", { targetUserId, xp });
  }

  adminSetDegradation(targetUserId: string, level: number): void {
    this.socket.emit("admin:set-degradation", { targetUserId, level });
  }

  adminAnnounce(message: string): void {
    this.socket.emit("admin:announce", { message });
  }

  requestProfile(socketId: string | null): void {
    this.socket.emit("profile:request", { socketId });
  }

  createGuild(name: string): void {
    this.socket.emit("guild:create", { name });
  }

  joinGuild(guildId: string): void {
    this.socket.emit("guild:join", { guildId });
  }

  leaveGuild(): void {
    this.socket.emit("guild:leave");
  }

  requestGuildState(): void {
    this.socket.emit("guild:state-request");
  }

  destroy(): void {
    this.socket.disconnect();
  }
}
