import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import "./App.css";
import { GameScene } from "./engine/GameScene";
import {
  PomodoroTimer,
  formatTime,
  type PomodoroPhase,
  type PomodoroStatus,
  type PomodoroConfig,
  DEFAULT_CONFIG,
} from "./engine/PomodoroTimer";
import { SocketClient, type ChatMessage } from "./net/SocketClient";
import type {
  AvatarState,
  Task,
  SharedPomoState,
  ProfileData,
  GuildData,
  VideoState,
  RoomId,
  RoomSummary,
  PublicRoomId,
} from "./net/types";
import {
  PUBLIC_ROOMS_META,
  PRIVATE_ROOM_THEME,
  DEFAULT_ROOM_ID,
  isPublicRoomId,
} from "./net/types";
import { RoomSelectScreen } from "./components/RoomSelectScreen";
import { TaskPanel } from "./components/TaskPanel";
import { ShopPanel } from "./components/ShopPanel";
import { ProfilePanel } from "./components/ProfilePanel";
import { OnboardingOverlay } from "./components/OnboardingOverlay";
import { GuildPanel } from "./components/GuildPanel";
import {
  playPomoDone,
  playPomoBreak,
  playCoin,
  playChatSpatial,
  playCoinSpatial,
  playMention,
} from "./engine/SoundEngine";
import { AuthScreen, type AuthResult } from "./components/AuthScreen";
import { FeedbackModal } from "./components/FeedbackModal";
import { AudioPanel } from "./components/AudioPanel";
import { AmbiancePanel } from "./components/AmbiancePanel";

function loadPomoConfig(): PomodoroConfig {
  try {
    const raw = localStorage.getItem("pomoConfig");
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    // JSON invalide → on ignore
  }
  return { ...DEFAULT_CONFIG };
}

// Polyfill UUID — crypto.randomUUID() n'est disponible qu'en HTTPS/localhost
function generateUUID(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback pour HTTP non-sécurisé
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Identifiant persistant de l'utilisateur (cross-session, stocké dans localStorage)
const LOCAL_USER_ID = (() => {
  let id = localStorage.getItem("gamitask-userId");
  if (!id) {
    id = generateUUID();
    localStorage.setItem("gamitask-userId", id);
  }
  return id;
})();

const PHASE_LABEL: Record<PomodoroPhase, string> = {
  focus: "🍅 Focus",
  "short-break": "☕ Pause",
  "long-break": "🛋️ Grande pause",
};

const PALETTE: { hex: number; css: string; label: string }[] = [
  { hex: 0x4f8ef7, css: "#4f8ef7", label: "Bleu" },
  { hex: 0xe05c97, css: "#e05c97", label: "Rose" },
  { hex: 0x5ecf6a, css: "#5ecf6a", label: "Vert" },
  { hex: 0xf7a94f, css: "#f7a94f", label: "Orange" },
  { hex: 0xa855f7, css: "#a855f7", label: "Violet" },
  { hex: 0x06b6d4, css: "#06b6d4", label: "Cyan" },
  { hex: 0xf43f5e, css: "#f43f5e", label: "Rouge" },
  { hex: 0xfbbf24, css: "#fbbf24", label: "Jaune" },
];

// ── Dialogue d'entrée ─────────────────────────────────────────────────────────
interface JoinInfo {
  name: string;
  color: number;
  colorCss: string;
  userId: string;
  isAdmin: boolean;
  isGoogleUser: boolean;
  roomId: RoomId;
}

const ROOM_STORAGE_KEY = "gamitask-selected-room";
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function loadSelectedPublicRoom(): PublicRoomId | null {
  const raw = localStorage.getItem(ROOM_STORAGE_KEY);
  return isPublicRoomId(raw) ? raw : null;
}

function hexToCSS(hex: number): string {
  return "#" + hex.toString(16).padStart(6, "0");
}

function JoinDialog({
  onJoin,
  prefill,
}: {
  onJoin: (info: Omit<JoinInfo, "userId" | "isAdmin" | "roomId" | "isGoogleUser">) => void;
  prefill?: { name: string; color: number };
}) {
  const defaultColorIdx = prefill
    ? Math.max(
        0,
        PALETTE.findIndex((p) => p.hex === prefill.color),
      )
    : 0;
  const [name, setName] = useState(prefill?.name ?? "");
  const [colorIdx, setColorIdx] = useState(defaultColorIdx);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onJoin({
      name: trimmed,
      color: PALETTE[colorIdx].hex,
      colorCss: PALETTE[colorIdx].css,
    });
  };

  const selected = PALETTE[colorIdx];

  return (
    <div id="join-overlay">
      <form id="join-dialog" onSubmit={handleSubmit}>
        <div id="join-avatar-preview" style={{ background: selected.css }} />
        <h1 id="join-title">GamiTask</h1>
        <p id="join-subtitle">Rejoins la salle de coworking</p>

        <label className="join-label" htmlFor="join-name">
          Ton pseudo
        </label>
        <input
          id="join-name"
          type="text"
          autoFocus
          maxLength={20}
          placeholder="Ex : Alice"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="join-label">Couleur de ton avatar</label>
        <div id="join-palette">
          {PALETTE.map((p, i) => (
            <button
              key={i}
              type="button"
              className={`join-swatch${i === colorIdx ? " selected" : ""}`}
              style={{ background: p.css }}
              aria-label={p.label}
              onClick={() => setColorIdx(i)}
            />
          ))}
        </div>

        <button id="join-submit" type="submit" disabled={!name.trim()}>
          Entrer dans la salle →
        </button>
      </form>
    </div>
  );
}

