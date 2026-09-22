// Règles des tâches : pures, sans base ni socket. index.ts lit, appelle, écrit, émet.
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
