// Règles des tâches : pures, sans base ni socket. index.ts lit, appelle, écrit, émet.
// Bundled by the client too (app imports it relatively): keep imports type-only.
import type { Task, Difficulty, TaskKind, ChecklistItem } from "./types.js";

export const PRIORITY: Record<Difficulty, number> = { trivial: 0.1, easy: 1, medium: 1.5, hard: 2 };
export const VALUE_MIN = -25;
export const VALUE_MAX = 25;
export const DELTA_CAP = 3;
export const ENERGY_MAX = 50;
/** Pas de perte d'énergie avant ce niveau. */
export const IMMUNITY_LEVEL = 3;
/** Perte d'énergie maximale par cron, tous les jours manqués confondus. */
export const CRON_ENERGY_CAP = 20;
export const MAX_ROLLOVER_DAYS = 30;

export const KINDS: TaskKind[] = ["habit", "daily", "todo"];
export const DIFFICULTIES: Difficulty[] = ["trivial", "easy", "medium", "hard"];

export const clampValue = (v: number): number =>
  Math.round(Math.max(VALUE_MIN, Math.min(VALUE_MAX, v)) * 1000) / 1000;

/** Multiplicateur de gain d'une coche : 0.9747^value × difficulté, bonus checklist sur les todo, plafonné. */
export function delta(t: Pick<Task, "value" | "difficulty" | "kind" | "checklist">): number {
  let d = Math.pow(0.9747, t.value) * PRIORITY[t.difficulty];
  if (t.kind === "todo" && t.checklist.length > 0) {
    const done = t.checklist.filter((i) => i.done).length;
    d *= 1 + done / (2 * t.checklist.length);
  }
  return Math.min(DELTA_CAP, d);
}

export function rewards(d: number): { coins: number; xp: number; bossDamage: number } {
  return { coins: Math.round(10 * d), xp: Math.round(15 * d), bossDamage: Math.round(5 * d) };
}

export function energyLoss(d: number, level: number): number {
  return level < IMMUNITY_LEVEL ? 0 : Math.round(3 * d);
}

/** Bonus mobilier appliqué signé : positif sur un gain, négatif (symétrique) sur un retrait. */
export function coinsDelta(base: number, bonus: number): number {
  return base === 0 ? 0 : base + Math.sign(base) * Math.max(0, bonus);
}

/** Niveau à partir des XP totaux : floor(sqrt(xp / 50)). */
export function levelOf(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50));
}

/** Cinq paliers de teinte : 0 = bien tenue … 4 = négligée. */
export function tint(value: number): 0 | 1 | 2 | 3 | 4 {
  if (value >= 8) return 0;
  if (value >= 2) return 1;
  if (value > -2) return 2;
  if (value > -10) return 3;
  return 4;
}

export interface ScoreResult {
  task: Task;
  coins: number;
  xp: number;
  bossDamage: number;
  energyDelta: number;
}

/** Applique une coche. Renvoie null quand l'action n'a pas de sens pour ce kind / cet état. */
export function score(t: Task, direction: "up" | "down", level: number, now = Date.now()): ScoreResult | null {
  const d = delta(t);
  const r = rewards(d);
  const none = { coins: 0, xp: 0, bossDamage: 0 };
  if (t.kind === "habit") {
    if (direction === "up") {
      if (!t.up) return null;
      return { task: { ...t, countUp: t.countUp + 1, value: clampValue(t.value + d) }, ...r, energyDelta: 0 };
    }
    if (!t.down) return null;
    return { task: { ...t, countDown: t.countDown + 1, value: clampValue(t.value - d) }, ...none, energyDelta: -energyLoss(d, level) };
  }
  if (direction === "up") {
    if (t.done) return null;
    const task: Task =
      t.kind === "daily"
        ? { ...t, done: true, streak: t.streak + 1, value: clampValue(t.value + d) }
        : { ...t, done: true, completedAt: now, value: clampValue(t.value + d) };
    return { task, ...r, energyDelta: 1 };
  }
  if (!t.done) return null;
  const task: Task =
    t.kind === "daily"
      ? { ...t, done: false, streak: Math.max(0, t.streak - 1), value: clampValue(t.value - d) }
      : { ...t, done: false, completedAt: null, value: clampValue(t.value - d) };
  return { task, coins: -r.coins, xp: -r.xp, bossDamage: 0, energyDelta: 0 };
}

