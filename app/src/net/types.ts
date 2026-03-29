// Miroir des types server/src/types.ts (sans dépendance build croisée)
export type AvatarState = "idle" | "walking" | "focus" | "pause" | "collective";

export interface Player {
  id: string;
  name: string;
  col: number;
  row: number;
  color: number;
  state: AvatarState;
  coins?: number;
  hat?: string | null;
}

export interface ShopItem {
  id: string;
  name: string;
  price: number;
  emoji: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "hat-party",  name: "Chapeau fête",   price: 100, emoji: "🎉" },
  { id: "hat-halo",   name: "Halo",            price: 150, emoji: "😇" },
  { id: "hat-crown",  name: "Couronne",         price: 200, emoji: "👑" },
  { id: "hat-cowboy", name: "Cowboy",           price: 250, emoji: "🤠" },
  { id: "hat-wizard", name: "Sorcier",          price: 300, emoji: "🧙" },
];

export interface FurnitureItem {
  id: string;
  name: string;
  price: number;
  emoji: string;
  bonus: string;
  setId?: string;
  col: number;
  row: number;
}

export const FURNITURE_ITEMS: FurnitureItem[] = [
  { id: "plant",     name: "Plante",   price: 80,  emoji: "🪴", bonus: "+2🪙 par tâche",      setId: "jardin", col: 1,  row: 5  },
  { id: "lamp",      name: "Lampe",    price: 120, emoji: "💡", bonus: "+10 XP par pomo",     setId: "bureau", col: 6,  row: 1  },
  { id: "coffee",    name: "Café",     price: 100, emoji: "☕", bonus: "+5🪙 par pomo",        setId: "salon",  col: 10, row: 5  },
  { id: "bookshelf", name: "Étagère",  price: 150, emoji: "📚", bonus: "+2🪙 par tâche",      setId: "bureau", col: 6,  row: 10 },
  { id: "couch",     name: "Canapé",   price: 200, emoji: "🛋️", bonus: "Nettoyage -10🪙",    setId: "salon",  col: 1,  row: 10 },
  { id: "cactus",    name: "Cactus",   price: 85,  emoji: "🌵", bonus: "+1🪙 par tâche",      setId: "jardin", col: 3,  row: 7  },
];

export interface FurnitureSet {
  id: string;
  name: string;
  emoji: string;
  items: string[];
  bonusDescription: string;
  xpPomoBonus?: number;
  coinsPomoBonus?: number;
  coinsTaskBonus?: number;
}

export const FURNITURE_SETS: FurnitureSet[] = [
  { id: "bureau", name: "Set Bureau Studieux", emoji: "📖", items: ["lamp", "bookshelf"], bonusDescription: "+20 XP par pomo",  xpPomoBonus: 20 },
  { id: "salon",  name: "Set Salon Cosy",      emoji: "🫖", items: ["coffee", "couch"],   bonusDescription: "+10🪙 par pomo",   coinsPomoBonus: 10 },
  { id: "jardin", name: "Set Jardin Zen",      emoji: "🌿", items: ["plant", "cactus"],   bonusDescription: "+4🪙 par tâche",   coinsTaskBonus: 4 },
];

export interface Task {
  id: string;
  userId: string;
  text: string;
  done: boolean;
  createdAt: number;
  category: string | null;
  type: "task" | "daily";
}

export type PomodoroPhase = "focus" | "short-break" | "long-break";

export interface SharedPomoState {
  phase: PomodoroPhase;
  remaining: number;
  running: boolean;
  participants: number;
  session: number;
}

export interface ProfileData {
  userId: string;
  name: string;
  color: number;
  hat: string | null;
  level: number;
  xp: number;
  xpProgress: number;
  xpToNext: number;
  coins: number;
  streak: number;
  degradation: number;
  achievements: string[];
  isAdmin: boolean;
}

