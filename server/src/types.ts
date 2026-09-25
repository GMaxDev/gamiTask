// Types partagés client ↔ serveur
export type AvatarState = "idle" | "walking" | "focus" | "pause" | "collective";

export interface Look {
  skin: string;
  head: "round" | "oval" | "square";
  bangs: string;
  back: string;
  hairColor: string;
  shirt: number;
  trousers: string;
  headphones: boolean;
  hat: string | null;
  eyes: string;
  brows: string;
  nose: string;
  mouth: string;
  eyesY: number;
  eyesGap: number;
  eyesSize: number;
  browsY: number;
  noseY: number;
  noseSize: number;
  mouthY: number;
  mouthSize: number;
  body: "slim" | "regular" | "round";
  topPattern: string;
  sleeves: "short" | "long";
  bottom: "trousers" | "shorts" | "skirt";
  shoes: string;
}

export interface Player {
  id: string;
  name: string;
  col: number;
  row: number;
  color: number;
  state: AvatarState;
  coins?: number;
  hat?: string | null;
  placed?: string[];
  positions?: Record<string, { col: number; row: number }>;
  pendingTaskIds?: string[];
  look?: Look;
}

export interface ShopItem {
  id: string;
  name: string;
  price: number;
  emoji: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "hat-party", name: "Chapeau fête", price: 100, emoji: "🎉" },
  { id: "hat-halo", name: "Halo", price: 150, emoji: "😇" },
  { id: "hat-crown", name: "Couronne", price: 200, emoji: "👑" },
  { id: "hat-cowboy", name: "Cowboy", price: 250, emoji: "🤠" },
  { id: "hat-wizard", name: "Sorcier", price: 300, emoji: "🧙" },
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
  {
    id: "plant",
    name: "Plante",
    price: 80,
    emoji: "🪴",
    bonus: "+2🪙 par tâche",
    setId: "jardin",
    col: 1,
    row: 5,
  },
  {
    id: "lamp",
    name: "Lampe",
    price: 120,
    emoji: "💡",
    bonus: "+10 XP par pomo",
    setId: "bureau",
    col: 6,
    row: 1,
  },
  {
    id: "coffee",
    name: "Café",
    price: 100,
    emoji: "☕",
    bonus: "+5🪙 par pomo",
    setId: "salon",
    col: 10,
    row: 5,
  },
  {
    id: "bookshelf",
    name: "Étagère",
    price: 150,
    emoji: "📚",
    bonus: "+2🪙 par tâche",
    setId: "bureau",
    col: 6,
    row: 10,
  },
  {
    id: "couch",
    name: "Canapé",
    price: 200,
    emoji: "🛋️",
    bonus: "Nettoyage -10🪙",
    setId: "salon",
    col: 1,
    row: 10,
  },
  {
    id: "cactus",
    name: "Cactus",
    price: 85,
    emoji: "🌵",
    bonus: "+1🪙 par tâche",
    setId: "jardin",
    col: 3,
    row: 7,
  },
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
  {
    id: "bureau",
    name: "Set Bureau Studieux",
    emoji: "📖",
    items: ["lamp", "bookshelf"],
    bonusDescription: "+20 XP par pomo",
    xpPomoBonus: 20,
  },
  {
    id: "salon",
    name: "Set Salon Cosy",
    emoji: "🫖",
    items: ["coffee", "couch"],
    bonusDescription: "+10🪙 par pomo",
    coinsPomoBonus: 10,
  },
  {
    id: "jardin",
    name: "Set Jardin Zen",
    emoji: "🌿",
    items: ["plant", "cactus"],
    bonusDescription: "+4🪙 par tâche",
    coinsTaskBonus: 4,
  },
];

export type TaskKind = "habit" | "daily" | "todo";
export type Difficulty = "trivial" | "easy" | "medium" | "hard";
export interface ChecklistItem {
  text: string;
  done: boolean;
}
export interface Task {
  id: string;
  userId: string;
  text: string;
  note: string;
  kind: TaskKind;
  difficulty: Difficulty;
  /** Valeur cachée : monte quand on réussit, baisse quand on rate. Module les gains et la teinte. */
  value: number;
  category: string | null;
  createdAt: number;
  /** todo validée / daily cochée aujourd'hui. Toujours false pour une habitude. */
  done: boolean;
  up: boolean;
  down: boolean;
  countUp: number;
  countDown: number;
  /** daily : bitmask lundi = 1 … dimanche = 64 */
  days: number;
  streak: number;
  dueAt: number | null;
  checklist: ChecklistItem[];
  completedAt: number | null;
}