/** Lundi = 1 … dimanche = 64, sur la date locale passée. */
export function dayBit(date: Date): number {
  return 1 << ((date.getDay() + 6) % 7);
}

export function isDue(t: Task, date: Date): boolean {
  return t.kind === "daily" && (t.days & dayBit(date)) !== 0;
}

/** Minuit local (selon tzOffsetMinutes, convention getTimezoneOffset) exprimé en ms UTC. */
export function startOfDay(now: number, tzOffsetMinutes: number): number {
  const shift = tzOffsetMinutes * 60_000;
  const local = now - shift;
  return local - (local % 86_400_000) + shift - (local < 0 ? 86_400_000 : 0);
}

/** Le jour de la semaine (Date) de minuit local `dayStart`, pour lire le bitmask. */
function dateOfLocalDay(dayStart: number, tzOffsetMinutes: number): Date {
  return new Date(dayStart - tzOffsetMinutes * 60_000 + 12 * 3_600_000); // midi UTC du même jour local : le getDay() ne bascule pas
}

export interface RolloverResult {
  tasks: Task[];
  energyDelta: number;
  missed: Task[];
  days: number;
}

/**
 * Cron : pour chaque jour manqué entre lastResetAt (exclu) et aujourd'hui (inclus),
 * punit les quotidiennes dues la veille et non cochées, décoche, remet les compteurs, vieillit les todo.
 */
export function rollover(tasks: Task[], lastResetAt: number, now: number, tzOffsetMinutes: number, level: number): RolloverResult {
  const today = startOfDay(now, tzOffsetMinutes);
  const last = startOfDay(lastResetAt, tzOffsetMinutes);
  const DAY = 86_400_000;
  const gap = Math.round((today - last) / DAY);
  if (gap <= 0) return { tasks, energyDelta: 0, missed: [], days: 0 };
  let current = tasks.map((t) => ({ ...t }));
  const missed: Task[] = [];
  let energyDelta = 0;
  // Trop longue absence : on repart propre sans punir.
  const days = gap > MAX_ROLLOVER_DAYS ? 0 : gap;
  for (let i = 0; i < days; i++) {
    const yesterday = dateOfLocalDay(today - (days - i) * DAY, tzOffsetMinutes);
    current = current.map((t) => {
      if (t.kind === "daily") {
        if (!t.done && isDue(t, yesterday)) {
          const d = delta(t);
          energyDelta -= energyLoss(d, level);
          if (i === days - 1) missed.push(t);
          return { ...t, value: clampValue(t.value - d), streak: 0 };
        }
        return { ...t, done: false };
      }
      if (t.kind === "habit") return { ...t, countUp: 0, countDown: 0 };
      return t.done ? t : { ...t, value: clampValue(t.value - 0.5) };
    });
  }
  if (days === 0) {
    current = current.map((t) =>
      t.kind === "daily" ? { ...t, done: false } : t.kind === "habit" ? { ...t, countUp: 0, countDown: 0 } : t,
    );
  }
  return { tasks: current, energyDelta: Math.max(-CRON_ENERGY_CAP, energyDelta), missed, days };
}

// ── Validation des entrées client ────────────────────────────────────────────
export const cleanKind = (v: unknown): TaskKind => (KINDS.includes(v as TaskKind) ? (v as TaskKind) : "todo");
export const cleanDifficulty = (v: unknown): Difficulty =>
  DIFFICULTIES.includes(v as Difficulty) ? (v as Difficulty) : "easy";
export const cleanDays = (v: unknown): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) & 127 : 127;
  return n === 0 ? 127 : n;
};
const ENTITIES: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[<>&"']/g, (c) => ENTITIES[c] ?? c);
const unescapeHtml = (s: string): string =>
  s.replace(/&(?:lt|gt|amp|quot|#39);/g, (m) => ({ "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'" })[m] ?? m);
export const cleanChecklist = (v: unknown): ChecklistItem[] =>
  (Array.isArray(v) ? v : [])
    .filter((i) => i && typeof i === "object" && typeof (i as { text?: unknown }).text === "string")
    .map((i) => ({
      // Normalise avant d'échapper (idempotent) : le client renvoie parfois le texte déjà échappé (toggle d'un item).
      text: escapeHtml(unescapeHtml(String((i as { text: string }).text).replace(/\s+/g, " ").trim().slice(0, 80))),
      done: !!(i as { done?: unknown }).done,
    }))
    .filter((i) => i.text)
    .slice(0, 20);
export const cleanNote = (v: unknown): string =>
  escapeHtml(String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 200));