export interface ClientToServerEvents {
  join: (payload: {
    name: string;
    color: number;
    col: number;
    row: number;
    userId: string;
  }) => void;
  move: (payload: { col: number; row: number }) => void;
  "avatar-state": (payload: { state: AvatarState }) => void;
  chat: (payload: { text: string }) => void;
  "private-message": (payload: { to: string; text: string }) => void;
  "task:add": (payload: {
    userId: string;
    text: string;
    category: string | null;
    type?: "task" | "daily";
  }) => void;
  "task:toggle": (payload: { userId: string; taskId: string }) => void;
  "task:update": (payload: {
    userId: string;
    taskId: string;
    text: string;
    category: string | null;
  }) => void;
  "task:delete": (payload: { userId: string; taskId: string }) => void;
  "pomodoro:complete": (payload: { userId: string }) => void;
  "pomo:join": () => void;
  "pomo:leave": () => void;
  "position:save": (payload: {
    userId: string;
    col: number;
    row: number;
  }) => void;
  "debug:unlock": (payload: { userId: string; key: string }) => void;
  "debug:grant-xp": (payload: { userId: string; amount: number }) => void;
  "debug:reset-xp": (payload: { userId: string }) => void;
  "debug:set-degradation": (payload: { userId: string; level: number }) => void;
  "room:clean": () => void;
  "shop:buy": (payload: { userId: string; itemId: string }) => void;
  "cosmetic:equip": (payload: { userId: string; hatId: string | null }) => void;
  "furniture:buy": (payload: { userId: string; itemId: string }) => void;
  "furniture:move": (payload: { userId: string; itemId: string; col: number; row: number }) => void;
  "admin:give-coins": (payload: { targetUserId: string; amount: number }) => void;
  "admin:give-xp": (payload: { targetUserId: string; xp: number }) => void;
  "admin:set-degradation": (payload: { targetUserId: string; level: number }) => void;
  "admin:announce": (payload: { message: string }) => void;
  "profile:request": (payload: { socketId: string | null }) => void;
  "chat:typing": () => void;
  "chat:react": (payload: { msgTs: number; emoji: string }) => void;
  "guild:create": (payload: { name: string }) => void;
  "guild:join": (payload: { guildId: string }) => void;
  "guild:leave": () => void;
  "guild:state-request": () => void;
}

export interface ServerToClientEvents {
  "room-state": (players: Player[]) => void;
  "player-joined": (player: Player) => void;
  "player-moved": (payload: { id: string; col: number; row: number }) => void;
  "player-state": (payload: { id: string; state: AvatarState }) => void;
  "player-left": (payload: { id: string }) => void;
  "chat-message": (msg: {
    id: string;
    name: string;
    color: number;
    text: string;
    ts: number;
  }) => void;
  "tasks:state": (payload: { tasks: Task[]; coins: number }) => void;
  "task:added": (task: Task) => void;
  "task:toggled": (payload: {
    taskId: string;
    done: boolean;
    coins: number;
  }) => void;
  "task:updated": (payload: {
    taskId: string;
    text: string;
    category: string | null;
  }) => void;
  "task:deleted": (payload: { taskId: string }) => void;
  "coins:update": (payload: { coins: number }) => void;
  "streak:update": (payload: { streak: number; bonus: number }) => void;
  "position:saved": (payload: { col: number; row: number }) => void;
  "pomo:state": (state: SharedPomoState) => void;
  "pomo:tick": (payload: {
    remaining: number;
    phase: PomodoroPhase;
    session: number;
  }) => void;
  "pomo:phase": (payload: {
    phase: PomodoroPhase;
    remaining: number;
    session: number;
  }) => void;
  "leaderboard-update": (
    entries: Array<{
      id: string;
      name: string;
      color: number;
      coins: number;
      state: AvatarState;
    }>,
  ) => void;
  "private-message": (msg: {
    from: string;
    fromName: string;
    fromColor: number;
    text: string;
    ts: number;
  }) => void;
  "task:completed-public": (payload: { socketId: string }) => void;
  "chat:typing": (payload: { id: string; name: string; color: number }) => void;
  "chat:react": (payload: { msgTs: number; emoji: string; fromId: string; fromColor: number }) => void;
  "achievement:unlocked": (payload: {
    key: string;
    label: string;
    desc: string;
    icon: string;
  }) => void;
  "achievement:public": (payload: {
    socketId: string;
    label: string;
    icon: string;
  }) => void;
  "xp:update": (payload: {
    xp: number;
    level: number;
    xpToNext: number;
    levelUp: boolean;
  }) => void;
  "level-up:public": (payload: { socketId: string; name: string; color: number; level: number }) => void;
  "degradation:update": (payload: { level: number }) => void;
  "cosmetics:state": (payload: { owned: string[]; equippedHat: string | null }) => void;
  "shop:bought": (payload: { itemId: string; coins: number }) => void;
  "player-hat": (payload: { id: string; hat: string | null }) => void;
  "furniture:state": (payload: { owned: string[]; positions: Record<string, { col: number; row: number }> }) => void;
  "furniture:bought": (payload: { itemId: string; coins: number }) => void;
  "admin:announce": (payload: { message: string }) => void;
  "profile:data": (data: ProfileData) => void;
  "guild:state": (data: GuildData) => void;
  "guild:boss-attacked": (payload: { damage: number; newHp: number; maxHp: number }) => void;
  "guild:boss-defeated": (payload: { bossLevel: number; reward: number }) => void;
}

export interface GuildMember {
  userId: string;
  name: string;
  color: number;
  isOwner: boolean;
  isOnline: boolean;
}

export interface GuildData {
  id: string;
  name: string;
  ownerId: string;
  level: number;
  bossHp: number;
  bossMaxHp: number;
  bossLevel: number;
  bossDefeated: number;
  members: GuildMember[];
}