function Room({
  joinInfo,
  onLogout,
  onRoomChange,
  roomsList,
  onRoomsListUpdate,
}: {
  joinInfo: JoinInfo;
  onLogout: () => void;
  onRoomChange: (roomId: RoomId) => void;
  roomsList: RoomSummary[];
  onRoomsListUpdate: (rooms: RoomSummary[]) => void;
}) {
  const LOCAL_NAME = joinInfo.name;
  const LOCAL_COLOR = joinInfo.color;
  // joinInfo.userId remplace le LOCAL_USER_ID du module (shadowing intentionnel)
  const LOCAL_USER_ID = joinInfo.userId;
  const IS_ADMIN = joinInfo.isAdmin;
  const IS_GOOGLE_USER = joinInfo.isGoogleUser;
  const ROOM_ID = joinInfo.roomId;
  // Meta de la room : publique via PUBLIC_ROOMS_META, sinon thème privé générique.
  // Le nom réel est récupéré depuis roomsList (mis à jour par le socket).
  const currentRoomSummary = roomsList.find((r) => r.id === ROOM_ID);
  const ROOM_META = isPublicRoomId(ROOM_ID)
    ? PUBLIC_ROOMS_META[ROOM_ID]
    : {
        name: currentRoomSummary?.name ?? "Room privée",
        emoji: PRIVATE_ROOM_THEME.emoji,
        accent: PRIVATE_ROOM_THEME.accent,
        floorTint: PRIVATE_ROOM_THEME.floorTint,
        background: PRIVATE_ROOM_THEME.background,
        description: currentRoomSummary?.description ?? "Room privée",
      };
  const isInPrivateRoom = !isPublicRoomId(ROOM_ID);
  const isRoomOwner =
    isInPrivateRoom && currentRoomSummary?.ownerId === LOCAL_USER_ID;
  const [roomSwitcherOpen, setRoomSwitcherOpen] = useState(false);
  const [roomFullToast, setRoomFullToast] = useState<string | null>(null);
  // Refs stables pour accès à des valeurs fraîches dans des callbacks mémo'd
  const joinInfoRef = useRef(joinInfo);
  const onRoomChangeRef = useRef(onRoomChange);
  const onRoomsListUpdateRef = useRef(onRoomsListUpdate);
  const roomsListRef = useRef(roomsList);
  useEffect(() => {
    joinInfoRef.current = joinInfo;
  }, [joinInfo]);
  useEffect(() => {
    onRoomChangeRef.current = onRoomChange;
  }, [onRoomChange]);
  useEffect(() => {
    onRoomsListUpdateRef.current = onRoomsListUpdate;
  }, [onRoomsListUpdate]);
  useEffect(() => {
    roomsListRef.current = roomsList;
  }, [roomsList]);

  // Demander la permission de notifications navigateur dès l'entrée
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const timerRef = useRef<PomodoroTimer | null>(null);
  const socketRef = useRef<SocketClient | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dmEndRef = useRef<HTMLDivElement>(null);
  // Stack pour la touche Échap : liste ordonnée des panels ouverts (le dernier = le plus récent)
  const panelStackRef = useRef<string[]>([]);
  // Joueurs reçus avant que la scène soit prête (room-state arrive avant init async PixiJS)
  const pendingRoomRef = useRef<import("./net/types").Player[] | null>(null);

  const [phase, setPhase] = useState<PomodoroPhase>("focus");
  const [status, setStatus] = useState<PomodoroStatus>("idle");
  const [pomoConfig, setPomoConfig] = useState<PomodoroConfig>(loadPomoConfig);
  const pomoConfigRef = useRef<PomodoroConfig>(loadPomoConfig());
  const [pomoSettingsOpen, setPomoSettingsOpen] = useState(false);
  const [draftConfig, setDraftConfig] =
    useState<PomodoroConfig>(loadPomoConfig);
  const [display, setDisplay] = useState(() =>
    formatTime(loadPomoConfig().focus * 60),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatSize, setChatSize] = useState<"normal" | "expanded" | "hidden">(
    "normal",
  );
  const [chatNotified, setChatNotified] = useState(false);
  const [showNotifiedOnly, setShowNotifiedOnly] = useState(false);
  const chatSizeRef = useRef<"normal" | "expanded" | "hidden">(chatSize);

  const filteredMessages = useMemo(() => {
    if (!showNotifiedOnly) return messages;
    // Filtre simple : afficher uniquement les messages qui mentionnent l'utilisateur
    const mentionRegex = new RegExp(`@${LOCAL_NAME}`, "i");
    return messages.filter((m) => mentionRegex.test(m.text));
  }, [messages, showNotifiedOnly]);

  useEffect(() => {
    chatSizeRef.current = chatSize;
  }, [chatSize]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [coins, setCoins] = useState(0);
  const [lastTaskCoinGain, setLastTaskCoinGain] = useState(10);
  const [streak, setStreak] = useState(0);
  const [streakBonus, setStreakBonus] = useState<number | null>(null);
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(0);
  const [degradation, setDegradation] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [ownedItems, setOwnedItems] = useState<string[]>([]);
  const [equippedHat, setEquippedHat] = useState<string | null>(null);
  const [ownedFurniture, setOwnedFurniture] = useState<string[]>([]);
  const [placedFurniture, setPlacedFurniture] = useState<string[]>([]);
  const [furniturePositions, setFurniturePositions] = useState<
    Record<string, { col: number; row: number }>
  >({});
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [collectivePomo, setCollectivePomo] = useState<SharedPomoState | null>(
    null,
  );
  const isInCollectivePomoRef = useRef(false);
  const [leaderboard, setLeaderboard] = useState<
    Array<{
      id: string;
      name: string;
      color: number;
      coins: number;
      state: import("./net/types").AvatarState;
    }>
  >([]);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [dmMessages, setDmMessages] = useState<Map<string, ChatMessage[]>>(
    new Map(),
  );
  const [openDm, setOpenDm] = useState<{
    id: string;
    name: string;
    color: number;
  } | null>(null);
  const [dmUnread, setDmUnread] = useState<Map<string, number>>(new Map());
  const [dmInput, setDmInput] = useState("");
  const [mySocketId, setMySocketId] = useState<string | undefined>(undefined);
  const [achievementToast, setAchievementToast] = useState<{
    label: string;
    desc: string;
    icon: string;
  } | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>(
    [],
  );
  const [debugOpen, setDebugOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [audioPanelOpen, setAudioPanelOpen] = useState(false);
  const [ambiancePanelOpen, setAmbiancePanelOpen] = useState(false);
  const [sharedVideo, setSharedVideo] = useState<VideoState | null>(null);
  const [adminTarget, setAdminTarget] = useState(LOCAL_USER_ID);
  const [adminAmount, setAdminAmount] = useState("100");
  const [adminMsg, setAdminMsg] = useState("");
  const [typingUsers, setTypingUsers] = useState<
    Map<string, { name: string; color: number }>
  >(new Map());
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const lastTypingSent = useRef(0);
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [roomMembers, setRoomMembers] = useState<
    Map<string, { name: string; color: number }>
  >(new Map());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSelIdx, setMentionSelIdx] = useState(0);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const onboardingDoneRef = useRef(
    localStorage.getItem("gamitask-onboarding-done") === "1",
  );
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [guildData, setGuildData] = useState<GuildData | null>(null);
  const [guildPanelOpen, setGuildPanelOpen] = useState(false);
  const [guildBossToast, setGuildBossToast] = useState<{
    reward: number;
    bossLevel: number;
  } | null>(null);

  // ── Scène PixiJS ────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    (async () => {
      const scene = new GameScene(LOCAL_NAME, LOCAL_COLOR, {
        background: ROOM_META.background,
        floorTint: ROOM_META.floorTint,
      });
      sceneRef.current = scene;
      await scene.init(canvas);
      if (cancelled) {
        scene.destroy();
        return;
      }

      // Brancher le callback de déplacement local → socket
      scene.onLocalMove = (col, row) => {
        socketRef.current?.move(col, row);
        socketRef.current?.savePosition(LOCAL_USER_ID, col, row);
      };
      // Callback déplacement de meuble → socket
      scene.onFurnitureMoved = (itemId, col, row) => {
        socketRef.current?.moveFurniture(LOCAL_USER_ID, itemId, col, row);
      };
      // Callback placement fantôme → socket
      scene.onFurniturePlaced = (itemId, col, row) => {
        socketRef.current?.placeFurniture(LOCAL_USER_ID, itemId, col, row);
      };
      // Broadcaster l'état walking au début/fin du déplacement
      scene.onLocalStateChange = (state) => {
        socketRef.current?.setAvatarState(state);
      };

      // Appliquer les joueurs déjà en salle (arrivés pendant l'init async)
      const pending = pendingRoomRef.current ?? [];
      for (const p of pending) {
        scene.addRemoteAvatar(p.id, p.name, p.color, p.col, p.row, p.hat);
        scene.setRemoteAvatarState(p.id, p.state);
        if (p.placed && p.positions) {
          scene.setOtherPlayerFurniture(p.id, p.placed, p.positions);
        }
        if (p.pendingTaskIds?.length) {
          scene.setOtherPlayerScrolls(p.id, p.name, p.pendingTaskIds);
        }
      }
      if (pending.length > 0) {
        setRoomMembers(
          new Map(pending.map((p) => [p.id, { name: p.name, color: p.color }])),
        );
      }
      pendingRoomRef.current = null;

      // Annoncer notre présence avec la vraie position (après initLocalAvatar)
      socketRef.current?.join(
        LOCAL_NAME,
        LOCAL_COLOR,
        scene.localCol,
        scene.localRow,
        LOCAL_USER_ID,
        joinInfo.roomId,
      );
    })();
    return () => {
      cancelled = true;
      sceneRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [LOCAL_NAME, LOCAL_COLOR, LOCAL_USER_ID]);

  // Réappliquer le thème + reset des avatars lorsqu'on change de room
  // (le scene.initialized se fait dans useEffect au-dessus, donc on attend)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene?.initialized) return;
    scene.setTheme({
      background: ROOM_META.background,
      floorTint: ROOM_META.floorTint,
    });
    scene.clearRemoteAvatars();
    setRoomMembers(new Map());
  }, [ROOM_ID, ROOM_META.background, ROOM_META.floorTint]);

  // ── Timer Pomodoro ───────────────────────────────────────────
  useEffect(() => {
    const timer = new PomodoroTimer(pomoConfigRef.current);
    timerRef.current = timer;

    const unsub = timer.on((event) => {
      if (event.type === "tick") {
        setDisplay(formatTime(event.remaining));
      } else if (event.type === "status-change") {
        setStatus(event.status);
        let avatarState: AvatarState = "idle";
        if (event.status === "running") {
          avatarState = timer.getState().phase === "focus" ? "focus" : "pause";
        }
        sceneRef.current?.setAvatarState(avatarState);
        socketRef.current?.setAvatarState(avatarState);
      } else if (event.type === "phase-change") {
        setPhase(event.phase);
        setDisplay(formatTime(event.remaining));
        sceneRef.current?.setAvatarState("idle");
        socketRef.current?.setAvatarState("idle");
        // Sons
        if (event.phase !== "focus") {
          playPomoDone();
        } else {
          playPomoBreak();
        }
        // Notification navigateur
        if (document.hidden && Notification.permission === "granted") {
          const label =
            event.phase === "focus"
              ? "🍅 C'est reparti !"
              : event.phase === "short-break"
                ? "☕ Pause courte"
                : "🛋️ Grande pause";
          new Notification("GamiTask — Pomodoro", {
            body: label,
            icon: "/favicon.ico",
          });
        }
        // Un cycle Focus vient de se terminer → +25 pièces (sauf si pomo collectif actif)
        if (event.phase !== "focus" && !isInCollectivePomoRef.current) {
          socketRef.current?.pomodoroComplete(LOCAL_USER_ID);
        }
      }
    });

    return () => {
      unsub();
      timer.destroy();
    };
  }, [LOCAL_USER_ID]);

  // ── Parchemins physiques : sync tâches → scène ───────────────
  useEffect(() => {
    sceneRef.current?.setTasks(
      tasks.map((t) => ({
        id: t.id,
        done: t.done,
        text: t.text,
        ownerName: LOCAL_NAME,
      })),
    );
  }, [tasks, LOCAL_NAME]);

  // ── Mobilier : meubles visibles uniquement dans la room privée de l'owner ─
  useEffect(() => {
    if (isRoomOwner) {
      sceneRef.current?.setFurniture(placedFurniture, furniturePositions);
    } else {
      sceneRef.current?.setFurniture([], {});
    }
  }, [placedFurniture, furniturePositions, isRoomOwner]);

  // ── Socket.IO ────────────────────────────────────────────────
  useEffect(() => {
    const client = new SocketClient({
      onRoomState: (players) => {
        setMySocketId((prev) => prev ?? socketRef.current?.socketId);
        const scene = sceneRef.current;
        if (!scene?.initialized) {
          // Scène pas encore prête : stocker, sera appliqué après init
          pendingRoomRef.current = players;
          return;
        }
        for (const p of players) {
          scene.addRemoteAvatar(p.id, p.name, p.color, p.col, p.row, p.hat);
          scene.setRemoteAvatarState(p.id, p.state);
          if (p.placed && p.positions) {
            scene.setOtherPlayerFurniture(p.id, p.placed, p.positions);
          }
          if (p.pendingTaskIds?.length) {
            scene.setOtherPlayerScrolls(p.id, p.name, p.pendingTaskIds);
          }
        }
        setRoomMembers(
          new Map(players.map((p) => [p.id, { name: p.name, color: p.color }])),
        );
        client.requestGuildState();
      },
      onPlayerJoined: (p) => {
        sceneRef.current?.addRemoteAvatar(
          p.id,
          p.name,
          p.color,
          p.col,
          p.row,
          p.hat,
        );
        if (p.placed && p.positions) {
          sceneRef.current?.setOtherPlayerFurniture(
            p.id,
            p.placed,
            p.positions,
          );
        }
        if (p.pendingTaskIds?.length) {
          sceneRef.current?.setOtherPlayerScrolls(p.id, p.name, p.pendingTaskIds);
        }
        setRoomMembers((prev) => {
          const next = new Map(prev);
          next.set(p.id, { name: p.name, color: p.color });
          return next;
        });
      },
      onPlayerMoved: (id, col, row) => {
        sceneRef.current?.moveRemoteAvatar(id, col, row);
      },
      onPlayerState: (id, state) => {
        sceneRef.current?.setRemoteAvatarState(id, state);
      },
      onPlayerLeft: (id) => {
        sceneRef.current?.removeRemoteAvatar(id);
        sceneRef.current?.removeOtherPlayerFurniture(id);
        setRoomMembers((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        // Nettoyer le typing indicator si le joueur déconnecte
        setTypingUsers((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      },
      onChatMessage: (msg) => {
        // Ignorer l'écho serveur de nos propres messages (déjà affichés localement)
        if (msg.id === socketRef.current?.socketId) return;
        const isMention = msg.text.includes(`@${LOCAL_NAME}`);
        setMessages((prev) => [
          ...prev.slice(-99),
          msg,
        ]);
        sceneRef.current?.showRemoteChat(msg.id, msg.text);
        setUnreadCount((n) => n + 1);
        if (isMention) {
          setChatNotified(true);
          if (Notification.permission === "granted") {
            new Notification("GamiTask — Nouveau message", {
              body: `${msg.name} : ${msg.text}`,
              icon: "/favicon.ico",
            });
          }
        }
        const dist = sceneRef.current?.distanceTo(msg.id) ?? Infinity;
        if (isMention) {
          playMention();
        } else {
          playChatSpatial(dist);
        }
      },
      onTasksState: (loadedTasks, loadedCoins) => {
        setTasks(loadedTasks);
        setCoins(loadedCoins);
      },
      onTaskAdded: (task) => {
        setTasks((prev) => [...prev, task]);
      },
      onTaskToggled: (taskId, done, updatedCoins) => {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, done } : t)),
        );
        if (done) {
          setCoins((prev) => {
            const gain = Math.max(0, updatedCoins - prev);
            setLastTaskCoinGain(gain);
            sceneRef.current?.showLocalCoin(`+${gain}🪙`);
            return updatedCoins;
          });
          playCoin();
        } else {
          setCoins(updatedCoins);
        }
      },
      onTaskUpdated: (taskId, text, category) => {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, text, category } : t)),
        );
      },
      onTaskDeleted: (taskId) => {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      },
      onCoinsUpdate: (updatedCoins) => {
        setCoins(updatedCoins);
        playCoin();
      },
      onStreakUpdate: (newStreak, bonus) => {
        setStreak(newStreak);
        if (bonus > 0) {
          setStreakBonus(bonus);
          setTimeout(() => setStreakBonus(null), 2500);
        }
      },
      onPositionSaved: (col, row) => {
        // Repositionner l'avatar local à la position persistante
        sceneRef.current?.teleportLocalAvatar(col, row);
      },
      onPomoState: (state) => {
        isInCollectivePomoRef.current = true;
        setCollectivePomo(state);
        // On reçoit pomo:state parce qu'on vient de rejoindre → pastille dorée immédiatement
        sceneRef.current?.setAvatarState("collective");
        socketRef.current?.setAvatarState("collective");
      },
      onPomoTick: (remaining, phase, session) => {
        setCollectivePomo((prev) =>
          prev ? { ...prev, remaining, phase, session, running: true } : null,
        );
        // S'assurer que la pastille dorée est bien active (tick = timer en cours)
        if (sceneRef.current?.getLocalAvatarState() !== "collective") {
          sceneRef.current?.setAvatarState("collective");
          socketRef.current?.setAvatarState("collective");
        }
      },
      onPomoPhase: (phase, remaining, session) => {
        setCollectivePomo((prev) =>
          prev ? { ...prev, phase, remaining, session, running: false } : null,
        );
        // Transition entre phases : rester en 'collective'
        sceneRef.current?.setAvatarState("collective");
        socketRef.current?.setAvatarState("collective");
      },
      onLeaderboardUpdate: (entries) => {
        setLeaderboard(entries);
      },
      onPrivateMessage: ({ from, fromName, fromColor, text, ts }) => {
        const msg: ChatMessage = {
          id: from,
          name: fromName,
          color: fromColor,
          text,
          ts,
        };
        setDmMessages((prev) => {
          const next = new Map(prev);
          const thread = next.get(from) ?? [];
          next.set(from, [...thread.slice(-99), msg]);
          return next;
        });
        setDmUnread((prev) => {
          const next = new Map(prev);
          next.set(from, (next.get(from) ?? 0) + 1);
          return next;
        });
      },
      onTaskCompletedPublic: (socketId) => {
        sceneRef.current?.showRemoteCoin(socketId, "+10🪙");
        const dist = sceneRef.current?.distanceTo(socketId) ?? Infinity;
        playCoinSpatial(dist);
      },
      onAchievementUnlocked: ({ key, label, desc, icon }) => {
        setAchievementToast({ label, desc, icon });
        setTimeout(() => setAchievementToast(null), 5600);
        sceneRef.current?.showLocalCoin(icon);
        setUnlockedAchievements((prev) =>
          prev.includes(key) ? prev : [...prev, key],
        );
      },
      onAchievementPublic: (socketId, label, icon) => {
        sceneRef.current?.showRemoteCoin(socketId, `${icon} ${label}`);
      },
      onTyping: (id, name, color) => {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(id, { name, color });
          return next;
        });
        // Effacer après 3 s si pas de nouveau signal
        const existing = typingTimers.current.get(id);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          typingTimers.current.delete(id);
        }, 3000);
        typingTimers.current.set(id, t);
      },
      onChatReact: () => {},
      onXpUpdate: (newXp, newLevel, _xpToNext, levelUp) => {
        setXp(newXp);
        setLevel(newLevel);
        if (levelUp) {
          sceneRef.current?.showLocalCoin(`⬆ Niveau ${newLevel} !`);
        }
      },
      onLevelUpPublic: (socketId, name, _color, lvl) => {
        sceneRef.current?.showRemoteCoin(socketId, `⬆ Lv ${lvl} ${name} !`);
      },
      onDegradationUpdate: (lvl) => {
        setDegradation(lvl);
        sceneRef.current?.setDegradationLevel(lvl);
      },
      onCosmeticsState: ({ owned, equippedHat: hat }) => {
        setOwnedItems(owned);
        setEquippedHat(hat);
        sceneRef.current?.setLocalHat(hat);
      },
      onShopBought: () => {
        // coins:update déjà géré par onCoinsUpdate
      },
      onPlayerHat: ({ id, hat }) => {
        sceneRef.current?.setRemoteHat(id, hat);
      },
      onFurnitureState: ({ owned, placed, positions }) => {
        const activePlaced = placed ?? owned;
        setOwnedFurniture(owned);
        setPlacedFurniture(activePlaced);
        setFurniturePositions(positions);
        // Le rendu de la scène est géré par l'effect qui vérifie isRoomOwner.
      },
      onFurnitureBought: () => {
        // furniture:state est déjà émis après l'achat
      },
      onFurniturePlayerUpdate: ({ id, placed, positions }) => {
        sceneRef.current?.setOtherPlayerFurniture(id, placed, positions);
      },
      onAdminAnnounce: ({ message }) => {
        const sysMsg: ChatMessage = {
          id: "__system__",
          name: "🔔 Annonce",
          color: 0xfbbf24,
          text: message,
          ts: Date.now(),
        };
        setMessages((prev) => [...prev.slice(-99), sysMsg]);
        setUnreadCount((n) => n + 1);
      },
      onProfileData: (data) => {
        setProfileData(data);
      },
      onGuildState: (data) => {
        setGuildData(data.id ? data : null);
      },
      onGuildBossAttacked: () => {
        // feedback visuel minimal — le guild panel se mettra à jour via onGuildState
      },
      onGuildBossDefeated: ({ bossLevel, reward }) => {
        setGuildBossToast({ bossLevel, reward });
        setTimeout(() => setGuildBossToast(null), 6000);
      },
      onEmote: (id, emoji) => {
        sceneRef.current?.showRemoteEmote(id, emoji);
      },
      onPublicTasksUpdate: (socketId, taskIds) => {
        sceneRef.current?.setOtherPlayerScrolls(socketId, "", taskIds);
      },
      onVideoState: (state) => setSharedVideo(state),
      onVideoUpdate: (state) => {
        setSharedVideo(state.videoId ? state : null);
      },
      onRoomInfo: (roomId) => {
        // Le serveur nous a assigné/confirmé cette room. Synchroniser le state
        // React seulement si différent (évite une boucle de setState).
        const current = joinInfoRef.current?.roomId;
        if (roomId !== current) onRoomChangeRef.current?.(roomId);
      },
      onRoomsList: (rooms) => {
        onRoomsListUpdateRef.current?.(rooms);
      },
      onRoomFull: (roomId) => {
        const r = roomsListRef.current.find((rr) => rr.id === roomId);
        setRoomFullToast(
          `🚫 Room ${r?.name ?? "cible"} pleine (${r?.capacity ?? "?"} max)`,
        );
        setTimeout(() => setRoomFullToast(null), 3500);
      },
      onPrivateRoomDeleted: (_roomId, fallbackRoomId) => {
        setRoomFullToast(
          "🗑️ Cette room privée a été supprimée. Retour dans la room par défaut.",
        );
        setTimeout(() => setRoomFullToast(null), 3500);
        onRoomChangeRef.current?.(fallbackRoomId);
      },
    });
    socketRef.current = client;
    return () => {
      client.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [LOCAL_NAME, LOCAL_COLOR, LOCAL_USER_ID]);

  // ── Onboarding : déclencher pour les nouveaux joueurs ──────────────────────
  useEffect(() => {
    if (
      !onboardingDoneRef.current &&
      xp === 0 &&
      coins === 0 &&
      tasks.length === 0
    ) {
      queueMicrotask(() => setShowOnboarding(true));
    }
  }, [tasks, xp, coins]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [showNotifiedOnly]);

  // Auto-scroll DM
  useEffect(() => {
    if (openDm) dmEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages, openDm]);

  // ── Handlers ────────────────────────────────────────────────
  const handleToggle = useCallback(() => {
    timerRef.current?.toggle();
  }, []);
  const handleReset = useCallback(() => {
    timerRef.current?.reset();
    setDisplay(formatTime(pomoConfigRef.current.focus * 60));
    setPhase("focus");
    setStatus("idle");
  }, []);

  const handleSaveConfig = useCallback(() => {
    const cfg: PomodoroConfig = {
      focus: Math.max(1, Math.min(99, Math.round(draftConfig.focus))),
      shortBreak: Math.max(1, Math.min(99, Math.round(draftConfig.shortBreak))),
      longBreak: Math.max(1, Math.min(99, Math.round(draftConfig.longBreak))),
    };
    pomoConfigRef.current = cfg;
    setPomoConfig(cfg);
    localStorage.setItem("pomoConfig", JSON.stringify(cfg));
    timerRef.current?.setDurations(cfg);
    if (timerRef.current?.getState().status === "idle") {
      timerRef.current.reset();
      setDisplay(formatTime(cfg.focus * 60));
      setPhase("focus");
    }
    setPomoSettingsOpen(false);
  }, [draftConfig]);

  // Barre espace → recentrer / P → toggle pomo (sauf si focus sur un input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        sceneRef.current?.centerView();
      } else if (e.code === "KeyP") {
        e.preventDefault();
        timerRef.current?.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Suivi de la pile d'ouverture des panels ────────────────────────────────
  // Chaque useEffect ajoute/retire l'id du panel au ref de pile quand son état change.
  // Le ref est utilisé par le handler Échap ci-dessous (setters stables, pas de deps).
  useEffect(() => {
    const s = panelStackRef.current;
    if (taskPanelOpen) { if (!s.includes("tasks")) s.push("tasks"); }
    else { panelStackRef.current = s.filter((p) => p !== "tasks"); }
  }, [taskPanelOpen]);
  useEffect(() => {
    const s = panelStackRef.current;
    if (shopOpen) { if (!s.includes("shop")) s.push("shop"); }
    else { panelStackRef.current = s.filter((p) => p !== "shop"); }
  }, [shopOpen]);
  useEffect(() => {
    const s = panelStackRef.current;
    if (leaderboardOpen) { if (!s.includes("leaderboard")) s.push("leaderboard"); }
    else { panelStackRef.current = s.filter((p) => p !== "leaderboard"); }
  }, [leaderboardOpen]);
  useEffect(() => {
    const s = panelStackRef.current;
    if (guildPanelOpen) { if (!s.includes("guild")) s.push("guild"); }
    else { panelStackRef.current = s.filter((p) => p !== "guild"); }
  }, [guildPanelOpen]);
  useEffect(() => {
    const s = panelStackRef.current;
    if (profileData) { if (!s.includes("profile")) s.push("profile"); }
    else { panelStackRef.current = s.filter((p) => p !== "profile"); }
  }, [profileData]);
  useEffect(() => {
    const s = panelStackRef.current;
    if (feedbackOpen) { if (!s.includes("feedback")) s.push("feedback"); }
    else { panelStackRef.current = s.filter((p) => p !== "feedback"); }
  }, [feedbackOpen]);
  useEffect(() => {
    const s = panelStackRef.current;
    if (audioPanelOpen) { if (!s.includes("audio")) s.push("audio"); }
    else { panelStackRef.current = s.filter((p) => p !== "audio"); }
  }, [audioPanelOpen]);
  useEffect(() => {
    const s = panelStackRef.current;
    if (ambiancePanelOpen) { if (!s.includes("ambiance")) s.push("ambiance"); }
    else { panelStackRef.current = s.filter((p) => p !== "ambiance"); }
  }, [ambiancePanelOpen]);
  useEffect(() => {
    const s = panelStackRef.current;
    if (openDm) { if (!s.includes("dm")) s.push("dm"); }
    else { panelStackRef.current = s.filter((p) => p !== "dm"); }
  }, [openDm]);

  // Échap → ferme le dernier panel ouvert
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Laisser le comportement natif si on est dans un input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const stack = panelStackRef.current;
      if (stack.length === 0) return;
      e.preventDefault();
      const top = stack[stack.length - 1];
      switch (top) {
        case "tasks":       setTaskPanelOpen(false); break;
        case "shop":        setShopOpen(false); break;
        case "leaderboard": setLeaderboardOpen(false); break;
        case "guild":       setGuildPanelOpen(false); break;
        case "profile":     setProfileData(null); break;
        case "feedback":    setFeedbackOpen(false); break;
        case "audio":       setAudioPanelOpen(false); break;
        case "ambiance":    setAmbiancePanelOpen(false); break;
        case "dm":          setOpenDm(null); break;
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []); // setters React sont stables, panelStackRef est un ref — aucune dépendance nécessaire

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const seen = new Set<string>();
    const list: { name: string; color: number }[] = [];
    for (const m of roomMembers.values()) {
      if (m.name.toLowerCase().startsWith(q) && !seen.has(m.name)) {
        seen.add(m.name);
        list.push(m);
      }
    }
    return list;
  }, [mentionQuery, roomMembers]);

  const selectMention = useCallback(
    (name: string) => {
      const input = chatInputRef.current;
      const cursor = input?.selectionStart ?? chatInput.length;
      const textBefore = chatInput.slice(0, cursor);
      const textAfter = chatInput.slice(cursor);
      const replaced = textBefore.replace(/@\w*$/, `@${name} `);
      setChatInput(replaced + textAfter);
      setMentionQuery(null);
      setMentionSelIdx(0);
      setTimeout(() => input?.focus(), 0);
    },
    [chatInput],
  );

  const renderMentionText = useCallback(
    (text: string): React.ReactNode[] => {
      const parts: React.ReactNode[] = [];
      const regex = /@(\S+)/g;
      let last = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > last) parts.push(text.slice(last, match.index));
        const mentioned = match[1];
        const isMe = mentioned === LOCAL_NAME;
        const knownMember = Array.from(roomMembers.values()).some(
          (m) => m.name === mentioned,
        );
        if (isMe || knownMember) {
          parts.push(
            <span
              key={match.index}
              className={isMe ? "mention mention-me" : "mention"}
            >
              {match[0]}
            </span>,
          );
        } else {
          parts.push(match[0]);
        }
        last = match.index + match[0].length;
      }
      if (last < text.length) parts.push(text.slice(last));
      return parts;
    },
    [LOCAL_NAME, roomMembers],
  );

  const handleChatKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (mentionQuery !== null && mentionSuggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionSelIdx((i) => (i + 1) % mentionSuggestions.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionSelIdx(
            (i) =>
              (i - 1 + mentionSuggestions.length) % mentionSuggestions.length,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          selectMention(
            mentionSuggestions[mentionSelIdx]?.name ??
              mentionSuggestions[0].name,
          );
          return;
        }
        if (e.key === "Escape") {
          setMentionQuery(null);
          return;
        }
      }
      if (e.key !== "Enter") return;
      const text = chatInput.trim();
      if (!text) return;
      // Affichage optimiste : on ajoute le message localement sans attendre le serveur
      setMessages((prev) => [
        ...prev.slice(-99),
        {
          id: "local",
          name: LOCAL_NAME,
          color: LOCAL_COLOR,
          text,
          ts: Date.now(),
        },
      ]);
      sceneRef.current?.showLocalChat(text);
      socketRef.current?.sendChat(text);
      setChatInput("");
    },
    [
      chatInput,
      LOCAL_NAME,
      LOCAL_COLOR,
      mentionQuery,
      mentionSuggestions,
      mentionSelIdx,
      selectMention,
    ],
  );

  const handleChatChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setChatInput(val);
      const cursor = e.target.selectionStart ?? val.length;
      const textBefore = val.slice(0, cursor);
      const atMatch = textBefore.match(/@(\w*)$/);
      if (atMatch) {
        setMentionQuery(atMatch[1]);
        setMentionSelIdx(0);
      } else {
        setMentionQuery(null);
      }
      const now = Date.now();
      if (now - lastTypingSent.current > 2000) {
        lastTypingSent.current = now;
        socketRef.current?.sendTyping();
      }
    },
    [],
  );

  const CHAT_EMOTES = ["😂", "😍", "😎", "🥳", "😭", "🤯"] as const;

  const handleSendEmote = useCallback((emoji: string) => {
    setShowEmotePicker(false);
    sceneRef.current?.showLocalEmote(emoji);
    socketRef.current?.sendEmote(emoji);
  }, []);

  const handleOpenDm = useCallback(
    (id: string, name: string, color: number) => {
      setOpenDm({ id, name, color });
      setDmUnread((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    },
    [],
  );

  const handleDmSend = useCallback(() => {
    const text = dmInput.trim();
    if (!text || !openDm || !socketRef.current) return;
    socketRef.current.sendPrivateMessage(openDm.id, text);
    const msg: ChatMessage = {
      id: socketRef.current.socketId ?? "me",
      name: LOCAL_NAME,
      color: LOCAL_COLOR,
      text,
      ts: Date.now(),
    };
    setDmMessages((prev) => {
      const next = new Map(prev);
      const thread = next.get(openDm.id) ?? [];
      next.set(openDm.id, [...thread.slice(-99), msg]);
      return next;
    });
    setDmInput("");
  }, [dmInput, openDm, LOCAL_NAME, LOCAL_COLOR]);

  const handleTaskAdd = useCallback(
    (
      text: string,
      category: string | null,
      type: "task" | "daily" = "task",
    ) => {
      socketRef.current?.addTask(LOCAL_USER_ID, text, category, type);
    },
    [LOCAL_USER_ID],
  );

  const handleTaskUpdate = useCallback(
    (taskId: string, text: string, category: string | null) => {
      socketRef.current?.updateTask(LOCAL_USER_ID, taskId, text, category);
    },
    [LOCAL_USER_ID],
  );

  const handleTaskToggle = useCallback(
    (taskId: string) => {
      socketRef.current?.toggleTask(LOCAL_USER_ID, taskId);
    },
    [LOCAL_USER_ID],
  );

  const handleTaskDelete = useCallback(
    (taskId: string) => {
      socketRef.current?.deleteTask(LOCAL_USER_ID, taskId);
    },
    [LOCAL_USER_ID],
  );

  const handleCleanRoom = useCallback((levels: number) => {
    socketRef.current?.cleanRoom(levels);
  }, []);

  const handleBuyItem = useCallback(
    (itemId: string) => {
      socketRef.current?.buyItem(LOCAL_USER_ID, itemId);
    },
    [LOCAL_USER_ID],
  );

  const handleBuyFurniture = useCallback(
    (itemId: string) => {
      socketRef.current?.buyFurniture(LOCAL_USER_ID, itemId);
    },
    [LOCAL_USER_ID],
  );

  const handleEquipHat = useCallback(
    (hatId: string | null) => {
      socketRef.current?.equipHat(LOCAL_USER_ID, hatId);
      setEquippedHat(hatId);
      sceneRef.current?.setLocalHat(hatId);
    },
    [LOCAL_USER_ID],
  );

  const isRunning = status === "running";
  const POMO_PHASE_LABEL: Record<string, string> = {
    focus: "🍅 Focus collectif",
    "short-break": "☕ Pause collective",
    "long-break": "🛋️ Grande pause collective",
  };

  // Maintient --topbar-bottom pour positionner les panneaux sous la top-bar
  useEffect(() => {
    const topBar = document.getElementById("top-bar");
    if (!topBar) return;
    const update = () => {
      const bottom = topBar.getBoundingClientRect().bottom;
      document.documentElement.style.setProperty(
        "--topbar-bottom",
        `${bottom}px`,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBar);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <canvas ref={canvasRef} id="game-canvas" />

      <div id="ui-overlay">
        <div id="top-bar">
          <div className="top-bar-group top-bar-group--timer">
            {collectivePomo ? (
              <div
                id="timer-panel"
                data-phase={collectivePomo.phase}
                data-status={collectivePomo.running ? "running" : "idle"}
                className="collective"
              >
                <span id="timer-label">
                  {POMO_PHASE_LABEL[collectivePomo.phase]}
                </span>
                <span id="timer-display">
                  {formatTime(collectivePomo.remaining)}
                </span>
                <span id="pomo-participants">
                  👥 {collectivePomo.participants}
                </span>
                <button
                  id="timer-reset"
                  onClick={() => {
                    isInCollectivePomoRef.current = false;
                    socketRef.current?.leaveCollectivePomo();
                    setCollectivePomo(null);
                    sceneRef.current?.setAvatarState("idle");
                    socketRef.current?.setAvatarState("idle");
                  }}
                  aria-label="Quitter"
                  title="Quitter le pomo collectif"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div id="timer-panel" data-phase={phase} data-status={status}>
                <span id="timer-label">{PHASE_LABEL[phase]}</span>
                <span id="timer-display">{display}</span>
                <button
                  id="timer-toggle"
                  onClick={handleToggle}
                  aria-label={isRunning ? "Pause" : "Démarrer"}
                >
                  {isRunning ? "⏸" : "▶"}
                </button>
                <button
                  id="timer-reset"
                  onClick={handleReset}
                  aria-label="Réinitialiser"
                >
                  ↺
                </button>
                <button
                  id="pomo-settings-btn"
                  onClick={() => {
                    setDraftConfig(pomoConfig);
                    setPomoSettingsOpen((o) => !o);
                  }}
                  aria-label="Paramètres"
                  title="Paramètres"
                >
                  ⚙️
                </button>
                <button
                  id="pomo-join-btn"
                  onClick={() => {
                    isInCollectivePomoRef.current = true;
                    socketRef.current?.joinCollectivePomo();
                    sceneRef.current?.setAvatarState("collective");
                    socketRef.current?.setAvatarState("collective");
                  }}
                  aria-label="Rejoindre le pomo collectif"
                  title="Rejoindre le pomo collectif"
                >
                  👥
                </button>
                {pomoSettingsOpen && (
                  <div id="pomo-settings">
                    <label>
                      🍅
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={draftConfig.focus}
                        onChange={(e) =>
                          setDraftConfig((d) => ({
                            ...d,
                            focus: Number(e.target.value),
                          }))
                        }
                      />
                      <span>min</span>
                    </label>
                    <label>
                      ☕
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={draftConfig.shortBreak}
                        onChange={(e) =>
                          setDraftConfig((d) => ({
                            ...d,
                            shortBreak: Number(e.target.value),
                          }))
                        }
                      />
                      <span>min</span>
                    </label>
                    <label>
                      🛋️
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={draftConfig.longBreak}
                        onChange={(e) =>
                          setDraftConfig((d) => ({
                            ...d,
                            longBreak: Number(e.target.value),
                          }))
                        }
                      />
                      <span>min</span>
                    </label>
                    <button onClick={handleSaveConfig} title="Appliquer">
                      ✓
                    </button>
                    <button
                      onClick={() => setPomoSettingsOpen(false)}
                      title="Annuler"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="top-bar-group top-bar-group--actions">
            <div id="zoom-controls">
              <button
                onClick={() => sceneRef.current?.zoomIn()}
                aria-label="Zoom avant"
                title="Zoom avant"
              >
                <span className="zoom-icon">+</span>
                <span className="zoom-label">Zoom +</span>
              </button>
              <button
                onClick={() => sceneRef.current?.zoomOut()}
                aria-label="Zoom arrière"
                title="Zoom arrière"
              >
                <span className="zoom-icon">−</span>
                <span className="zoom-label">Zoom −</span>
              </button>
              <button
                onClick={() => sceneRef.current?.fitToScreen()}
                aria-label="Vue d'ensemble"
                title="Ajuster la carte à l'écran"
              >
                <span className="zoom-icon">⛶</span>
                <span className="zoom-label">Vue d'ensemble</span>
              </button>
            </div>
            <button
              id="task-toggle-btn"
              onClick={() => setTaskPanelOpen((o) => !o)}
              aria-label="Tâches"
              className={taskPanelOpen ? "active" : ""}
            >
              <span className="topbar-icon">📋</span>
              <span className="topbar-button-label">Tâches</span>
            </button>
            <button
              id="shop-toggle-btn"
              onClick={() => setShopOpen((o) => !o)}
              aria-label="Boutique"
              className={shopOpen ? "active" : ""}
            >
              <span className="topbar-icon">🏪</span>
              <span className="topbar-button-label">Boutique</span>
            </button>
            <button
              id="leaderboard-toggle-btn"
              onClick={() => setLeaderboardOpen((o) => !o)}
              aria-label="Classement"
              className={leaderboardOpen ? "active" : ""}
            >
              <span className="topbar-icon">🏆</span>
              <span className="topbar-button-label">Classement</span>
            </button>
            <button
              id="guild-toggle-btn"
              onClick={() => setGuildPanelOpen((o) => !o)}
              aria-label="Guilde"
              className={guildPanelOpen ? "active" : ""}
              title={guildData ? `Guilde : ${guildData.name}` : "Guildes"}
            >
              <span className="topbar-icon">⚔️</span>
              <span className="topbar-button-label">Guilde</span>
            </button>
            <button
              id="profile-self-btn"
              onClick={() => {
                const lvl = level;
                const xpForThis = 50 * lvl * lvl;
                const xpForNext = 50 * (lvl + 1) * (lvl + 1);
                setProfileData({
                  userId: LOCAL_USER_ID,
                  name: LOCAL_NAME,
                  color: LOCAL_COLOR,
                  hat: equippedHat,
                  level: lvl,
                  xp,
                  xpProgress: xp - xpForThis,
                  xpToNext: xpForNext - xpForThis,
                  coins,
                  streak,
                  degradation,
                  achievements: unlockedAchievements,
                  isAdmin: IS_ADMIN,
                });
              }}
              aria-label="Mon profil"
              title="Mon profil"
              className={profileData ? "active" : ""}
            >
              <span className="topbar-icon">👤</span>
              <span className="topbar-button-label">Profil</span>
            </button>
            <button
              id="ambiance-btn"
              onClick={() => setAmbiancePanelOpen((o) => !o)}
              aria-label="Ambiance"
              title="Diffuser une vidéo YouTube dans la room"
              className={ambiancePanelOpen ? "active" : ""}
            >
              <span className="topbar-icon">
                🎵{sharedVideo?.videoId ? <span className="ambiance-live-dot" /> : null}
              </span>
              <span className="topbar-button-label">Ambiance</span>
            </button>
            <button
              id="audio-btn"
              onClick={() => setAudioPanelOpen(true)}
              aria-label="Paramètres audio"
              title="Paramètres audio"
              className={audioPanelOpen ? "active" : ""}
            >
              <span className="topbar-icon">🔊</span>
              <span className="topbar-button-label">Audio</span>
            </button>
            <button
              id="feedback-btn"
              onClick={() => setFeedbackOpen(true)}
              aria-label="Feedback"
              title="Signaler un bug ou soumettre une idée"
              className={feedbackOpen ? "active" : ""}
            >
              <span className="topbar-icon">📢</span>
              <span className="topbar-button-label">Aide</span>
            </button>
            <button
              id="room-switch-btn"
              type="button"
              onClick={() => setRoomSwitcherOpen((o) => !o)}
              aria-label="Changer de room"
              title={`Room : ${ROOM_META.name}. Clique pour changer.`}
              className={roomSwitcherOpen ? "active" : ""}
            >
              <span className="topbar-icon">{ROOM_META.emoji}</span>
              <span className="topbar-button-label">{ROOM_META.name}</span>
            </button>
            <button
              id="logout-btn"
              type="button"
              onClick={onLogout}
              aria-label="Déconnexion"
              title="Déconnexion"
            >
              <span className="topbar-icon">🚪</span>
              <span className="topbar-button-label">Déconnexion</span>
            </button>
          </div>
          <div className="top-bar-group top-bar-group--status">
            <span id="app-version">v{__APP_VERSION__}</span>
            <div id="coins-badge">🪙 {coins}</div>
            {streak > 0 && (
              <div
                id="streak-badge"
                className={streakBonus !== null ? "pop" : ""}
              >
                🔥 {streak}
                {streakBonus !== null && (
                  <span className="streak-bonus">+{streakBonus} 🪙</span>
                )}
              </div>
            )}
            <div id="xp-badge">
              <span>Lv {level}</span>
              <div id="xp-bar">
                <div
                  id="xp-bar-fill"
                  style={{
                    width: `${Math.round(
                      ((xp - 50 * level * level) /
                        (50 * (level + 1) * (level + 1) - 50 * level * level)) *
                        100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div id="panels-left">
          {taskPanelOpen && (
            <TaskPanel
              tasks={tasks}
              coins={coins}
              degradation={degradation}
              level={level}
              lastTaskCoinGain={lastTaskCoinGain}
              onAdd={handleTaskAdd}
              onUpdate={handleTaskUpdate}
              onToggle={handleTaskToggle}
              onDelete={handleTaskDelete}
              onCleanRoom={handleCleanRoom}
              onClose={() => setTaskPanelOpen(false)}
            />
          )}
          {shopOpen && (
            <ShopPanel
              coins={coins}
              ownedItems={ownedItems}
              equippedHat={equippedHat}
              onBuy={handleBuyItem}
              onEquip={handleEquipHat}
              ownedFurniture={ownedFurniture}
              placedFurniture={placedFurniture}
              onBuyFurniture={handleBuyFurniture}
              onTogglePlace={(itemId) => {
                if (!isRoomOwner) {
                  setRoomFullToast(
                    "🏠 Place tes meubles dans ta room privée",
                  );
                  setTimeout(() => setRoomFullToast(null), 3000);
                  return;
                }
                socketRef.current?.toggleFurniturePlaced(LOCAL_USER_ID, itemId);
              }}
              onStartPlacement={(itemId) => {
                if (!isRoomOwner) {
                  setRoomFullToast(
                    "🏠 Place tes meubles dans ta room privée",
                  );
                  setTimeout(() => setRoomFullToast(null), 3000);
                  return;
                }
                sceneRef.current?.startGhostPlacement(itemId);
              }}
              onClose={() => setShopOpen(false)}
            />
          )}
        </div>
        {leaderboardOpen && (
          <div id="leaderboard-panel">
            <div id="leaderboard-title">
              🏆 Classement
              <button
                className="panel-close-btn"
                onClick={() => setLeaderboardOpen(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            {leaderboard.map((entry, i) => (
              <div
                key={entry.id}
                className={`leaderboard-entry${entry.id === mySocketId ? " local" : ""}`}
              >
                <span className="leaderboard-rank">#{i + 1}</span>
                <span className="leaderboard-state" title={entry.state}>
                  {entry.state === "focus"
                    ? "🍅"
                    : entry.state === "pause"
                      ? "☕"
                      : entry.state === "collective"
                        ? "👥"
                        : entry.state === "walking"
                          ? "🚶"
                          : "💤"}
                </span>
                <span
                  className={`leaderboard-name${entry.id !== mySocketId ? " dm-clickable" : ""}`}
                  style={{
                    color: `#${entry.color.toString(16).padStart(6, "0")}`,
                  }}
                  onClick={() =>
                    entry.id !== mySocketId &&
                    handleOpenDm(entry.id, entry.name, entry.color)
                  }
                >
                  {entry.name}
                  {(dmUnread.get(entry.id) ?? 0) > 0 && (
                    <span className="dm-unread-badge">
                      {dmUnread.get(entry.id)}
                    </span>
                  )}
                </span>
                <span className="leaderboard-coins">🪙 {entry.coins}</span>
                <button
                  className="leaderboard-profile-btn"
                  onClick={() => socketRef.current?.requestProfile(entry.id)}
                  title={`Voir le profil de ${entry.name}`}
                >
                  👤
                </button>
              </div>
            ))}
            {leaderboard.length === 0 && (
              <div className="leaderboard-empty">Aucun joueur</div>
            )}
          </div>
        )}

        <div
          id="chat-panel"
          className={
            chatSize === "hidden"
              ? "hidden"
              : chatSize === "expanded"
                ? "expanded"
                : ""
          }
        >
          <div id="chat-header">
            <span>💬 Chat</span>
            <div className="chat-controls">
              {chatNotified && unreadCount > 0 && (
                <span
                  className="chat-notif-pill"
                  title="Nouveaux messages non lus"
                >
                  🔔 {unreadCount}
                </span>
              )}
              <button
                className={`chat-control-btn${showNotifiedOnly ? " active" : ""}`}
                onClick={() => setShowNotifiedOnly((v) => !v)}
                title="Afficher seulement les messages notifiés"
              >
                {showNotifiedOnly ? "🔔✓" : "🔔"}
              </button>
              <button
                className="chat-control-btn"
                onClick={() =>
                  setChatSize(chatSize === "expanded" ? "normal" : "expanded")
                }
                title={
                  chatSize === "expanded"
                    ? "Réduire le chat"
                    : "Agrandir le chat"
                }
              >
                {chatSize === "expanded" ? "⬇️" : "⬆️"}
              </button>
              <button
                className="chat-control-btn"
                onClick={() => setChatSize("hidden")}
                title="Masquer le chat"
              >
                ✕
              </button>
            </div>
          </div>
          <div id="chat-messages">
            {filteredMessages.length === 0 ? (
              <div className="chat-empty">
                {showNotifiedOnly
                  ? "Aucun message notifié à afficher."
                  : "Aucun message pour le moment."}
              </div>
            ) : (
              filteredMessages.map((m, i) => {
                const isMentionedMe = m.text.includes(`@${LOCAL_NAME}`);
                return (
                  <div
                    key={i}
                    className={`chat-line${isMentionedMe ? " chat-line-mention-me" : ""}${isMentionedMe ? " chat-line-unread" : ""}`}
                  >
                    <div className="chat-line-body">
                      <span
                        className="chat-author"
                        style={{
                          color: m.color
                            ? `#${m.color.toString(16).padStart(6, "0")}`
                            : "rgba(255,255,255,0.5)",
                        }}
                      >
                        {m.name}
                      </span>
                      <span className="chat-text">
                        {renderMentionText(m.text)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <div
              className={`chat-typing${typingUsers.size === 0 ? " hidden" : ""}`}
            >
              {Array.from(typingUsers.values())
                .map((u) => u.name)
                .join(", ")}{" "}
              {typingUsers.size === 1 ? "est" : "sont"} en train d’écrire
              <span className="typing-dots">
                <span />
                <span />
                <span />
              </span>
            </div>
            <div ref={chatEndRef} />
          </div>
          <div id="chat-input-wrap">
            {mentionQuery !== null && mentionSuggestions.length > 0 && (
              <div id="mention-dropdown">
                {mentionSuggestions.map((s, i) => (
                  <button
                    key={s.name}
                    className={`mention-option${i === mentionSelIdx ? " active" : ""}`}
                    style={{
                      color: `#${s.color.toString(16).padStart(6, "0")}`,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectMention(s.name);
                    }}
                  >
                    @{s.name}
                  </button>
                ))}
              </div>
            )}
            <input
              ref={chatInputRef}
              id="chat-input"
              type="text"
              placeholder="Envoyer un message… (Entrée)"
              value={chatInput}
              onChange={handleChatChange}
              onFocus={() => {
                setUnreadCount(0);
                setChatNotified(false);
              }}
              onKeyDown={handleChatKey}
              maxLength={200}
            />
            <button
              id="emote-btn"
              title="Émotes"
              onClick={() => setShowEmotePicker((v) => !v)}
            >
              😊
            </button>
            {showEmotePicker && (
              <div id="emote-picker">
                {CHAT_EMOTES.map((e) => (
                  <button
                    key={e}
                    className="emote-option"
                    onClick={() => handleSendEmote(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {openDm && (
        <div id="dm-panel">
          <div id="dm-header">
            <span id="dm-title">
              <span
                className="dm-target-dot"
                style={{
                  background: `#${openDm.color.toString(16).padStart(6, "0")}`,
                }}
              />
              💬 {openDm.name}
            </span>
            <button
              id="dm-close"
              onClick={() => setOpenDm(null)}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
          <div id="dm-messages">
            {(dmMessages.get(openDm.id) ?? []).map((m, i) => (
              <div
                key={i}
                className={`dm-line${m.id === mySocketId ? " mine" : ""}`}
              >
                <span
                  className="dm-author"
                  style={{
                    color: m.color
                      ? `#${m.color.toString(16).padStart(6, "0")}`
                      : "rgba(255,255,255,0.5)",
                  }}
                >
                  {m.name}
                </span>
                <span className="dm-text">{m.text}</span>
              </div>
            ))}
            {(dmMessages.get(openDm.id) ?? []).length === 0 && (
              <div className="dm-empty">Dis bonjour à {openDm.name} 👋</div>
            )}
            <div ref={dmEndRef} />
          </div>
          <input
            id="dm-input"
            type="text"
            placeholder={`Message privé à ${openDm.name}…`}
            value={dmInput}
            onChange={(e) => setDmInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleDmSend();
            }}
            maxLength={200}
            autoFocus
          />
        </div>
      )}

      {achievementToast && (
        <div id="achievement-toast" key={achievementToast.label}>
          <span className="ach-icon">{achievementToast.icon}</span>
          <div className="ach-body">
            <div className="ach-header">🏅 Succès débloqué !</div>
            <div className="ach-label">{achievementToast.label}</div>
            <div className="ach-desc">{achievementToast.desc}</div>
          </div>
        </div>
      )}

      {/* ── Panneau debug achievements ── */}
      <button
        id="debug-ach-btn"
        onClick={() => setDebugOpen((o) => !o)}
        title="Debug achievements"
      >
        🛠
      </button>
      {debugOpen && (
        <div id="debug-ach-panel">
          <div id="debug-ach-title">🛠 Debug achievements</div>
          {[
            { key: "first-task", icon: "✅", label: "1ère tâche !" },
            { key: "task-10", icon: "🔟", label: "10 tâches !" },
            { key: "task-50", icon: "🏆", label: "50 tâches !" },
            { key: "first-pomo", icon: "🍅", label: "1er Pomodoro !" },
            { key: "streak-5", icon: "🔥", label: "Streak ×5 !" },
            { key: "coins-100", icon: "💰", label: "100 pièces !" },
            { key: "coins-500", icon: "👑", label: "500 pièces !" },
            { key: "first-collective", icon: "🌐", label: "Pomo collectif !" },
          ].map(({ key, icon, label }) => (
            <button
              key={key}
              className="debug-ach-row"
              onClick={() => socketRef.current?.debugUnlock(LOCAL_USER_ID, key)}
            >
              {icon} {label}
            </button>
          ))}
          <div className="debug-section-title">⬆ XP / Niveaux</div>
          <div className="debug-xp-info">
            {xp} XP — Lv {level} ({xp - 50 * level * level} /{" "}
            {50 * (level + 1) * (level + 1) - 50 * level * level} pour Lv{" "}
            {level + 1})
          </div>
          {[50, 75, 200, 500].map((amount) => (
            <button
              key={amount}
              className="debug-ach-row debug-xp-row"
              onClick={() =>
                socketRef.current?.debugGrantXp(LOCAL_USER_ID, amount)
              }
            >
              +{amount} XP
            </button>
          ))}
          <button
            className="debug-ach-row debug-xp-reset"
            onClick={() => socketRef.current?.debugResetXp(LOCAL_USER_ID)}
          >
            🔄 Reset XP (Lv 0)
          </button>
          <div className="debug-section-title">
            🪙 Pièces (actuel : {coins})
          </div>
          {[50, 100, 500, 1000].map((amount) => (
            <button
              key={amount}
              className="debug-ach-row debug-xp-row"
              onClick={() =>
                socketRef.current?.debugGrantCoins(LOCAL_USER_ID, amount)
              }
            >
              +{amount} 🪙
            </button>
          ))}
          <div className="debug-section-title">
            ☣ Dégradation (actuel : {degradation}/5)
          </div>
          {[0, 1, 2, 3, 4, 5].map((lvl) => (
            <button
              key={lvl}
              className="debug-ach-row"
              style={{
                opacity: degradation === lvl ? 1 : 0.55,
                fontWeight: degradation === lvl ? 700 : 400,
              }}
              onClick={() =>
                socketRef.current?.debugSetDegradation(LOCAL_USER_ID, lvl)
              }
            >
              {["✨ 0", "🌫 1", "🕸 2", "🌧 3", "💀 4", "☠ 5"][lvl]}
            </button>
          ))}
        </div>
      )}

      {/* ── Profil joueur ── */}
      {profileData && (
        <ProfilePanel
          data={profileData}
          isOwnProfile={profileData.userId === LOCAL_USER_ID}
          onClose={() => setProfileData(null)}
        />
      )}

      {/* ── Modal Feedback ── */}
      {feedbackOpen && (
        <FeedbackModal
          userName={LOCAL_NAME}
          onClose={() => setFeedbackOpen(false)}
        />
      )}

      {/* ── Panel Audio ── */}
      {audioPanelOpen && (
        <AudioPanel onClose={() => setAudioPanelOpen(false)} />
      )}

      {/* ── Room switcher ── */}
      {roomSwitcherOpen && (
        <RoomSelectScreen
          rooms={roomsList}
          title="Changer de room"
          subtitle="Choisis une nouvelle ambiance. Ton progrès est conservé."
          initialRoomId={ROOM_ID}
          userId={LOCAL_USER_ID}
          canCreatePrivate={IS_GOOGLE_USER}
          onCreatePrivate={(name) => {
            socketRef.current?.createPrivateRoom(name);
          }}
          onDeletePrivate={
            isRoomOwner
              ? () => {
                  socketRef.current?.deletePrivateRoom();
                  setRoomSwitcherOpen(false);
                }
              : undefined
          }
          onBack={() => setRoomSwitcherOpen(false)}
          onSelect={(roomId) => {
            setRoomSwitcherOpen(false);
            if (roomId === ROOM_ID) return;
            socketRef.current?.switchRoom(roomId);
            onRoomChange(roomId);
          }}
        />
      )}
      {roomFullToast && (
        <div id="room-full-toast">{roomFullToast}</div>
      )}

      {/* ── Panel Ambiance (always mounted so YT player stays alive) ── */}
      <AmbiancePanel
        open={ambiancePanelOpen}
        onClose={() => setAmbiancePanelOpen(false)}
        socket={socketRef.current}
        socketId={mySocketId}
        videoState={sharedVideo}
      />

      {/* ── Panel Guilde ── */}
      {guildPanelOpen && (
        <GuildPanel
          guild={guildData}
          onClose={() => setGuildPanelOpen(false)}
          onCreateGuild={(name) => socketRef.current?.createGuild(name)}
          onJoinGuild={(id) => socketRef.current?.joinGuild(id)}
          onLeaveGuild={() => socketRef.current?.leaveGuild()}
          localUserId={LOCAL_USER_ID}
        />
      )}

      {/* ── Toast boss de guilde vaincu ── */}
      {guildBossToast && (
        <div id="guild-boss-toast">
          🏆 Boss Lv.{guildBossToast.bossLevel} vaincu !
          <br />
          <span id="guild-boss-toast-reward">
            +{guildBossToast.reward}🪙 pour tous les membres
          </span>
        </div>
      )}

      {/* ── Onboarding nouveau joueur ── */}
      {showOnboarding && (
        <OnboardingOverlay
          onDone={() => {
            setShowOnboarding(false);
            onboardingDoneRef.current = true;
            localStorage.setItem("gamitask-onboarding-done", "1");
          }}
        />
      )}

      {/* ── Panel Admin (visible uniquement pour les admins) ── */}
      {IS_ADMIN && (
        <>
          <button
            id="admin-toggle-btn"
            onClick={() => setAdminOpen((o) => !o)}
            title="Panel Admin"
          >
            🔑
          </button>
          {adminOpen && (
            <div id="admin-panel">
              <div id="admin-panel-title">🔑 Panel Admin</div>
              <label className="admin-label">Cible (userId)</label>
              <input
                className="admin-input"
                value={adminTarget}
                onChange={(e) => setAdminTarget(e.target.value)}
                placeholder="userId"
              />
              <label className="admin-label">Montant</label>
              <input
                className="admin-input"
                type="number"
                value={adminAmount}
                onChange={(e) => setAdminAmount(e.target.value)}
                min={1}
                max={100000}
              />
              <div className="admin-row">
                <button
                  className="admin-btn"
                  onClick={() =>
                    socketRef.current?.adminGiveCoins(
                      adminTarget,
                      Number(adminAmount),
                    )
                  }
                >
                  💰 +Coins
                </button>
                <button
                  className="admin-btn"
                  onClick={() =>
                    socketRef.current?.adminGiveXp(
                      adminTarget,
                      Number(adminAmount),
                    )
                  }
                >
                  ⬆ +XP
                </button>
              </div>
              <div className="admin-section">☣ Dégradation cible</div>
              <div className="admin-row">
                {[0, 1, 2, 3, 4, 5].map((lvl) => (
                  <button
                    key={lvl}
                    className="admin-btn admin-btn-sm"
                    onClick={() =>
                      socketRef.current?.adminSetDegradation(adminTarget, lvl)
                    }
                  >
                    {lvl}
                  </button>
                ))}
              </div>
              <div className="admin-section">📢 Annonce globale</div>
              <input
                className="admin-input"
                value={adminMsg}
                onChange={(e) => setAdminMsg(e.target.value)}
                placeholder="Message pour tous…"
                maxLength={200}
              />
              <button
                className="admin-btn admin-btn-full"
                onClick={() => {
                  if (adminMsg.trim()) {
                    socketRef.current?.adminAnnounce(adminMsg.trim());
                    setAdminMsg("");
                  }
                }}
              >
                Envoyer l'annonce
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Bouton pour réafficher le chat si masqué ── */}
      {chatSize === "hidden" && (
        <button
          id="chat-show-btn"
          onClick={() => {
            setChatSize("normal");
            setChatNotified(false);
            setUnreadCount(0);
          }}
          title="Afficher le chat"
        >
          💬
          {unreadCount > 0 && (
            <span className="chat-show-badge">{unreadCount}</span>
          )}
        </button>
      )}
    </>
  );
}

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthResult | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [joinInfo, setJoinInfo] = useState<JoinInfo | null>(null);
  const [pendingProfile, setPendingProfile] = useState<Omit<
    JoinInfo,
    "roomId"
  > | null>(null);
  const [roomsList, setRoomsList] = useState<RoomSummary[]>([]);

  // Fetch initial rooms list (for room-select before socket exists)
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/rooms`)
      .then((r) => r.json())
      .then((data: { rooms?: RoomSummary[] }) => {
        if (!cancelled && data.rooms) setRoomsList(data.rooms);
      })
      .catch(() => {
        /* offline : on affichera 0/N */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Finalise un profil en attribuant un roomId (depuis localStorage si présent)
  const commitProfile = useCallback(
    (profile: Omit<JoinInfo, "roomId">, roomId?: RoomId) => {
      const rid = roomId ?? loadSelectedPublicRoom();
      if (rid) {
        localStorage.setItem(ROOM_STORAGE_KEY, rid);
        setJoinInfo({ ...profile, roomId: rid });
        setPendingProfile(null);
      } else {
        setPendingProfile(profile);
      }
    },
    [],
  );

  // Vérifier le token JWT sauvegardé au chargement
  useEffect(() => {
    const token = localStorage.getItem("gamitask-jwt");
    if (!token) {
      queueMicrotask(() => setAuthChecked(true));
      return;
    }
    fetch(`${API_URL}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data: AuthResult & { error?: string }) => {
        if (!data.error && data.userId) {
          setAuthUser(data);
          if (data.color !== 0 && data.name) {
            commitProfile({
              name: data.name,
              color: data.color,
              colorCss: hexToCSS(data.color),
              userId: data.userId,
              isAdmin: data.isAdmin,
              isGoogleUser: !!data.isGoogleUser,
            });
          }
        } else {
          localStorage.removeItem("gamitask-jwt");
        }
      })
      .catch(() => {
        /* réseau indisponible */
      })
      .finally(() => setAuthChecked(true));
  }, [commitProfile]);

  const handleAuth = (result: AuthResult) => {
    setAuthUser(result);
    if (result.color === 0 || !result.name) return;
    commitProfile({
      name: result.name,
      color: result.color,
      colorCss: hexToCSS(result.color),
      userId: result.userId,
      isAdmin: result.isAdmin,
      isGoogleUser: !!result.isGoogleUser,
    });
  };

  const handleLogout = () => {
    localStorage.removeItem("gamitask-jwt");
    setAuthUser(null);
    setGuestMode(false);
    setJoinInfo(null);
    setPendingProfile(null);
  };

  const handleJoin = (
    info: Omit<JoinInfo, "userId" | "isAdmin" | "roomId" | "isGoogleUser">,
  ) => {
    commitProfile({
      ...info,
      userId: authUser?.userId ?? LOCAL_USER_ID,
      isAdmin: authUser?.isAdmin ?? false,
      isGoogleUser: !!authUser?.isGoogleUser,
    });
  };

  const handleRoomSelect = (roomId: RoomId) => {
    if (!pendingProfile) return;
    // Ne persiste dans localStorage que si c'est une room publique (les privées sont éphémères)
    if (isPublicRoomId(roomId))
      localStorage.setItem(ROOM_STORAGE_KEY, roomId);
    setJoinInfo({ ...pendingProfile, roomId });
    setPendingProfile(null);
  };

  const handleRoomChange = useCallback((roomId: RoomId) => {
    if (isPublicRoomId(roomId))
      localStorage.setItem(ROOM_STORAGE_KEY, roomId);
    setJoinInfo((prev) => (prev ? { ...prev, roomId } : prev));
  }, []);

  // Callback to receive socket-driven rooms updates from the Room component
  const handleRoomsListUpdate = useCallback((rooms: RoomSummary[]) => {
    setRoomsList(rooms);
  }, []);

  // Création d'une private room : on la délègue au socket (dans Room).
  // Pour le flow initial (avant Room monté), créer impose de d'abord entrer dans
  // une room publique par défaut puis créer depuis le switcher in-game.
  const handleInitialCreatePrivate = () => {
    if (!pendingProfile) return;
    // Entrer par défaut dans ocean ; l'utilisateur pourra créer depuis le switcher
    setJoinInfo({ ...pendingProfile, roomId: DEFAULT_ROOM_ID });
    setPendingProfile(null);
  };

  if (!authChecked) {
    return (
      <div id="auth-loading">
        <div className="auth-spinner" />
        <span>Chargement…</span>
      </div>
    );
  }

  if (!authUser && !guestMode) {
    return (
      <AuthScreen onAuth={handleAuth} onGuest={() => setGuestMode(true)} />
    );
  }

  if (!joinInfo && !pendingProfile) {
    const prefill =
      authUser && authUser.name
        ? { name: authUser.name, color: authUser.color }
        : undefined;
    return <JoinDialog onJoin={handleJoin} prefill={prefill} />;
  }

  if (!joinInfo && pendingProfile) {
    return (
      <RoomSelectScreen
        rooms={roomsList}
        onSelect={handleRoomSelect}
        initialRoomId={loadSelectedPublicRoom() ?? DEFAULT_ROOM_ID}
        userId={pendingProfile.userId}
        canCreatePrivate={pendingProfile.isGoogleUser}
        onCreatePrivate={handleInitialCreatePrivate}
      />
    );
  }

  return (
    <Room
      joinInfo={joinInfo!}
      onLogout={handleLogout}
      onRoomChange={handleRoomChange}
      roomsList={roomsList}
      onRoomsListUpdate={handleRoomsListUpdate}
    />
  );
}

export default App;