export type PomodoroPhase = "focus" | "short-break" | "long-break";

export interface SharedPomoState {
  phase: PomodoroPhase;
  remaining: number;
  running: boolean;
  participants: number;
  session: number;
  names: string[];// display names of the participants, so the card can say who is there
}

// ── Rooms ─────────────────────────────────────────────────────────────────────
// `RoomId` peut être un id public fixe OU un UUID de room privée.
export type RoomId = string;

export const PUBLIC_ROOM_IDS = ["ocean", "forest", "sunset"] as const;
export type PublicRoomId = (typeof PUBLIC_ROOM_IDS)[number];
export const DEFAULT_ROOM_ID: PublicRoomId = "ocean";

// A Twitch chatter rendered as a wandering NPC — no real account, just a name and a random look.
export interface TwitchNpc {
  id: string;
  name: string;
  color: number;
  look: Look;
  col: number;
  row: number;
}

export const MAX_PUBLIC_ROOM = 20;
export const MAX_PRIVATE_ROOM = 10;

export interface RoomMeta {
  id: PublicRoomId;
  name: string;
  emoji: string;
  accent: number;
  floorTint: number;
  background: number;
  description: string;
}

export const PUBLIC_ROOMS_META: Record<PublicRoomId, RoomMeta> = {
  ocean: {
    id: "ocean",
    name: "Bookshop cozy",
    emoji: "📖",
    accent: 0xb85530,
    floorTint: 0xb89466,
    background: 0xe6d3ad,
    description: "Librairie-café, murs de livres, tapis terracotta",
  },
  forest: {
    id: "forest",
    name: "Café-jardin",
    emoji: "🌿",
    accent: 0x7a8e4a,
    floorTint: 0xc8b888,
    background: 0xe8e0c8,
    description: "Véranda lumineuse, plantes suspendues, banquettes sauge",
  },
  sunset: {
    id: "sunset",
    name: "Salon honey",
    emoji: "🍯",
    accent: 0xc89a3a,
    floorTint: 0xd8b878,
    background: 0xf0dba0,
    description: "Lumière chaude de fin d'après-midi, tasse fumante",
  },
};

/** Palette utilisée pour les rooms privées (même thème pour toutes pour cette v1) */
export const PRIVATE_ROOM_THEME = {
  emoji: "🏠",
  accent: 0xa04050,
  floorTint: 0xc8a888,
  background: 0xf0e0c0,
};

export function isPublicRoomId(v: unknown): v is PublicRoomId {
  return typeof v === "string" && (PUBLIC_ROOM_IDS as readonly string[]).includes(v);
}

/** Résumé d'une room envoyé par le serveur aux clients pour l'écran de sélection */
export interface RoomSummary {
  id: RoomId;
  name: string;
  emoji: string;
  accent: number;
  floorTint: number;
  background: number;
  description: string;
  capacity: number;
  count: number;
  isPrivate: boolean;
  ownerId: string | null;
  ownerName: string | null;
}

// Événements Client → Serveur
export interface ClientToServerEvents {
  join: (payload: {
    name: string;
    color: number;
    col: number;
    row: number;
    userId: string;
    roomId: RoomId;
    token?: string;
    tzOffsetMinutes?: number;
  }) => void;
  "room:switch": (payload: { roomId: RoomId }) => void;
  "room:create-private": (payload: { name: string }) => void;
  "room:delete-private": () => void;
  // Owner-only: exclude someone from this private room, right now and (optionally) for a while longer.
  "room:kick": (payload: { targetSocketId: string; durationMs: number | null }) => void;
  move: (payload: { col: number; row: number }) => void;
  "avatar-state": (payload: { state: AvatarState }) => void;
  chat: (payload: { text: string }) => void;
  "task:add": (payload: {
    text: string;
    kind?: TaskKind;
    difficulty?: Difficulty;
    category: string | null;
    note?: string;
    up?: boolean;
    down?: boolean;
    days?: number;
    dueAt?: number | null;
    checklist?: ChecklistItem[];
  }) => void;
  "task:score": (payload: { taskId: string; direction: "up" | "down" }) => void;
  "task:update": (payload: {
    taskId: string;
    patch: Partial<Pick<Task, "text" | "note" | "difficulty" | "category" | "up" | "down" | "days" | "dueAt" | "checklist">>;
  }) => void;
  "task:delete": (payload: { taskId: string }) => void;
  "pomodoro:start": (payload: { minutes: number }) => void;
  "pomodoro:complete": () => void;
  "pomo:join": () => void;
  "pomo:leave": () => void;
  "position:save": (payload: {
    col: number;
    row: number;
  }) => void;
  "shop:buy": (payload: { itemId: string }) => void;
  "cosmetic:equip": (payload: { hatId: string | null }) => void;
  "look:update": (payload: { look: Look }) => void;
  "furniture:buy": (payload: { itemId: string }) => void;
  "furniture:move": (payload: {
    itemId: string;
    col: number;
    row: number;
  }) => void;
  "furniture:toggle-place": (payload: {
    itemId: string;
  }) => void;
  "furniture:place": (payload: {
    itemId: string;
    col: number;
    row: number;
  }) => void;
  "catalog:save": (payload: { item: unknown }) => void;
  "catalog:delete": (payload: { id: string }) => void;
  "room:refresh": () => void;
  "profile:request": (payload: { socketId: string | null }) => void;
  "chat:typing": () => void;
  "chat:emote": (payload: { emoji: string }) => void;
}

// Événements Serveur → Client
export interface ServerToClientEvents {
  "me:state": (payload: { userId: string; role: "user" | "moderator" | "admin" }) => void;
  "auth:invalid": () => void;
  "catalog:state": (payload: { items: import("./catalog.ts").CatalogItem[] }) => void;
  "catalog:error": (payload: { message: string }) => void;
  "room-state": (players: Player[]) => void;
  "player-joined": (player: Player) => void;
  "player-moved": (payload: { id: string; col: number; row: number }) => void;
  "player-state": (payload: { id: string; state: AvatarState }) => void;
  "player-left": (payload: { id: string }) => void;
  // A linked streamer's live Twitch chatters, rendered as decorative wandering characters —
  // shared with everyone in the room, unlike the player-* events' real accounts.
  "npc:state": (npcs: TwitchNpc[]) => void;
  "npc:joined": (npc: TwitchNpc) => void;
  "npc:moved": (payload: { id: string; col: number; row: number }) => void;
  "npc:left": (payload: { id: string }) => void;
  // Private-room moderation: sent to the person just kicked out, or to anyone whose join/switch
  // attempt into a room was refused because they're already excluded from it.
  "room:kicked": (payload: { until: number | null }) => void;
  "room:banned": (payload: { until: number | null }) => void;
  "chat-message": (msg: {
    id: string;
    name: string;
    color: number;
    text: string;
    ts: number;
  }) => void;
  "tasks:state": (payload: { tasks: Task[]; coins: number; energy: number; exhausted: boolean }) => void;
  "task:added": (task: Task) => void;
  "task:scored": (payload: {
    task: Task;
    coins: number;
    xp: number;
    level: number;
    xpToNext: number;
    levelUp: boolean;
    energy: number;
  }) => void;
  "task:updated": (task: Task) => void;
  "day:rollover": (payload: { missed: Task[]; energy: number; energyDelta: number }) => void;
  "energy:update": (payload: { energy: number }) => void;
  "energy:exhausted": (payload: { coins: number }) => void;
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
    names: string[];// who was in the session when the phase turned
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
  "task:completed-public": (payload: { socketId: string }) => void;
  "tasks:public-update": (payload: {
    socketId: string;
    taskIds: string[];
  }) => void;
  "chat:typing": (payload: { id: string; name: string; color: number }) => void;
  "chat:emote": (payload: { id: string; emoji: string }) => void;
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
  "level-up:public": (payload: {
    socketId: string;
    name: string;
    color: number;
    level: number;
  }) => void;
  "cosmetics:state": (payload: {
    owned: string[];
    equippedHat: string | null;
    look?: Look;
  }) => void;
  "shop:bought": (payload: { itemId: string; coins: number }) => void;
  "player-hat": (payload: { id: string; hat: string | null }) => void;
  "player-look": (payload: { id: string; look: Look }) => void;
  "furniture:state": (payload: {
    owned: string[];
    placed: string[];
    positions: Record<string, { col: number; row: number }>;
  }) => void;
  "furniture:bought": (payload: { itemId: string; coins: number }) => void;
  "furniture:player-update": (payload: {
    id: string;
    placed: string[];
    positions: Record<string, { col: number; row: number }>;
  }) => void;
  "profile:data": (data: {
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
    energy: number;
    achievements: string[];
    isAdmin: boolean;
  }) => void;
  "session:replaced": () => void;
  "room:info": (payload: { roomId: RoomId }) => void;
  "rooms:list": (payload: { rooms: RoomSummary[] }) => void;
  "room:full": (payload: { roomId: RoomId }) => void;
  "private-room:deleted": (payload: {
    roomId: RoomId;
    fallbackRoomId: RoomId;
  }) => void;
}
