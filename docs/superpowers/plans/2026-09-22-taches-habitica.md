# Tâches façon Habitica — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trois types de tâches (habitude / quotidienne / à-faire) avec difficulté, valeur cachée qui teinte la carte, et une jauge d'énergie qui remplace la dégradation.

**Architecture:** Les règles vivent dans un module pur `server/src/scoring.ts` (partagé avec le client via l'alias `@shared`), testé sans base ni socket. `server/src/index.ts` ne fait que lire les lignes SQLite, appeler `scoring`, écrire et émettre. Côté client, `app/src/tasks.ts` tient l'état (onglet, filtre, liste), `main.ts` rend le panneau et le HUD, `scene.ts` teinte les ardoises et anime le personnage.

**Tech Stack:** Node 24, TypeScript, better-sqlite3, socket.io, Vite, three.js, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-22-taches-habitica-design.md`

## Global Constraints

- Style de code du repo : une ligne dense côté `app/src`, prettier 2 espaces côté `server/src`. Commentaires en anglais côté app, en français côté serveur (on suit le fichier).
- Tests : `cd app && npm test && npm run typecheck`, `cd server && npm test && npx tsc --noEmit`. Les deux doivent rester verts à chaque commit.
- Les constantes chiffrées viennent de la spec : `PRIORITY {trivial:0.1, easy:1, medium:1.5, hard:2}`, `VALUE_MIN −25`, `VALUE_MAX 25`, `DELTA_CAP 3`, `ENERGY_MAX 50`, `IMMUNITY_LEVEL 3`, `CRON_ENERGY_CAP 20`, `MAX_ROLLOVER_DAYS 30`, gains `coins = round(10·d)`, `xp = round(15·d)`, `bossDamage = round(5·d)`, perte `energy = round(3·d)`, todo qui vieillit `−0.5/jour`, bitmask `days` lundi = 1 … dimanche = 64.
- Messages de commit : `type(scope): …` en anglais, terminés par `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Ne pas committer `server/data.db` ni `server/node_modules` (suivis par git mais modifiés localement : toujours `git add` des chemins explicites).

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `server/src/scoring.ts` (nouveau) | Règles pures : `delta`, `rewards`, `energyLoss`, `score`, `rollover`, `isDue`, `tint`, `levelOf`, validateurs (`cleanKind`, `cleanDifficulty`, `cleanDays`, `cleanChecklist`) |
| `server/tests/scoring.test.ts` (nouveau) | Tests des règles |
| `server/src/types.ts` | `Task`, `TaskKind`, `Difficulty`, `ChecklistItem`, événements socket |
| `server/src/index.ts` | Migrations, SQL, `task:add/score/update/delete`, `runRollover`, énergie, retrait de la dégradation |
| `app/src/tasks.ts` | État client : onglet, filtre, `visible`, `pending`, helpers de formulaire |
| `app/tests/tasks.test.ts` | Tests de l'état client |
| `app/src/progress.ts` + `app/tests/progress.test.ts` | `energy`, `exhausted` |
| `app/src/main.ts` | Panneau à onglets, formulaire, checklist, HUD énergie, toasts |
| `app/src/style.css` | Onglets, teintes, jauge, checklist |
| `app/src/scene.ts` | Ardoises teintées, « ± », `setEnergy` |
| `app/src/landing.ts` | Notes de la landing au nouveau format `Task` |

---

## Task 1 : `scoring.ts` — delta, gains, énergie

**Files:**
- Create: `server/src/scoring.ts`
- Create: `server/tests/scoring.test.ts`
- Modify: `server/src/types.ts:175-183` (interface `Task`)

**Interfaces:**
- Produces:
  ```ts
  export type TaskKind = 'habit' | 'daily' | 'todo';
  export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard';
  export interface ChecklistItem { text: string; done: boolean }
  export interface Task { id; userId; text; note; kind; difficulty; value; category; createdAt; done; up; down; countUp; countDown; days; streak; dueAt; checklist; completedAt }
  export const PRIORITY, VALUE_MIN, VALUE_MAX, DELTA_CAP, ENERGY_MAX, IMMUNITY_LEVEL, CRON_ENERGY_CAP, MAX_ROLLOVER_DAYS
  export function delta(t: Pick<Task,'value'|'difficulty'|'kind'|'checklist'>): number
  export function rewards(d: number): { coins: number; xp: number; bossDamage: number }
  export function energyLoss(d: number, level: number): number
  export function levelOf(xp: number): number
  export function tint(value: number): 0|1|2|3|4
  export function clampValue(v: number): number
  ```

- [ ] **Step 1 : Remplacer l'interface `Task` dans `server/src/types.ts`**

Remplacer les lignes 175-183 par :

```ts
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
```

- [ ] **Step 2 : Écrire les tests de `delta`, `rewards`, `energyLoss`, `tint`, `levelOf`**

Créer `server/tests/scoring.test.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  delta, rewards, energyLoss, tint, levelOf, clampValue,
  DELTA_CAP, VALUE_MIN, VALUE_MAX,
} from "../src/scoring.ts";
import type { Task } from "../src/types.ts";

export const task = (extra: Partial<Task> = {}): Task => ({
  id: "t", userId: "u", text: "Tâche", note: "", kind: "todo", difficulty: "easy",
  value: 0, category: null, createdAt: 1, done: false, up: true, down: false,
  countUp: 0, countDown: 0, days: 127, streak: 0, dueAt: null, checklist: [],
  completedAt: null, ...extra,
});

test("delta is 1 for a fresh easy task and follows the difficulty", () => {
  assert.equal(delta(task()), 1);
  assert.equal(delta(task({ difficulty: "trivial" })), 0.1);
  assert.equal(delta(task({ difficulty: "medium" })), 1.5);
  assert.equal(delta(task({ difficulty: "hard" })), 2);
});

test("delta shrinks for a well-kept task and grows for a neglected one", () => {
  assert.ok(delta(task({ value: 15 })) < 0.7 && delta(task({ value: 15 })) > 0.65);
  assert.ok(delta(task({ value: -10 })) > 1.29 && delta(task({ value: -10 })) < 1.30);
});

test("delta never exceeds the cap", () => {
  assert.equal(delta(task({ value: -25, difficulty: "hard" })), DELTA_CAP);
});

test("a todo with a checklist earns up to x1.5 for its ticked steps", () => {
  const list = [{ text: "a", done: true }, { text: "b", done: true }, { text: "c", done: false }];
  assert.equal(delta(task({ checklist: list })), 1 + 2 / 6);
  assert.equal(delta(task({ checklist: list.map((i) => ({ ...i, done: true })) })), 1.5);
  assert.equal(delta(task({ kind: "daily", checklist: list })), 1); // daily ignore la checklist
});

test("rewards round the delta into coins, xp and boss damage", () => {
  assert.deepEqual(rewards(1), { coins: 10, xp: 15, bossDamage: 5 });
  assert.deepEqual(rewards(2.6), { coins: 26, xp: 39, bossDamage: 13 });
  assert.deepEqual(rewards(0.1), { coins: 1, xp: 2, bossDamage: 1 });
});

test("energy loss is 3 per delta and nothing under the immunity level", () => {
  assert.equal(energyLoss(1, 3), 3);
  assert.equal(energyLoss(2.6, 10), 8);
  assert.equal(energyLoss(1, 2), 0);
});

test("value is clamped and tint has five steps", () => {
  assert.equal(clampValue(40), VALUE_MAX);
  assert.equal(clampValue(-40), VALUE_MIN);
  assert.equal(tint(8), 0); assert.equal(tint(2), 1); assert.equal(tint(0), 2);
  assert.equal(tint(-2), 3); assert.equal(tint(-10), 4);
});

test("level curve is the one index.ts used", () => {
  assert.equal(levelOf(0), 0); assert.equal(levelOf(50), 1); assert.equal(levelOf(1250), 5);
});
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run: `cd server && npm test`
Expected: FAIL — `Cannot find module '../src/scoring.ts'`

- [ ] **Step 4 : Écrire `server/src/scoring.ts`**

```ts
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
```

- [ ] **Step 5 : Lancer, vérifier le succès**

Run: `cd server && npm test && npx tsc --noEmit`
Expected: PASS (les tests existants `auth`, `catalog`, `look`, `waitlist` restent verts). `tsc` va signaler `index.ts` sur `Task` (`type`, `note`…) : c'est attendu, la Task 3 le corrige. Si `tsc` bloque le commit, ignorer ici et vérifier à la fin de la Task 3.

- [ ] **Step 6 : Commit**

```bash
git add server/src/scoring.ts server/tests/scoring.test.ts server/src/types.ts
git commit -m "feat(server): task scoring rules — delta, rewards, energy loss, tint

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 2 : `scoring.ts` — `score`, `isDue`, `rollover`, validateurs

**Files:**
- Modify: `server/src/scoring.ts`
- Modify: `server/tests/scoring.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  export interface ScoreResult { task: Task; coins: number; xp: number; bossDamage: number; energyDelta: number }
  export function score(t: Task, direction: 'up'|'down', level: number): ScoreResult | null   // null = refusé
  export function isDue(t: Task, date: Date): boolean
  export function dayBit(date: Date): number
  export function startOfDay(now: number, tzOffsetMinutes: number): number   // ms UTC du minuit local
  export interface RolloverResult { tasks: Task[]; energyDelta: number; missed: Task[]; days: number }
  export function rollover(tasks: Task[], lastResetAt: number, now: number, tzOffsetMinutes: number, level: number): RolloverResult
  export function cleanKind(v: unknown): TaskKind
  export function cleanDifficulty(v: unknown): Difficulty
  export function cleanDays(v: unknown): number
  export function cleanChecklist(v: unknown): ChecklistItem[]
  export function cleanNote(v: unknown): string
  ```

- [ ] **Step 1 : Ajouter les tests**

À la suite de `server/tests/scoring.test.ts` :

```ts
import { score, isDue, dayBit, startOfDay, rollover, cleanKind, cleanDifficulty, cleanDays, cleanChecklist, cleanNote, CRON_ENERGY_CAP } from "../src/scoring.ts";

const LVL = 10; // au-dessus de l'immunité
const DAY = 86_400_000;
// 2026-09-22 est un mardi. Minuit local Paris (UTC+2 → tzOffset -120 comme le renvoie getTimezoneOffset).
const TUE = Date.UTC(2026, 8, 21, 22, 0, 0); // mardi 00:00 Paris
const TZ = -120;

test("habit up adds value and rewards; down loses energy", () => {
  const h = task({ kind: "habit", up: true, down: true });
  const up = score(h, "up", LVL)!;
  assert.equal(up.task.countUp, 1); assert.equal(up.task.value, 1); assert.equal(up.coins, 10); assert.equal(up.energyDelta, 0);
  const down = score(h, "down", LVL)!;
  assert.equal(down.task.countDown, 1); assert.equal(down.task.value, -1); assert.equal(down.coins, 0); assert.equal(down.energyDelta, -3);
  assert.equal(score(task({ kind: "habit", down: false }), "down", LVL), null);
  assert.equal(score(task({ kind: "habit", up: false }), "up", LVL), null);
});

test("daily up ticks, streaks and gives +1 energy; down unticks and takes it back", () => {
  const d = task({ kind: "daily", streak: 4 });
  const up = score(d, "up", LVL)!;
  assert.equal(up.task.done, true); assert.equal(up.task.streak, 5); assert.equal(up.energyDelta, 1); assert.equal(up.coins, 10);
  assert.equal(score(up.task, "up", LVL), null);
  const down = score(up.task, "down", LVL)!;
  assert.equal(down.task.done, false); assert.equal(down.task.streak, 4); assert.equal(down.coins, -10); assert.equal(down.xp, -15);
  assert.equal(down.energyDelta, 0);
  assert.equal(score(d, "down", LVL), null);
});

test("todo completes with a timestamp and can be undone", () => {
  const up = score(task(), "up", LVL)!;
  assert.equal(up.task.done, true); assert.ok(up.task.completedAt! > 0);
  const down = score(up.task, "down", LVL)!;
  assert.equal(down.task.done, false); assert.equal(down.task.completedAt, null);
});

test("score never pushes value past the bounds", () => {
  assert.equal(score(task({ kind: "habit", value: 24.8 }), "up", LVL)!.task.value, 25);
});

test("dayBit and isDue follow the Monday=1 bitmask", () => {
  assert.equal(dayBit(new Date(2026, 8, 21)), 1);   // lundi
  assert.equal(dayBit(new Date(2026, 8, 27)), 64);  // dimanche
  assert.equal(isDue(task({ kind: "daily", days: 1 | 4 }), new Date(2026, 8, 23)), true); // mercredi
  assert.equal(isDue(task({ kind: "daily", days: 1 | 4 }), new Date(2026, 8, 22)), false);
  assert.equal(isDue(task({ kind: "todo" }), new Date()), false);
});

test("startOfDay gives local midnight in UTC ms", () => {
  assert.equal(startOfDay(TUE + 5 * 3_600_000, TZ), TUE);
  assert.equal(startOfDay(TUE - 1, TZ), TUE - DAY);
});

test("rollover punishes yesterday's due dailies, resets ticks and counters, ages todos", () => {
  const missed = task({ id: "m", kind: "daily", days: 127, streak: 3 });
  const notDue = task({ id: "n", kind: "daily", days: 4, streak: 2 });   // mercredi seulement
  const ticked = task({ id: "t", kind: "daily", done: true, streak: 1 });
  const habit = task({ id: "h", kind: "habit", countUp: 3, countDown: 1 });
  const todo = task({ id: "o", value: 1 });
  const done = task({ id: "d", done: true, value: 1 });
  const r = rollover([missed, notDue, ticked, habit, todo, done], TUE - DAY, TUE + 3_600_000, TZ, LVL);
  const by = Object.fromEntries(r.tasks.map((t) => [t.id, t]));
  assert.equal(r.days, 1);
  assert.deepEqual(r.missed.map((t) => t.id), ["m"]);
  assert.equal(by.m.value, -1); assert.equal(by.m.streak, 0); assert.equal(by.m.done, false);
  assert.equal(by.n.value, 0); assert.equal(by.n.streak, 2);
  assert.equal(by.t.done, false); assert.equal(by.t.streak, 1);
  assert.equal(by.h.countUp, 0); assert.equal(by.h.countDown, 0);
  assert.equal(by.o.value, 0.5); assert.equal(by.d.value, 1);
  assert.equal(r.energyDelta, -3);
});

test("rollover replays each missed day, caps the energy loss and stops at 30 days", () => {
  const d = task({ kind: "daily", difficulty: "hard" });
  const three = rollover([d], TUE - 3 * DAY, TUE, TZ, LVL);
  assert.equal(three.days, 3);
  assert.ok(three.tasks[0].value < -5);
  assert.equal(three.energyDelta, -CRON_ENERGY_CAP);
  const long = rollover([task({ kind: "daily" })], TUE - 40 * DAY, TUE, TZ, LVL);
  assert.equal(long.days, 0); assert.equal(long.energyDelta, 0); assert.equal(long.tasks[0].value, 0);
});

test("rollover does nothing twice in the same day", () => {
  const r = rollover([task({ kind: "daily" })], TUE, TUE + 3_600_000, TZ, LVL);
  assert.equal(r.days, 0); assert.equal(r.missed.length, 0);
});

test("validators fall back to defaults", () => {
  assert.equal(cleanKind("daily"), "daily"); assert.equal(cleanKind("x"), "todo");
  assert.equal(cleanDifficulty("hard"), "hard"); assert.equal(cleanDifficulty(3), "easy");
  assert.equal(cleanDays(0), 127); assert.equal(cleanDays(300), 300 & 127); assert.equal(cleanDays("x"), 127);
  assert.deepEqual(cleanChecklist([{ text: " a ", done: 1 }, { text: "" }, "junk"]), [{ text: "a", done: true }]);
  assert.equal(cleanChecklist(Array.from({ length: 30 }, () => ({ text: "x", done: false }))).length, 20);
  assert.equal(cleanChecklist([{ text: "y".repeat(100), done: false }])[0].text.length, 80);
  assert.equal(cleanNote("  <b>hi</b>  "), "&lt;b&gt;hi&lt;/b&gt;"); assert.equal(cleanNote("z".repeat(300)).length, 200);
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd server && npm test`
Expected: FAIL — `score is not a function` (ou export manquant)

- [ ] **Step 3 : Implémenter**

À la suite de `server/src/scoring.ts` :

```ts
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
export const cleanChecklist = (v: unknown): ChecklistItem[] =>
  (Array.isArray(v) ? v : [])
    .filter((i) => i && typeof i === "object" && typeof (i as { text?: unknown }).text === "string")
    .map((i) => ({ text: String((i as { text: string }).text).replace(/\s+/g, " ").trim().slice(0, 80), done: !!(i as { done?: unknown }).done }))
    .filter((i) => i.text)
    .slice(0, 20);
export const cleanNote = (v: unknown): string =>
  String(v ?? "")
    .replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c] ?? c)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
```

Note sur le test « ticked daily » : `ticked` était cochée la veille, elle n'est donc pas ratée et garde sa série (le `!t.done` la protège avant le `isDue`).

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `cd server && npm test`
Expected: PASS. Si `startOfDay(TUE - 1, TZ)` échoue, vérifier l'arithmétique modulo avec des `now` négatifs : le `- (local < 0 ? DAY : 0)` n'est là que pour les dates avant 1970, il ne doit pas s'appliquer ici.

- [ ] **Step 5 : Commit**

```bash
git add server/src/scoring.ts server/tests/scoring.test.ts
git commit -m "feat(server): score, isDue, rollover and input validators for tasks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 3 : Serveur — migration, types d'événements, `task:add`, `task:update`, `task:delete`, `tasks:state`

**Files:**
- Modify: `server/src/types.ts` (événements)
- Modify: `server/src/index.ts` : `TaskRow` (l. 82-90), migrations (l. 126-140), `sql` (l. 294-320, 366-369), `join` (l. 1473-1475, 1536-1543), handlers (l. 1885-2010)

**Interfaces:**
- Consumes: `scoring.ts` (Tasks 1-2).
- Produces: `rowToTask(r: TaskRow): Task`, `taskToRow`, SQL `insertTask`, `updateTask`, `getTaskRow`, `getTasks` ; événements `task:add`, `task:update`, `task:updated: Task`, `tasks:state { tasks, coins, energy }`.

- [ ] **Step 1 : Événements dans `server/src/types.ts`**

Dans `ClientToServerEvents`, remplacer les définitions `task:add`, `task:toggle`, `task:update` (l. 316-328) par :

```ts
  "task:add": (payload: {
    userId: string;
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
  "task:score": (payload: { userId: string; taskId: string; direction: "up" | "down" }) => void;
  "task:update": (payload: {
    userId: string;
    taskId: string;
    patch: Partial<Pick<Task, "text" | "note" | "difficulty" | "category" | "up" | "down" | "days" | "dueAt" | "checklist">>;
  }) => void;
```

Remplacer `"debug:set-degradation"` (l. 341) par `"debug:set-energy": (payload: { userId: string; energy: number }) => void;` et supprimer `"room:clean"` (l. 343). Dans le payload de `join` (l. ~298-306), ajouter `tzOffsetMinutes?: number;`.

Dans `ServerToClientEvents`, remplacer `tasks:state`, `task:toggled`, `task:updated` (l. 422-433) par :

```ts
  "tasks:state": (payload: { tasks: Task[]; coins: number; energy: number }) => void;
  "task:added": (task: Task) => void;
  "task:scored": (payload: {
    task: Task;
    coins: number;
    xp: number;
    level: number;
    xpToNext: number;
    levelUp: boolean;
    energy: number;
    bossDamage: number;
  }) => void;
  "task:updated": (task: Task) => void;
  "day:rollover": (payload: { missed: Task[]; energy: number; energyDelta: number }) => void;
  "energy:update": (payload: { energy: number }) => void;
  "energy:exhausted": (payload: { coins: number }) => void;
```

Supprimer `"degradation:update"` (l. 501). Dans `profile:data` (l. ~533), remplacer `degradation: number;` par `energy: number;`. Chercher `admin:set-degradation` dans le fichier et le supprimer.

- [ ] **Step 2 : `TaskRow`, migrations et SQL dans `index.ts`**

Remplacer `interface TaskRow` (l. 82-90) :

```ts
interface TaskRow {
  id: string;
  userId: string;
  text: string;
  note: string;
  kind: string;
  difficulty: string;
  value: number;
  done: number;
  createdAt: number;
  category: string | null;
  up: number;
  down: number;
  countUp: number;
  countDown: number;
  days: number;
  streak: number;
  dueAt: number | null;
  checklist: string;
  completedAt: number | null;
}
```

Ajouter `energy: number; exhaustedUntil: number; tzOffset: number;` à `UserRow` (l. 53-80) et étendre le `SELECT` de `getUser` (l. 284) avec `energy, exhaustedUntil, tzOffset`.

Après la migration `degradation` (l. 136-139), ajouter :

```ts
for (const col of [
  "tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'todo'",
  "tasks ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'easy'",
  "tasks ADD COLUMN value REAL NOT NULL DEFAULT 0",
  "tasks ADD COLUMN note TEXT NOT NULL DEFAULT ''",
  "tasks ADD COLUMN up INTEGER NOT NULL DEFAULT 1",
  "tasks ADD COLUMN down INTEGER NOT NULL DEFAULT 0",
  "tasks ADD COLUMN countUp INTEGER NOT NULL DEFAULT 0",
  "tasks ADD COLUMN countDown INTEGER NOT NULL DEFAULT 0",
  "tasks ADD COLUMN days INTEGER NOT NULL DEFAULT 127",
  "tasks ADD COLUMN streak INTEGER NOT NULL DEFAULT 0",
  "tasks ADD COLUMN dueAt INTEGER",
  "tasks ADD COLUMN checklist TEXT NOT NULL DEFAULT '[]'",
  "tasks ADD COLUMN completedAt INTEGER",
  "users ADD COLUMN energy INTEGER NOT NULL DEFAULT 50",
  "users ADD COLUMN exhaustedUntil INTEGER NOT NULL DEFAULT 0",
  "users ADD COLUMN tzOffset INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    db.exec(`ALTER TABLE ${col}`);
  } catch {}
}
// Les anciennes tâches : 'daily' reste daily, tout le reste devient un à-faire.
db.exec(`UPDATE tasks SET kind = 'daily' WHERE type = 'daily' AND kind = 'todo'`);
db.exec(`UPDATE tasks SET completedAt = createdAt WHERE kind = 'todo' AND done = 1 AND completedAt IS NULL`);
```

Remplacer dans `sql` : `insertTask`, `getTask`, `updateTaskDone`, `updateTaskText`, `countUncompletedDailies`, `resetDailies`, `getDegradation`, `setDegradation`, `saveDailyReset` par :

```ts
  insertTask: db.prepare(
    "INSERT INTO tasks (id, userId, text, note, kind, difficulty, value, done, createdAt, category, up, down, countUp, countDown, days, streak, dueAt, checklist, completedAt) VALUES (@id, @userId, @text, @note, @kind, @difficulty, @value, @done, @createdAt, @category, @up, @down, @countUp, @countDown, @days, @streak, @dueAt, @checklist, @completedAt)",
  ),
  getTaskRow: db.prepare("SELECT * FROM tasks WHERE id = ? AND userId = ?"),
  updateTask: db.prepare(
    "UPDATE tasks SET text = @text, note = @note, difficulty = @difficulty, value = @value, done = @done, category = @category, up = @up, down = @down, countUp = @countUp, countDown = @countDown, days = @days, streak = @streak, dueAt = @dueAt, checklist = @checklist, completedAt = @completedAt WHERE id = @id AND userId = @userId",
  ),
  getEnergy: db.prepare("SELECT energy, exhaustedUntil FROM users WHERE id = ?"),
  setEnergy: db.prepare("UPDATE users SET energy = ?, exhaustedUntil = ? WHERE id = ?"),
  saveDailyReset: db.prepare("UPDATE users SET lastDailyResetAt = ?, tzOffset = ? WHERE id = ?"),
```

`countDoneTasks` devient `"SELECT COUNT(*) as cnt FROM tasks WHERE userId = ? AND done = 1 AND kind != 'habit'"`.

Ajouter, juste après le bloc `const sql = {…}` :

```ts
import { /* en haut du fichier, avec les autres imports */ } from "./scoring.js";
// → import { score, rollover, rewards, levelOf, tint, cleanKind, cleanDifficulty, cleanDays, cleanChecklist, cleanNote, isDue, ENERGY_MAX } from "./scoring.js";

function rowToTask(r: TaskRow): Task {
  let checklist: ChecklistItem[] = [];
  try { checklist = cleanChecklist(JSON.parse(r.checklist || "[]")); } catch {}
  return {
    id: r.id, userId: r.userId, text: r.text, note: r.note ?? "",
    kind: cleanKind(r.kind), difficulty: cleanDifficulty(r.difficulty), value: r.value ?? 0,
    category: r.category ?? null, createdAt: r.createdAt, done: !!r.done,
    up: !!r.up, down: !!r.down, countUp: r.countUp ?? 0, countDown: r.countDown ?? 0,
    days: r.days ?? 127, streak: r.streak ?? 0, dueAt: r.dueAt ?? null, checklist, completedAt: r.completedAt ?? null,
  };
}
function taskToRow(t: Task): TaskRow {
  return {
    ...t, done: t.done ? 1 : 0, up: t.up ? 1 : 0, down: t.down ? 1 : 0, checklist: JSON.stringify(t.checklist),
  };
}
function userTasks(userId: string): Task[] {
  return (sql.getTasks.all(userId) as TaskRow[]).map(rowToTask);
}
/** Ce que les autres voient sur les ardoises : à-faire ouverts, quotidiennes pas encore cochées, toutes les habitudes. */
const isPending = (t: Task): boolean => t.kind === "habit" || !t.done;
```

Ajouter `ChecklistItem` à l'import de types en haut du fichier. Supprimer `computeLevel` (l. 433-436) et remplacer ses appels par `levelOf`.

- [ ] **Step 3 : `join` et `tasks:state`**

Dans `join` (l. 1391), destructurer aussi `tzOffsetMinutes`. Remplacer l. 1473-1475 par :

```ts
    const pendingTaskIds = userTasks(userId).filter(isPending).map((t) => t.id);
```

Remplacer l. 1536-1543 par :

```ts
    socket.emit("tasks:state", { tasks: userTasks(userId), coins: user.coins, energy: user.energy ?? ENERGY_MAX });
```

Laisser l'appel `checkAndApplyDailyReset(socket, userId);` (l. 1560) en place pour l'instant : la Task 4 le remplace. Retirer `degradation: user.degradation ?? 0,` du `profile:data` (l. 2631) au profit de `energy: user.energy ?? ENERGY_MAX,`.

- [ ] **Step 4 : `task:add`, `task:update`, `task:delete`**

Remplacer le handler `task:add` (l. 1885-1915) :

```ts
  socket.on("task:add", (payload) => {
    if (!allow(socket.id, "task:add", 10, 10000)) return;
    const { userId } = payload;
    const safe = sanitize(payload.text);
    if (!safe.trim()) return;
    sql.upsertUser.run(userId);
    const kind = cleanKind(payload.kind);
    const task: Task = {
      id: randomUUID(),
      userId,
      text: safe,
      note: cleanNote(payload.note),
      kind,
      difficulty: cleanDifficulty(payload.difficulty),
      value: 0,
      category: VALID_CATEGORIES.has(payload.category as string) ? payload.category : null,
      createdAt: Date.now(),
      done: false,
      up: kind === "habit" ? payload.up !== false : true,
      down: kind === "habit" ? !!payload.down : false,
      countUp: 0,
      countDown: 0,
      days: kind === "daily" ? cleanDays(payload.days) : 127,
      streak: 0,
      dueAt: kind === "todo" && Number.isFinite(payload.dueAt) ? Math.floor(payload.dueAt as number) : null,
      checklist: kind === "todo" ? cleanChecklist(payload.checklist) : [],
      completedAt: null,
    };
    if (task.kind === "habit" && !task.up && !task.down) task.up = true;
    sql.insertTask.run(taskToRow(task));
    socket.emit("task:added", task);
    const p = getPlayer(socket.id);
    if (p) {
      p.pendingTaskIds = [...(p.pendingTaskIds ?? []), task.id];
      broadcastToOwnRoom(socket, "tasks:public-update", { socketId: socket.id, taskIds: p.pendingTaskIds });
    }
  });
```

Remplacer le handler `task:update` (l. 1996-2007) :

```ts
  socket.on("task:update", ({ userId, taskId, patch }) => {
    if (!allow(socket.id, "task:update", 20, 10000)) return;
    const row = sql.getTaskRow.get(taskId, userId) as TaskRow | undefined;
    if (!row || !patch || typeof patch !== "object") return;
    const t = rowToTask(row);
    if (typeof patch.text === "string") { const s = sanitize(patch.text); if (s.trim()) t.text = s; }
    if ("note" in patch) t.note = cleanNote(patch.note);
    if ("difficulty" in patch) t.difficulty = cleanDifficulty(patch.difficulty);
    if ("category" in patch) t.category = VALID_CATEGORIES.has(patch.category as string) ? (patch.category as string) : null;
    if (t.kind === "habit") {
      if ("up" in patch) t.up = !!patch.up;
      if ("down" in patch) t.down = !!patch.down;
      if (!t.up && !t.down) t.up = true;
    }
    if (t.kind === "daily" && "days" in patch) t.days = cleanDays(patch.days);
    if (t.kind === "todo") {
      if ("dueAt" in patch) t.dueAt = Number.isFinite(patch.dueAt) ? Math.floor(patch.dueAt as number) : null;
      if ("checklist" in patch) t.checklist = cleanChecklist(patch.checklist);
    }
    sql.updateTask.run(taskToRow(t));
    socket.emit("task:updated", t);
  });
```

`task:delete` (l. 1982-1994) reste tel quel. Supprimer le handler `task:toggle` (l. 1917-1980) entièrement — la Task 4 le remplace par `task:score`.

- [ ] **Step 5 : Retirer la dégradation**

- Supprimer les handlers `debug:set-degradation` (l. 2047-2052), `room:clean` (l. 2055-2080) et `admin:set-degradation` (l. 2547-2560).
- Dans le pomodoro partagé (l. 1180-1186) et solo (l. 2364-2370) : supprimer les blocs `currentDeg … degradation:update`.
- Garder `checkAndApplyDailyReset` pour l'instant mais remplacer son corps par `void socket; void userId;` — la Task 4 réécrit la fonction. Supprimer `getDegradation`, `setDegradation` de `sql` et `degradation` de `UserRow` si plus référencé.

- [ ] **Step 6 : Typecheck et tests serveur**

Run: `cd server && npx tsc --noEmit && npm test`
Expected: `tsc` sans erreur (chasser chaque référence restante à `type`, `task:toggle`, `degradation`), tests PASS.

- [ ] **Step 7 : Commit**

```bash
git add server/src/index.ts server/src/types.ts
git commit -m "feat(server): task kinds, difficulty and checklist in storage and events; drop degradation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 4 : Serveur — `task:score`, `runRollover`, énergie

**Files:**
- Modify: `server/src/index.ts` : `checkAndApplyDailyReset` (l. 803-841), `emitXpUpdate` (l. 858-880), handlers

**Interfaces:**
- Consumes: `score`, `rollover`, `levelOf` de `scoring.ts` ; `rowToTask`, `taskToRow`, `userTasks`, `isPending` de la Task 3.
- Produces: `applyEnergy(socket, userId, delta): number` ; événements `task:scored`, `day:rollover`, `energy:update`, `energy:exhausted`.

- [ ] **Step 1 : `applyEnergy` et remise à 50 au level-up**

Remplacer `checkAndApplyDailyReset` (l. 803-841) par :

```ts
/**
 * Applique une variation d'énergie. À 0 : épuisement — jauge remise à 50, −30 % des pièces,
 * personnage « épuisé » jusqu'au prochain minuit. Renvoie l'énergie finale.
 */
function applyEnergy(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  userId: string,
  delta: number,
): number {
  const row = sql.getEnergy.get(userId) as { energy: number; exhaustedUntil: number };
  let energy = Math.min(ENERGY_MAX, (row?.energy ?? ENERGY_MAX) + delta);
  let exhaustedUntil = row?.exhaustedUntil ?? 0;
  if (energy <= 0) {
    energy = ENERGY_MAX;
    const user = sql.getUser.get(userId) as UserRow;
    const coins = Math.floor(user.coins * 0.7);
    sql.setCoins.run(coins, userId);
    exhaustedUntil = startOfDay(Date.now(), user.tzOffset ?? 0) + 86_400_000;
    socket.emit("energy:exhausted", { coins });
    socket.emit("coins:update", { coins });
    const p = getPlayer(socket.id);
    if (p) p.coins = coins;
  }
  sql.setEnergy.run(energy, exhaustedUntil, userId);
  return energy;
}

/** Cron : rejoue les jours manqués depuis la dernière connexion. Appelé au join. */
function runRollover(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  userId: string,
  tzOffsetMinutes: number,
): void {
  const user = sql.getUser.get(userId) as UserRow;
  const tz = Number.isFinite(tzOffsetMinutes) ? Math.max(-840, Math.min(840, Math.round(tzOffsetMinutes))) : (user.tzOffset ?? 0);
  const now = Date.now();
  // Même journée locale déjà traitée : rien à faire (un rollover > 30 jours renvoie aussi days = 0 mais doit écrire ses remises à zéro, d'où le test sur les minuits et pas sur r.days).
  if ((user.lastDailyResetAt ?? 0) > 0 && startOfDay(user.lastDailyResetAt, tz) === startOfDay(now, tz)) { sql.saveDailyReset.run(startOfDay(now, tz), tz, userId); return; }
  const r = rollover(userTasks(userId), user.lastDailyResetAt ?? 0, now, tz, levelOf(user.xp ?? 0));
  sql.saveDailyReset.run(startOfDay(now, tz), tz, userId);
  const write = db.transaction((tasks: Task[]) => { for (const t of tasks) sql.updateTask.run(taskToRow(t)); });
  write(r.tasks);
  const energy = r.energyDelta ? applyEnergy(socket, userId, r.energyDelta) : (user.energy ?? ENERGY_MAX);
  if (r.missed.length > 0) {
    const guild = sql.getUserGuild.get(userId) as GuildRow | undefined;
    if (guild) {
      sql.updateBossHp.run(Math.min(guild.bossMaxHp, guild.bossHp + r.missed.length * 5), guild.id);
      emitGuildState(io, socketToUserId, guild.id);
    }
  }
  socket.emit("day:rollover", { missed: r.missed, energy, energyDelta: r.energyDelta });
  socket.emit("tasks:state", { tasks: r.tasks, coins: (sql.getCoins.get(userId) as UserRow).coins, energy });
}
```

Ajouter `startOfDay` à l'import de `./scoring.js`. Dans `join`, remplacer `checkAndApplyDailyReset(socket, userId);` par `runRollover(socket, userId, tzOffsetMinutes ?? 0);` — **après** le `tasks:state` initial (il le ré-émet si un jour a basculé).

Dans `emitXpUpdate` (l. 858-880), après `if (levelUp) {` ajouter en première ligne :

```ts
    sql.setEnergy.run(ENERGY_MAX, 0, userId);
    socket.emit("energy:update", { energy: ENERGY_MAX });
```

- [ ] **Step 2 : Handler `task:score`**

À l'endroit de l'ancien `task:toggle` :

```ts
  socket.on("task:score", ({ userId, taskId, direction }) => {
    if (!allow(socket.id, "task:score", 30, 10000)) return;
    if (direction !== "up" && direction !== "down") return;
    const row = sql.getTaskRow.get(taskId, userId) as TaskRow | undefined;
    if (!row) return;
    const user = sql.getUser.get(userId) as UserRow;
    const level = levelOf(user.xp ?? 0);
    const r = score(rowToTask(row), direction, level);
    if (!r) return;
    sql.updateTask.run(taskToRow(r.task));
    // Pièces : gain de la coche + bonus mobilier existants (additifs), plancher 0 en cas de retrait.
    let coins = user.coins;
    let coinsDelta = r.coins;
    if (r.coins > 0) {
      const furnitureRow = sql.getFurniture.get(userId) as { ownedFurniture: string; placedFurniture: string };
      const placed = getEffectivePlaced(furnitureRow?.placedFurniture ?? "", furnitureRow?.ownedFurniture ?? "");
      if (placed.includes("plant")) coinsDelta += 2;
      if (placed.includes("bookshelf")) coinsDelta += 2;
      if (placed.includes("cactus")) coinsDelta += 1;
      coinsDelta += getSetBonuses(placed).coinsTask;
      if (placed.includes("lamp")) emitXpUpdate(socket, userId, 5);
    }
    coins = Math.max(0, coins + coinsDelta);
    sql.setCoins.run(coins, userId);
    if (r.xp !== 0) emitXpUpdate(socket, userId, r.xp);
    const energy = r.energyDelta ? applyEnergy(socket, userId, r.energyDelta) : (sql.getEnergy.get(userId) as { energy: number }).energy;
    const { xp } = sql.getXp.get(userId) as { xp: number };
    const newLevel = levelOf(xp);
    socket.emit("task:scored", {
      task: r.task, coins, xp, level: newLevel,
      xpToNext: 50 * (newLevel + 1) * (newLevel + 1) - xp,
      levelUp: newLevel > level, energy, bossDamage: r.bossDamage,
    });
    if (r.bossDamage > 0) {
      const guild = sql.getUserGuild.get(userId) as GuildRow | undefined;
      if (guild) {
        const fresh = sql.getGuild.get(guild.id) as GuildRow;
        const hp = Math.max(0, fresh.bossHp - r.bossDamage);
        sql.updateBossHp.run(hp, fresh.id);
        if (hp <= 0) handleBossDefeat(io, fresh);
        else {
          socket.emit("guild:boss-attacked", { damage: r.bossDamage, newHp: hp, maxHp: fresh.bossMaxHp });
          emitGuildState(io, socketToUserId, fresh.id);
        }
      }
    }
    if (r.coins > 0) {
      const taskCount = (sql.countDoneTasks.get(userId) as { cnt: number }).cnt;
      if (taskCount === 1) tryUnlock(io, socket, userId, "first-task");
      if (taskCount >= 10) tryUnlock(io, socket, userId, "task-10");
      if (taskCount >= 50) tryUnlock(io, socket, userId, "task-50");
      if (coins >= 100) tryUnlock(io, socket, userId, "coins-100");
      if (coins >= 500) tryUnlock(io, socket, userId, "coins-500");
      if (r.task.kind !== "habit") broadcastToOwnRoom(socket, "task:completed-public", { socketId: socket.id });
    }
    const p = getPlayer(socket.id);
    if (p) {
      p.coins = coins;
      p.pendingTaskIds = userTasks(userId).filter(isPending).map((t) => t.id);
      broadcastToOwnRoom(socket, "tasks:public-update", { socketId: socket.id, taskIds: p.pendingTaskIds });
    }
    broadcastLeaderboardForSocket(io, socket.id);
  });
```

- [ ] **Step 3 : `debug:set-energy`**

À la place de l'ancien `debug:set-degradation` :

```ts
  socket.on("debug:set-energy", ({ userId, energy }) => {
    sql.upsertUser.run(userId);
    const e = Math.max(1, Math.min(ENERGY_MAX, Math.round(energy)));
    sql.setEnergy.run(e, 0, userId);
    socket.emit("energy:update", { energy: e });
  });
```

- [ ] **Step 4 : Typecheck, tests, smoke au socket**

Run: `cd server && npx tsc --noEmit && npm test`
Expected: PASS.

Puis, serveur lancé (`npm run dev`), dans un script Node jetable dans le scratchpad :

```js
import { io } from "socket.io-client";
const s = io("http://localhost:3001");
s.on("connect", () => s.emit("join", { name: "Test", color: 0xff0000, col: 0, row: 0, userId: "smoke-1", roomId: "ocean", tzOffsetMinutes: -120 }));
s.on("tasks:state", (p) => { console.log("state", p.tasks.length, p.energy); if (!p.tasks.length) s.emit("task:add", { userId: "smoke-1", text: "Pompes", kind: "habit", difficulty: "hard", category: null, down: true }); });
s.on("task:added", (t) => { console.log("added", t.kind, t.difficulty); s.emit("task:score", { userId: "smoke-1", taskId: t.id, direction: "up" }); });
s.on("task:scored", (p) => { console.log("scored", p.task.value, p.coins, p.xp, p.energy, p.bossDamage); process.exit(0); });
```

Expected: `added habit hard`, puis `scored 2 20 30 50 10`.

- [ ] **Step 5 : Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): task:score with delta rewards, energy gauge and day rollover

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 5 : Client — état `tasks.ts` et `progress.ts`

**Files:**
- Modify: `app/src/tasks.ts`, `app/tests/tasks.test.ts`
- Modify: `app/src/progress.ts`, `app/tests/progress.test.ts`
- Modify: `app/src/landing.ts:175`

**Interfaces:**
- Consumes: `Task`, `TaskKind` de `@shared/types` ; `isDue`, `tint` de `../../server/src/scoring.ts` (import **relatif** : `node --test` ne connaît pas l'alias `@shared`, vérifié — `import('../server/src/x.ts')` se résout, `@shared/x` non).
- Produces:
  ```ts
  export interface TasksState { list: Task[]; tab: TaskKind; filter: 'remaining' | 'all' }
  export function createTasks(): TasksState
  export function setTasks(s, tasks), taskAdded(s, task), taskScored(s, task): Task|null, taskUpdated(s, task): Task|null, taskDeleted(s, id)
  export function visible(s, today: Date): Task[]
  export function pending(s): Task[]
  export function remaining(s, today: Date): number
  export const DIFFICULTIES: {id: Difficulty; label: string; pips: number}[]
  export const DAY_LABELS = ['L','M','M','J','V','S','D']
  export function toggleDay(mask: number, index: number): number
  export function newTaskPayload(kind, text, opts): { … }   // ce que le formulaire envoie
  // progress.ts
  Progress += { energy: number; exhausted: boolean }; setEnergy(p, energy), setExhausted(p, flag)
  ```

- [ ] **Step 1 : Tests `tasks.test.ts`**

Remplacer `app/tests/tasks.test.ts` par :

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTasks,setTasks,taskAdded,taskScored,taskUpdated,taskDeleted,visible,pending,remaining,cleanText,categoryId,toggleDay,newTaskPayload,DIFFICULTIES} from '../src/tasks.ts';
import type {Task} from '@shared/types';

const t=(id:string,extra:Partial<Task>={}):Task=>({id,userId:'u',text:'Tâche '+id,note:'',kind:'todo',difficulty:'easy',value:0,category:null,createdAt:Number(id.replace(/\D/g,''))||1,done:false,up:true,down:false,countUp:0,countDown:0,days:127,streak:0,dueAt:null,checklist:[],completedAt:null,...extra});
const WED=new Date(2026,8,23);// mercredi

test('server state replaces the list; pending keeps open todos, unticked dailies and every habit',()=>{
 const s=createTasks();setTasks(s,[t('a1'),t('b2',{done:true}),t('c3',{kind:'daily',done:true}),t('d4',{kind:'daily'}),t('e5',{kind:'habit'})]);
 assert.deepEqual(pending(s).map(x=>x.id).sort(),['a1','d4','e5']);
});
test('visible follows the tab and the filter, due dailies first',()=>{
 const s=createTasks();setTasks(s,[t('a1'),t('b2',{done:true}),t('c3',{kind:'daily',days:1}),t('d4',{kind:'daily',days:4}),t('e5',{kind:'daily',days:4,done:true}),t('f6',{kind:'habit'})]);
 s.tab='todo';s.filter='remaining';assert.deepEqual(visible(s,WED).map(x=>x.id),['a1']);
 s.filter='all';assert.deepEqual(visible(s,WED).map(x=>x.id),['b2','a1']);
 s.tab='daily';s.filter='remaining';assert.deepEqual(visible(s,WED).map(x=>x.id),['d4','c3']);// due today first, then not due; ticked hidden
 s.filter='all';assert.deepEqual(visible(s,WED).map(x=>x.id),['e5','d4','c3']);
 s.tab='habit';s.filter='remaining';assert.deepEqual(visible(s,WED).map(x=>x.id),['f6']);
});
test('remaining counts due unticked dailies and open todos',()=>{
 const s=createTasks();setTasks(s,[t('a1'),t('b2',{done:true}),t('c3',{kind:'daily',days:1}),t('d4',{kind:'daily',days:4}),t('f6',{kind:'habit'})]);
 assert.equal(remaining(s,WED),2);
});
test('scored and updated tasks replace the stored one',()=>{
 const s=createTasks();setTasks(s,[t('a1')]);
 assert.equal(taskScored(s,t('a1',{done:true,value:1}))?.done,true);assert.equal(s.list[0].value,1);
 assert.equal(taskUpdated(s,t('a1',{text:'X'}))?.text,'X');assert.equal(taskScored(s,t('zz')),null);
 taskAdded(s,t('b2'));taskAdded(s,t('b2'));assert.equal(s.list.length,2);assert.ok(taskDeleted(s,'b2'));
});
test('day toggles flip one bit and never empty the mask',()=>{
 assert.equal(toggleDay(127,0),126);assert.equal(toggleDay(1,0),1);assert.equal(toggleDay(0,3),8);
});
test('the add payload only carries the fields of its kind',()=>{
 assert.deepEqual(newTaskPayload('habit','Eau',{difficulty:'easy',category:null,up:true,down:true,days:5,checklist:[{text:'x',done:false}]}),{text:'Eau',kind:'habit',difficulty:'easy',category:null,up:true,down:true});
 assert.deepEqual(newTaskPayload('daily','Sport',{difficulty:'hard',category:'perso',days:5}),{text:'Sport',kind:'daily',difficulty:'hard',category:'perso',days:5});
 assert.deepEqual(newTaskPayload('todo','Projet',{difficulty:'medium',category:null,dueAt:9,checklist:[{text:'x',done:false}]}),{text:'Projet',kind:'todo',difficulty:'medium',category:null,dueAt:9,checklist:[{text:'x',done:false}]});
 assert.equal(DIFFICULTIES.length,4);
});
test('text is trimmed, collapsed and capped; categories are validated',()=>{
 assert.equal(cleanText('  a   b '),'a b');assert.equal(cleanText('x'.repeat(200)).length,120);assert.equal(categoryId('work'),'work');assert.equal(categoryId('nope'),null);
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd app && npm test`
Expected: FAIL — `taskScored`/`visible` non exportés.

- [ ] **Step 3 : Réécrire `app/src/tasks.ts`**

```ts
// Task state fed by the server. Validation helpers run before an emit; everything else applies what the server said.
import type {Task,TaskKind,Difficulty,ChecklistItem} from '@shared/types';
import {isDue} from '../../server/src/scoring.ts';// relative on purpose: `node --test` has no `@shared` alias at runtime, Vite and tsc both accept it
export const CATEGORIES=[
  {id:'work',label:'Boulot',color:'#b85530'},
  {id:'perso',label:'Perso',color:'#7a8e4a'},
  {id:'urgent',label:'Urgent',color:'#a04050'},
  {id:'study',label:'Étude',color:'#8aa6b8'},
];
export const DIFFICULTIES:{id:Difficulty;label:string;pips:number}[]=[{id:'trivial',label:'Banal',pips:1},{id:'easy',label:'Facile',pips:2},{id:'medium',label:'Moyen',pips:3},{id:'hard',label:'Difficile',pips:4}];
export const KIND_LABELS:Record<TaskKind,{one:string;many:string;placeholder:string}>={habit:{one:'habitude',many:'Habitudes',placeholder:'Une habitude à tenir…'},daily:{one:'quotidienne',many:'Quotidiennes',placeholder:'Une chose à faire chaque jour…'},todo:{one:'à-faire',many:'À faire',placeholder:'Une chose à faire…'}};
export const DAY_LABELS=['L','M','M','J','V','S','D'];
const MAX_TEXT=120;
export interface TasksState{list:Task[];tab:TaskKind;filter:'remaining'|'all'}
export function createTasks():TasksState{return {list:[],tab:'todo',filter:'remaining'};}
export const cleanText=(raw:unknown):string=>String(raw??'').replace(/\s+/g,' ').trim().slice(0,MAX_TEXT);
export const categoryId=(id:unknown):string|null=>CATEGORIES.some(c=>c.id===id)?id as string:null;
export function setTasks(s:TasksState,tasks:Task[]):void{s.list=[...tasks].sort((a,b)=>b.createdAt-a.createdAt);}
export function taskAdded(s:TasksState,task:Task):void{if(!s.list.some(t=>t.id===task.id))s.list.unshift(task);}
function replace(s:TasksState,task:Task):Task|null{const i=s.list.findIndex(t=>t.id===task.id);if(i<0)return null;s.list[i]=task;return task;}
export const taskScored=(s:TasksState,task:Task):Task|null=>replace(s,task);
export const taskUpdated=(s:TasksState,task:Task):Task|null=>replace(s,task);
export function taskDeleted(s:TasksState,id:string):boolean{const i=s.list.findIndex(t=>t.id===id);if(i<0)return false;s.list.splice(i,1);return true;}
// What the other players see on the slates: open todos, unticked dailies, every habit.
export const pending=(s:TasksState):Task[]=>s.list.filter(t=>t.kind==='habit'||!t.done);
// The current tab, filtered; dailies due today come first so the morning list reads top-down.
export function visible(s:TasksState,today:Date):Task[]{
  const list=s.list.filter(t=>t.kind===s.tab&&(s.filter==='all'||t.kind==='habit'||!t.done));
  if(s.tab==='daily')list.sort((a,b)=>Number(isDue(b,today))-Number(isDue(a,today))||b.createdAt-a.createdAt);
  return list;
}
export const remaining=(s:TasksState,today:Date):number=>s.list.filter(t=>!t.done&&(t.kind==='todo'||(t.kind==='daily'&&isDue(t,today)))).length;
export function toggleDay(mask:number,index:number):number{const next=mask^(1<<index);return next===0?mask:next;}
export const cleanChecklistItem=(raw:unknown):string=>String(raw??'').replace(/\s+/g,' ').trim().slice(0,80);
export interface NewTaskOpts{difficulty:Difficulty;category:string|null;up?:boolean;down?:boolean;days?:number;dueAt?:number|null;checklist?:ChecklistItem[]}
export function newTaskPayload(kind:TaskKind,text:string,o:NewTaskOpts){
  const base={text,kind,difficulty:o.difficulty,category:o.category};
  if(kind==='habit')return {...base,up:o.up!==false,down:!!o.down};
  if(kind==='daily')return {...base,days:o.days??127};
  return {...base,dueAt:o.dueAt??null,checklist:o.checklist??[]};
}
```

- [ ] **Step 4 : `progress.ts`**

Dans `app/src/progress.ts` : `Progress` gagne `energy:number;exhausted:boolean`, `createProgress` renvoie `energy:50,exhausted:false`, et ajouter :

```ts
export function setEnergy(p:Progress,energy:number):void{p.energy=Math.max(0,Math.min(50,Math.round(energy)));}
export function setExhausted(p:Progress,flag:boolean):void{p.exhausted=flag;}
```

Dans `app/tests/progress.test.ts`, ajouter à l'import `setEnergy,setExhausted` et le test :

```ts
test('energy is clamped to 0..50 and exhaustion is a flag',()=>{
 const p=createProgress();assert.equal(p.energy,50);setEnergy(p,70);assert.equal(p.energy,50);setEnergy(p,-3);assert.equal(p.energy,0);setEnergy(p,12.6);assert.equal(p.energy,13);setExhausted(p,true);assert.equal(p.exhausted,true);
});
```

- [ ] **Step 5 : `landing.ts:175`**

Remplacer l'objet note par le nouveau `Task` plat :

```ts
  notes.unshift({id:crypto.randomUUID?.()??String(Date.now()),userId:'landing',text,note:'',kind:'todo',difficulty:'easy',value:0,done:false,createdAt:Date.now(),category:null,up:true,down:false,countUp:0,countDown:0,days:127,streak:0,dueAt:null,checklist:[],completedAt:null});input.value='';renderNotes();};
```

- [ ] **Step 6 : Tests**

Run: `cd app && npm test`
Expected: `tasks`, `progress` PASS. `npm run typecheck` échoue encore sur `main.ts`/`scene.ts` (Task 6-8) — c'est attendu ; ne pas committer un typecheck rouge sans le dire dans le message.

- [ ] **Step 7 : Commit**

```bash
git add app/src/tasks.ts app/tests/tasks.test.ts app/src/progress.ts app/tests/progress.test.ts app/src/landing.ts
git commit -m "feat(app): task state with kinds, tabs, filters and energy (typecheck pending main.ts)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 6 : Client — panneau à onglets, formulaire, liste, checklist

**Files:**
- Modify: `app/src/main.ts` : markup du drawer (l. 88-104), `renderTasks` et handlers (l. 686-712), handoff landing (l. 581), `bindServerEvents` (l. 578-588), hover (l. 408)
- Modify: `app/src/style.css` (ajouts en fin de fichier)

**Interfaces:**
- Consumes: Task 5 (`visible`, `remaining`, `pending`, `newTaskPayload`, `toggleDay`, `DIFFICULTIES`, `DAY_LABELS`, `KIND_LABELS`), `tint` de `@shared/scoring`.
- Produces: `renderTasks()`, `openDrawer` inchangé ; événements client `task:add`, `task:score`, `task:update`.

- [ ] **Step 1 : Markup du drawer**

Remplacer les lignes 92-103 (`<section class="tasks-card">` … `</section>`) par :

```html
      <section class="tasks-card">
        <div class="task-tabs" id="task-tabs" role="tablist" aria-label="Type de tâche">${(['habit','daily','todo'] as const).map(k=>`<button type="button" role="tab" data-kind="${k}" aria-selected="${k==='todo'}">${KIND_LABELS[k].many}<span class="tab-count" data-count="${k}"></span></button>`).join('')}</div>
        <form id="task-form" class="task-form" autocomplete="off">
          <div class="task-row"><input id="task-text" maxlength="120" placeholder="Une chose à faire…" aria-label="Nouvelle tâche" /><button type="button" id="task-difficulty" class="pips" aria-label="Difficulté" title="Facile"><i></i><i></i><i></i><i></i></button><button type="submit" class="icon-button add-task" aria-label="Ajouter la tâche">${icon('plus')}</button></div>
          <div class="task-options">
            <div class="chips" id="task-cats" role="group" aria-label="Catégorie">${CATEGORIES.map(c=>`<button type="button" data-cat="${c.id}" style="--cat:${c.color}" aria-pressed="false">${c.label}</button>`).join('')}</div>
            <div class="days" id="task-days" role="group" aria-label="Jours" hidden>${DAY_LABELS.map((d,i)=>`<button type="button" data-day="${i}" aria-pressed="true">${d}</button>`).join('')}</div>
            <div class="chips" id="task-dirs" role="group" aria-label="Sens" hidden><button type="button" data-dir="up" aria-pressed="true">${icon('plus')} Bonne</button><button type="button" data-dir="down" aria-pressed="false">${icon('minus')} Mauvaise</button></div>
            <label class="due-field" id="task-due-field" hidden>${icon('calendar')}<input type="date" id="task-due" aria-label="Date butoir" /></label>
          </div>
        </form>
        <ul id="task-list" class="task-list"></ul>
        <p id="tasks-empty" class="tasks-empty">Rien pour l’instant. Une seule chose suffit pour commencer.</p>
        <div class="task-filter" id="task-filter"><button type="button" data-filter="remaining" aria-pressed="true">Restantes</button><button type="button" data-filter="all" aria-pressed="false">Toutes</button></div>
      </section>
```

Ajouter `KIND_LABELS,DAY_LABELS,DIFFICULTIES,visible,remaining,toggleDay,newTaskPayload,taskScored,cleanChecklistItem` à l'import de `./tasks.ts` (l. 16) et `import {tint,isDue} from '../../server/src/scoring.ts';` (relatif, comme dans `tasks.ts`). Retirer `taskToggled` de l'import. Icônes : `Minus`, `Flame`, `ChevronDown`, `Coffee` sont déjà importées de `lucide` (l. 2) et présentes dans `const icons` (l. 24) ; **ajouter `Calendar` aux deux** (l'import et l'objet `icons`), sinon `icon('calendar')` rend un `<i>` vide.

- [ ] **Step 2 : État du formulaire et `renderTasks`**

Remplacer le bloc l. 686-712 (`let newCategory` … `renderTasks();`) par :

```ts
let newCategory: string|null=null,newDifficulty=1,newDays=127,newUp=true,newDown=false;
const catOf=(id: string|null)=>CATEGORIES.find(c=>c.id===id);
const esc=(v: string)=>v.replace(/[&<>]/g,(c: string)=>({'&':'&amp;','<':'&lt;','>':'&gt;'} as Record<string,string>)[c]);
const pips=(n: number)=>`<span class="pips" aria-hidden="true">${[1,2,3,4].map(i=>`<i class="${i<=n?'on':''}"></i>`).join('')}</span>`;
const dueLabel=(ts: number)=>new Date(ts).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});
function syncScene(){cafe?.setTasks(pending(tasks));}
function renderTaskForm(){
  const k=tasks.tab;($('#task-text') as HTMLInputElement).placeholder=KIND_LABELS[k].placeholder;
  $('#task-days').hidden=k!=='daily';$('#task-dirs').hidden=k!=='habit';$('#task-due-field').hidden=k!=='todo';$('#task-filter').hidden=k==='habit';
  document.querySelectorAll('#task-days button').forEach((b: any)=>b.setAttribute('aria-pressed',String(!!(newDays&(1<<Number(b.dataset.day))))));
  document.querySelectorAll('#task-dirs button').forEach((b: any)=>b.setAttribute('aria-pressed',String(b.dataset.dir==='up'?newUp:newDown)));
  const d=DIFFICULTIES[newDifficulty];$('#task-difficulty').title=d.label;$('#task-difficulty').innerHTML=pips(d.pips);
  document.querySelectorAll('#task-tabs [role=tab]').forEach((b: any)=>b.setAttribute('aria-selected',String(b.dataset.kind===k)));
  document.querySelectorAll('#task-filter button').forEach((b: any)=>b.setAttribute('aria-pressed',String(b.dataset.filter===tasks.filter)));
}
function renderTasks(){
  const list=$('#task-list'),today=new Date();list.innerHTML='';
  for(const t of visible(tasks,today)){
    const li=document.createElement('li');li.dataset.id=t.id;const cat=catOf(t.category),d=DIFFICULTIES.find(x=>x.id===t.difficulty)!;
    li.className=`kind-${t.kind} tint-${tint(t.value)}${t.done?' done':''}${t.kind==='daily'&&!isDue(t,today)?' not-due':''}`;
    const text=`<span class="task-text" contenteditable="plaintext-only" spellcheck="false">${esc(t.text)}</span>`;
    const common=`<button class="cat-dot" style="--cat:${cat?cat.color:'#d8d3c3'}" title="Catégorie : ${cat?cat.label:'aucune'} (cliquer pour changer)" aria-label="Changer la catégorie"></button><button class="pips diff" title="Difficulté : ${d.label} (cliquer pour changer)" aria-label="Changer la difficulté">${pips(d.pips)}</button>`;
    if(t.kind==='habit')li.innerHTML=`${t.down?`<button class="score-button down" data-dir="down" aria-label="Mauvaise : ${esc(t.text)}">${icon('minus')}</button>`:'<span class="score-spacer"></span>'}${text}${common}<small class="counts" title="Aujourd’hui">${t.countUp}${t.down?` · ${t.countDown}`:''}</small>${t.up?`<button class="score-button up" data-dir="up" aria-label="Bonne : ${esc(t.text)}">${icon('plus')}</button>`:'<span class="score-spacer"></span>'}<button class="icon-button remove-task" aria-label="Supprimer">${icon('x')}</button>`;
    else if(t.kind==='daily')li.innerHTML=`<button class="check-button${t.done?' done':''}" data-dir="${t.done?'down':'up'}" aria-label="${t.done?'Reprendre':'Terminer'} : ${esc(t.text)}" aria-pressed="${t.done}">${icon('check')}</button>${text}${common}${t.streak>1?`<small class="streak-count" title="Série">${icon('flame')}${t.streak}</small>`:''}<small class="days-mini" aria-label="Jours">${DAY_LABELS.map((l,i)=>`<b class="${t.days&(1<<i)?'on':''}">${l}</b>`).join('')}</small><button class="icon-button remove-task" aria-label="Supprimer">${icon('x')}</button>`;
    else{const n=t.checklist.length,k=t.checklist.filter(i=>i.done).length;
      li.innerHTML=`<button class="check-button${t.done?' done':''}" data-dir="${t.done?'down':'up'}" aria-label="${t.done?'Reprendre':'Terminer'} : ${esc(t.text)}" aria-pressed="${t.done}">${icon('check')}</button>${text}${common}${t.dueAt?`<small class="due" title="Date butoir">${icon('calendar')}${dueLabel(t.dueAt)}</small>`:''}<button class="icon-button toggle-list" aria-expanded="false" aria-label="Étapes" title="Étapes">${icon('chevron-down')}${n?`<b>${k}/${n}</b>`:''}</button><button class="icon-button remove-task" aria-label="Supprimer">${icon('x')}</button>
      <ul class="checklist" hidden>${t.checklist.map((i,idx)=>`<li data-idx="${idx}"><button class="check-button mini${i.done?' done':''}" aria-pressed="${i.done}">${icon('check')}</button><span>${esc(i.text)}</span><button class="icon-button remove-item" aria-label="Retirer">${icon('x')}</button></li>`).join('')}<li class="add-item"><input placeholder="Une étape…" maxlength="80" aria-label="Nouvelle étape" /></li></ul>`;}
    list.append(li);
  }
  $('#tasks-empty').hidden=visible(tasks,today).length>0;const left=remaining(tasks,today);$('#tasks-count').textContent=left?`${left} à faire`:tasks.list.length?'Tout est fait':'';
  for(const k of ['habit','daily','todo'] as const){const n=k==='habit'?tasks.list.filter(t=>t.kind==='habit').length:tasks.list.filter(t=>t.kind===k&&!t.done&&(k==='todo'||isDue(t,today))).length;($(`[data-count=${k}]`) as HTMLElement).textContent=n?String(n):'';}
  document.querySelectorAll('#task-cats button').forEach((b: any)=>b.setAttribute('aria-pressed',String(b.dataset.cat===newCategory)));
  renderTaskForm();drawIcons();
}
const emitUpdate=(id: string,patch: any)=>net.socket.emit('task:update',{userId:identity.userId,taskId:id,patch});
$('#task-tabs').onclick=(e: any)=>{const b=e.target.closest('[data-kind]');if(!b)return;tasks.tab=b.dataset.kind;renderTasks();$('#task-text').focus();};
$('#task-filter').onclick=(e: any)=>{const b=e.target.closest('[data-filter]');if(!b)return;tasks.filter=b.dataset.filter;renderTasks();};
$('#task-cats').onclick=(e: any)=>{const b=e.target.closest('[data-cat]');if(!b)return;newCategory=newCategory===b.dataset.cat?null:b.dataset.cat;renderTasks();$('#task-text').focus();};
$('#task-days').onclick=(e: any)=>{const b=e.target.closest('[data-day]');if(!b)return;newDays=toggleDay(newDays,Number(b.dataset.day));renderTaskForm();};
$('#task-dirs').onclick=(e: any)=>{const b=e.target.closest('[data-dir]');if(!b)return;if(b.dataset.dir==='up')newUp=!newUp;else newDown=!newDown;if(!newUp&&!newDown)newUp=true;renderTaskForm();};
$('#task-difficulty').onclick=()=>{newDifficulty=(newDifficulty+1)%DIFFICULTIES.length;renderTaskForm();};
$('#task-form').onsubmit=(e: any)=>{e.preventDefault();const text=cleanText(($('#task-text') as HTMLInputElement).value);if(!text)return;
  const due=($('#task-due') as HTMLInputElement).value;const dueAt=due?new Date(due+'T12:00:00').getTime():null;
  net.socket.emit('task:add',{userId:identity.userId,...newTaskPayload(tasks.tab,text,{difficulty:DIFFICULTIES[newDifficulty].id,category:newCategory,up:newUp,down:newDown,days:newDays,dueAt})});($('#task-text') as HTMLInputElement).value='';($('#task-due') as HTMLInputElement).value='';};
$('#task-list').addEventListener('click',(e: Event)=>{
  const target=e.target as HTMLElement,li=target.closest('li[data-id]') as HTMLElement|null;if(!li)return;const id=li.dataset.id!;const t=tasks.list.find(t=>t.id===id);if(!t)return;
  const scoreBtn=target.closest('[data-dir]') as HTMLElement|null;
  if(scoreBtn&&!target.closest('.checklist')){scoreBtn.setAttribute('disabled','');net.socket.emit('task:score',{userId:identity.userId,taskId:id,direction:scoreBtn.dataset.dir as 'up'|'down'});}
  else if(target.closest('.cat-dot')){const i=CATEGORIES.findIndex(c=>c.id===t.category);emitUpdate(id,{category:i+1<CATEGORIES.length?CATEGORIES[i+1].id:null});}
  else if(target.closest('.diff')){const i=DIFFICULTIES.findIndex(d=>d.id===t.difficulty);emitUpdate(id,{difficulty:DIFFICULTIES[(i+1)%DIFFICULTIES.length].id});}
  else if(target.closest('.toggle-list')){const ul=li.querySelector('.checklist') as HTMLElement,b=li.querySelector('.toggle-list')!;ul.hidden=!ul.hidden;b.setAttribute('aria-expanded',String(!ul.hidden));li.classList.toggle('open',!ul.hidden);}
  else if(target.closest('.checklist .check-button')){const idx=Number((target.closest('[data-idx]') as HTMLElement).dataset.idx);emitUpdate(id,{checklist:t.checklist.map((i,j)=>j===idx?{...i,done:!i.done}:i)});}
  else if(target.closest('.remove-item')){const idx=Number((target.closest('[data-idx]') as HTMLElement).dataset.idx);emitUpdate(id,{checklist:t.checklist.filter((_,j)=>j!==idx)});}
  else if(target.closest('.remove-task'))net.socket.emit('task:delete',{userId:identity.userId,taskId:id});
});
$('#task-list').addEventListener('keydown',(e: any)=>{
  if(e.target.matches('.task-text')&&e.key==='Enter'){e.preventDefault();e.target.blur();}
  if(e.target.matches('.add-item input')&&e.key==='Enter'){e.preventDefault();const li=e.target.closest('li[data-id]'),t=tasks.list.find(t=>t.id===li.dataset.id);const text=cleanChecklistItem(e.target.value);if(!t||!text)return;emitUpdate(t.id,{checklist:[...t.checklist,{text,done:false}]});e.target.value='';li.dataset.keepOpen='1';}
});
$('#task-list').addEventListener('focusout',(e: Event)=>{const el=e.target as HTMLElement;if(!el.matches('.task-text'))return;const id=(el.closest('li[data-id]') as HTMLElement).dataset.id!;const t=tasks.list.find(t=>t.id===id);const text=cleanText(el.textContent);
  if(!t||!text){if(t)el.textContent=t.text;return;}if(text!==t.text)emitUpdate(id,{text});});
renderTasks();
```

Pour que la checklist reste dépliée après un `task:updated`, dans `renderTasks` juste avant `list.innerHTML=''`, mémoriser `const open=new Set([...list.querySelectorAll('li.open')].map((l: any)=>l.dataset.id));` et, après la boucle, pour chaque `li` dont l'id est dans `open` : `li.classList.add('open');(li.querySelector('.checklist') as HTMLElement).hidden=false;li.querySelector('.toggle-list')!.setAttribute('aria-expanded','true');`.

- [ ] **Step 3 : Événements serveur et handoff**

Dans `bindServerEvents` (l. 578-588) :
- `tasks:state` : `({tasks:list,coins,energy})=>{setTasks(tasks,list);setCoins(progress,coins);setEnergy(progress,energy);…}` (importer `setEnergy` depuis `./progress.ts`).
- Handoff (l. 581) : `s.emit('task:add',{userId:identity.userId,text,category:null,kind:'todo',difficulty:'easy'})`.
- Remplacer la ligne `task:toggled` par :
  ```ts
  s.on('task:scored',({task:t,coins,energy,xp,level,xpToNext,levelUp,bossDamage})=>{const before=progress.coins,beforeLevel=progress.level;taskScored(tasks,t);setCoins(progress,coins);setXp(progress,{xp,level,xpToNext});setEnergy(progress,energy);renderTasks();renderProgress();renderShop();syncScene();
    const dc=coins-before;if(dc>0||xp>0){const parts=[];if(dc>0)parts.push(`+${dc} pièces`);if(bossDamage>0&&guild)parts.push(`${bossDamage} dégâts au boss`);toast(`${t.kind==='daily'?'Fait pour aujourd’hui.':t.kind==='habit'?'Bien joué.':'C’est fait.'} ${parts.join(' · ')}`);}
    else if(t.kind==='habit')toast('Noté. Demain sera mieux.');
    if(levelUp&&level>beforeLevel){cafe?.float('',`Niveau ${level}`,'#647557');later(()=>toast(`✨ Niveau ${level} ! Énergie rechargée.`),2600);}});
  ```
  (`guild` : la variable d'état de guilde déjà présente dans `main.ts` ; si elle porte un autre nom, l'utiliser. Le toast de `xp:update` existant reste pour le pomodoro ; comme `task:scored` gère lui-même le level-up, l'XP est appliquée ici sans passer par `xp:update` pour éviter un double toast — le serveur émet toutefois `xp:update` via `emitXpUpdate` : dans le handler `xp:update`, ignorer le toast si `u.level===progress.level` déjà à jour, c'est-à-dire tester `u.level>before` comme aujourd'hui, ce qui sera faux puisque `task:scored` a déjà mis le niveau.)

  Ordre des émissions serveur : `emitXpUpdate` part **avant** `task:scored` (Task 4). Donc `xp:update` arrive d'abord avec `levelUp: true` et déclenche le toast existant ; puis `task:scored` arrive avec `level === progress.level` et ne re-toaste pas. Simplifier alors la dernière ligne du handler `task:scored` : ne rien faire pour le level-up, et enrichir le toast existant de `xp:update` en « ✨ Niveau N ! Énergie rechargée. ».
- `task:updated` : `s.on('task:updated',t=>{taskUpdated(tasks,t);renderTasks();syncScene();});`

Hover (l. 408) : remplacer `${t.type==='daily'?' · chaque jour':''}` par `${t.kind==='daily'?' · chaque jour':t.kind==='habit'?' · habitude':''}`.

- [ ] **Step 4 : CSS**

Ajouter en fin de `app/src/style.css` :

```css
/* Tâches : onglets, difficulté, teintes, habitudes, jours, checklist */
:root{--tint-0:#e4eedb;--tint-1:#eef2e4;--tint-2:transparent;--tint-3:#f3ebdc;--tint-4:#efdcd2}
.task-tabs{display:flex;gap:2px;background:#f0f1e9;padding:3px;border-radius:9px;margin-top:10px}.task-tabs button{flex:1;padding:7px 4px;border-radius:7px;background:transparent;font-size:13px;color:#949a87;display:flex;align-items:center;justify-content:center;gap:5px}.task-tabs button[aria-selected=true]{background:#fffefa;color:#627452;box-shadow:0 1px 5px #3e4e3410;font-weight:600}.tab-count:not(:empty){font-size:11px;background:#e8eedf;color:#5b6b4e;border-radius:9px;padding:0 5px;line-height:16px}
.task-row{display:flex;align-items:center;gap:6px}.task-row #task-text{flex:1}
.pips{display:inline-flex;gap:2px;align-items:center;padding:6px;border-radius:7px;background:transparent}.pips i{width:5px;height:9px;border-radius:2px;background:#dfe3d3}.pips i.on{background:#8f9b79}.pips.diff{padding:2px}.task-list li:hover .pips i.on{background:#657757}
.days{display:flex;gap:3px}.days button{width:24px;height:24px;border-radius:50%;background:#f0f1e9;color:#a0a595;font-size:11px;font-weight:600}.days button[aria-pressed=true]{background:#657757;color:#fffdf2}
.due-field{display:flex;align-items:center;gap:4px;font-size:13px;color:#8d9482}.due-field svg{width:12px;height:12px}.due-field input{border:1px solid #e3e6d8;border-radius:6px;padding:3px 6px;font-size:12px;color:#55624a;background:#fbfbf5}
.task-list li{background:var(--tint,transparent)}.task-list li.tint-0{--tint:var(--tint-0)}.task-list li.tint-1{--tint:var(--tint-1)}.task-list li.tint-3{--tint:var(--tint-3)}.task-list li.tint-4{--tint:var(--tint-4)}.task-list li:hover{filter:brightness(.98)}
.task-list li.not-due{opacity:.55}
.score-button{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;flex-shrink:0;padding:0}.score-button svg{width:13px;height:13px}.score-button.up{background:#e8eedf;color:#5b6b4e}.score-button.down{background:#f3e3dc;color:#a04050}.score-button:disabled{opacity:.4}.score-spacer{width:24px;flex-shrink:0}.counts{font-size:11px;color:#a0a595;font-variant-numeric:tabular-nums}
.streak-count{display:inline-flex;align-items:center;gap:2px;font-size:12px;color:#c9764f}.streak-count svg{width:11px;height:11px}.days-mini{display:inline-flex;gap:1px}.days-mini b{font-weight:600;font-size:9px;color:#d2d6c6}.days-mini b.on{color:#8f9b79}
.due{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:#a98a3e}.due svg{width:11px;height:11px}
.toggle-list{width:auto;padding:0 4px;gap:2px}.toggle-list b{font-size:11px;font-weight:600;color:#8d9482}li.open .toggle-list svg{transform:rotate(180deg)}
.task-list li.kind-todo{flex-wrap:wrap}.checklist{list-style:none;margin:4px 0 0;padding:0 0 0 25px;width:100%;display:flex;flex-direction:column;gap:2px}.checklist li{display:flex;align-items:center;gap:6px;font-size:13px;color:#66735b;padding:2px 0}.checklist li span{flex:1}.checklist .check-button.done+span{text-decoration:line-through;color:#adb2a3}.check-button.mini{width:14px;height:14px}.check-button.mini svg{width:10px;height:10px}.checklist .add-item input{width:100%;border:0;border-bottom:1px dashed #dfe3d3;background:transparent;font-size:13px;padding:3px 0;color:#55624a}.remove-item{width:18px;height:18px;opacity:0}.checklist li:hover .remove-item{opacity:1}
.task-filter{display:flex;gap:10px;justify-content:flex-end;margin-top:8px}.task-filter button{background:transparent;font-size:12px;color:#a0a595;padding:2px 0}.task-filter button[aria-pressed=true]{color:#627452;font-weight:600;text-decoration:underline;text-underline-offset:3px}
.check-button:disabled{opacity:.5}
```

- [ ] **Step 5 : Typecheck et vérification manuelle**

Run: `cd app && npm run typecheck`
Expected: erreurs seulement dans `scene.ts` (`task.type`) — corrigé en Task 8. Si `main.ts` a d'autres erreurs, les résoudre.

Puis serveur + Vite lancés, ouvrir `http://127.0.0.1:5173/app/` et vérifier :
- les trois onglets, le formulaire qui change d'options selon l'onglet ;
- ajouter une habitude avec « Mauvaise », cliquer « − » → toast « Noté… », compteur `0 · 1` ;
- ajouter une quotidienne lu-ve, cocher → toast « Fait pour aujourd'hui. +10 pièces » ; décocher → pièces rendues ;
- ajouter un à-faire, déplier, ajouter deux étapes, cocher une, valider → `+12 pièces` (delta 1,25) ;
- cliquer la pastille de difficulté → cycle ; la teinte change après plusieurs coches sur une habitude (`tint-1` dès `value ≥ 2`).

- [ ] **Step 6 : Commit**

```bash
git add app/src/main.ts app/src/style.css
git commit -m "feat(app): task drawer with habit, daily and todo tabs, difficulty, checklist and tints

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 7 : Client — HUD énergie, récap du matin, épuisement

**Files:**
- Modify: `app/src/main.ts` : HUD (l. 49-50), dialog progression (l. 116-117), `renderProgress` (l. 517-524), `bindServerEvents`, `join` emit (chercher `net.socket.emit('join'` — deux occurrences, l. ~597 et l'appel initial)
- Modify: `app/src/style.css`

**Interfaces:**
- Consumes: `setEnergy`, `setExhausted` (Task 5) ; événements `day:rollover`, `energy:update`, `energy:exhausted` (Task 3-4).
- Produces: `renderProgress()` affiche l'énergie ; `cafe?.setEnergy(energy, exhausted)` appelé (implémenté en Task 8 — jusque-là, garder l'appel derrière `cafe?.setEnergy?.(…)`).

- [ ] **Step 1 : Markup**

Dans le chip de progression (l. 49-50), après la ligne `.xp-bar`, ajouter :

```html
            <span class="energy-bar" role="progressbar" aria-label="Énergie" aria-valuemin="0" aria-valuemax="50" aria-valuenow="50" title="Énergie"><span id="energy-fill"></span></span>
```

Dans le dialog progression, après la ligne `xp-label` (l. 117) :

```html
    <div class="energy-row"><span class="energy-icon">${icon('coffee')}</span><span>Énergie</span><div class="energy-bar big" aria-hidden="true"><span id="energy-fill-big"></span></div><span class="energy-label" id="energy-label">50 / 50</span></div>
```

- [ ] **Step 2 : `renderProgress`**

Ajouter à la fin de `renderProgress()` :

```ts
  const ep=Math.round(progress.energy/50*100);$('#energy-fill').style.width=`${ep}%`;$('#energy-fill-big').style.width=`${ep}%`;$('.energy-bar').setAttribute('aria-valuenow',String(progress.energy));$('#energy-label').textContent=`${progress.energy} / 50`;
  document.body.classList.toggle('low-energy',progress.energy<25);document.body.classList.toggle('exhausted',progress.exhausted);
```

- [ ] **Step 3 : Événements**

Dans `bindServerEvents`, ajouter :

```ts
  s.on('energy:update',({energy})=>{setEnergy(progress,energy);renderProgress();cafe?.setEnergy?.(progress.energy,progress.exhausted);});
  s.on('energy:exhausted',({coins})=>{setExhausted(progress,true);setCoins(progress,coins);renderProgress();renderShop();cafe?.setEnergy?.(progress.energy,true);later(()=>toast('Épuisé… tu as perdu 30 % de tes pièces. Repose-toi, demain ça repart.'),0);});
  s.on('day:rollover',({missed,energy,energyDelta})=>{setEnergy(progress,energy);setExhausted(progress,false);renderProgress();cafe?.setEnergy?.(progress.energy,false);
    if(missed.length)later(()=>toast(`Hier : ${missed.length} quotidienne${missed.length>1?'s':''} oubliée${missed.length>1?'s':''}${energyDelta<0?`, ${energyDelta} énergie`:''}. ${missed.map(t=>t.text).slice(0,3).join(', ')}${missed.length>3?'…':''}`),0);});
```

Importer `setExhausted`. Dans `task:scored` (Task 6), après `setEnergy(progress,energy)`, ajouter `cafe?.setEnergy?.(progress.energy,progress.exhausted);`. Dans `tasks:state`, après `setEnergy`, idem.

Dans **chaque** `net.socket.emit('join',{…})` de `main.ts`, ajouter `tzOffsetMinutes:new Date().getTimezoneOffset()`.

Dans le handler `xp:update`, changer le texte du toast en `` `✨ Niveau ${u.level} ! Énergie rechargée.` ``.

- [ ] **Step 4 : CSS**

```css
.world .chip.progress .energy-bar{position:absolute;left:12px;right:12px;bottom:2px;height:2px;background:#eadfcf}.energy-bar span{display:block;height:100%;width:100%;background:linear-gradient(90deg,#d2a754,#b9853f);transition:width .6s ease}.energy-row{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:#8b947d}.energy-row .energy-icon svg{width:13px;height:13px;color:#b9853f}.energy-bar.big{flex:1;height:5px;border-radius:99px;background:#eadfcf;overflow:hidden}.energy-label{font-size:12px;color:#a7ad99;font-variant-numeric:tabular-nums}body.low-energy .energy-bar span{background:linear-gradient(90deg,#c9764f,#a04050)}
```

- [ ] **Step 5 : Vérification**

Run: `cd app && npm run typecheck` — erreurs restantes uniquement `scene.ts`.

Manuel : dans la console du navigateur, `net.socket.emit('debug:set-energy',{userId:<id>,energy:3})` (exposer `net` sur `window` en dev si besoin : `(window as any).net=net;`) → la jauge tombe, `body.low-energy`. Cliquer « − » sur une habitude « Difficile » (perte 6) → toast d'épuisement, pièces −30 %, jauge à 50. Reculer `lastDailyResetAt` en SQL (`UPDATE users SET lastDailyResetAt = 0 WHERE id = '<id>'`), recharger → toast « Hier : … ».

- [ ] **Step 6 : Commit**

```bash
git add app/src/main.ts app/src/style.css
git commit -m "feat(app): energy gauge in the HUD, morning recap and exhaustion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 8 : Scène — ardoises teintées, « ± », `setEnergy` et animations du personnage

**Files:**
- Modify: `app/src/scene.ts` : `ticket` (l. 366-393), `setTasks` (l. 394-398), `walker` (l. 416-455), tick (l. 786), export (l. 814)

**Interfaces:**
- Consumes: `tint` de `@shared/scoring` ; `Task`.
- Produces: `setEnergy(energy: number, exhausted: boolean): void` dans l'objet retourné par `createCafe`.

- [ ] **Step 1 : Fond teinté et « ± » sur le canvas**

Importer `import {tint} from '../../server/src/scoring.ts';` en haut de `scene.ts` (relatif, comme `tasks.ts`). Extraire le dessin du canvas de `ticket` dans une fonction `paintTicket(ctx, task)` :

```ts
  const TINTS=['#3a5040','#3d4a44','#3d4a44','#4a4238','#553a34'];// chalk board: kept → neglected
  function paintTicket(ctx: CanvasRenderingContext2D,task: any){
    ctx.clearRect(0,0,256,176);ctx.fillStyle=TINTS[tint(task.value??0)];ctx.fillRect(0,0,256,176);
    ctx.fillStyle='#ffffff10';for(let i=0;i<40;i++)ctx.fillRect(Math.random()*256,Math.random()*176,Math.random()*30,2);// chalk dust
    ctx.fillStyle='#f4eedd';ctx.font='500 27px "DM Sans", sans-serif';ctx.textBaseline='alphabetic';
    const words=task.text.split(' '),lines=[];let line='';// wrap on three lines, then an ellipsis
    for(const w of words){const t=line?line+' '+w:w;if(ctx.measureText(t).width>216&&line){lines.push(line);line=w;}else line=t;}
    if(line)lines.push(line);if(lines.length>3){lines.length=3;lines[2]=lines[2].slice(0,14)+'…';}
    const top=88-(lines.length-1)*17;lines.forEach((l,i)=>ctx.fillText(l,20,top+i*34));
    ctx.fillStyle='#f4eedd80';ctx.fillRect(20,top+lines.length*34-18,58,2);// a little chalk underline
    if(task.kind==='habit'){ctx.fillStyle='#f4eeddb0';ctx.font='600 30px "DM Sans", sans-serif';ctx.fillText('±',214,40);}// habits carry a chalk ± in the corner
  }
```

Dans `ticket(task)`, remplacer les lignes de dessin (de `ctx.fillStyle='#3d4a44'` jusqu'à l'underline) par `paintTicket(ctx,task);` et garder `canvas` dans `g.userData` (`g.userData={material,texture,canvas,ctx,card,sparks,seeds,task,phase:…}`). Remplacer `task.type==='daily'` par `task.kind==='daily'` pour la fève dorée.

- [ ] **Step 2 : Rafraîchir sans recréer**

Dans `setTasks`, remplacer `if(tickets.has(task.id))continue;` par :

```ts
      const g=tickets.get(task.id);
      if(g){const old=g.userData.task;if(old.text!==task.text||old.value!==task.value||old.category!==task.category){paintTicket(g.userData.ctx,task);g.userData.texture.needsUpdate=true;}g.userData.task=task;continue;}
```

(La couleur de l'étiquette de catégorie est un mesh : un changement de catégorie recrée l'ardoise — pour rester simple, si `old.category!==task.category`, faire `scene.remove(g)` + dispose comme dans la boucle de suppression, puis laisser la création normale reprendre. Écrire cette branche explicitement plutôt que de la fusionner avec le repaint.)

- [ ] **Step 3 : `setEnergy` et animations**

Après la création de `me` (l. 455), ajouter :

```ts
  let energy=50,exhausted=false,nextYawn=0,yawnUntil=0,idleSince=0;
  const BASE_SPEED=2.4;
  function setEnergy(e: number,ex: boolean){energy=e;exhausted=ex;me.speed=exhausted||energy<10?BASE_SPEED*.7:BASE_SPEED;
    const grey=exhausted?.55:1;player.g.traverse((o: any)=>{if(o.material?.color&&!o.userData.baseColor)o.userData.baseColor=o.material.color.clone();if(o.userData.baseColor)o.material.color.copy(o.userData.baseColor).multiplyScalar(grey).lerp(new THREE.Color('#9a9a94'),exhausted?.35:0);});
    if(exhausted&&!me.seated){const seat=nearestFreeSeat();if(seat)moveTo(seat,seat);}}
```

Pour que `me.speed` existe, dans `walker(p,speed,hooks)` remplacer l'usage de `speed` par `w.speed` et initialiser `w.speed=speed` dans l'objet `w`. `nearestFreeSeat()` s'appuie sur le tableau `seats` déjà présent dans `scene.ts` (rempli par `seat(...)` l. 56, lu par `seatNear` l. 470 et `seatAt` l. 721) :

```ts
  const nearestFreeSeat=()=>{const p=player.g.position;return seats.filter(s=>!s.taken).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]??null;};
```

Dans la boucle de rendu, près de la l. 786 (là où les ardoises flottent), ajouter l'oscillation de bâillement et l'assise automatique :

```ts
    if(!reducedMotion&&energy<25&&!me.seated&&!me.route.length){
      if(!idleSince)idleSince=time;
      if(time>nextYawn){yawnUntil=time+.6;nextYawn=time+20+Math.random()*20;}
      if(time<yawnUntil){const k=Math.sin((yawnUntil-time)/.6*Math.PI);player.head.rotation.x=-.35*k;player.armR.rotation.x=-2.2*k;}
      if(energy<10&&time-idleSince>8){const seat=nearestFreeSeat();if(seat){moveTo(seat,seat);idleSince=0;}}
    }else idleSince=0;
```

Vérifier que cette écriture de `head.rotation`/`armR.rotation` s'applique **après** le code d'idle du walker dans la même frame (sinon elle est écrasée) : la placer après l'appel `me.tick(dt)` (ou équivalent) dans la boucle.

Ajouter `setEnergy` à l'objet retourné (l. 814).

- [ ] **Step 4 : Typecheck + vérification visuelle**

Run: `cd app && npm run typecheck && npm test`
Expected: PASS complet (c'était la dernière source d'erreurs).

Manuel : `debug:set-energy` à 20 → le perso bâille au repos ; à 5 → il ralentit et s'assoit après 8 s ; un « − » sur une habitude difficile → épuisement : perso grisé, assis.
Ajouter une habitude → ardoise avec « ± » ; cocher 5 fois « + » → l'ardoise passe au vert (`tint 1` à partir de `value ≥ 2`).

- [ ] **Step 5 : Commit**

```bash
git add app/src/scene.ts
git commit -m "feat(app): tinted slates with a chalk ± for habits, energy-driven yawn and rest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 9 : Nettoyage, README, vérification finale

**Files:**
- Modify: `README.md` (section « Pièces » ou nouvelle section « Tâches »)
- Modify: `server/src/index.ts`, `server/src/types.ts` (références mortes)

- [ ] **Step 1 : Chasser les restes**

Run: `grep -rn "degradation\|task:toggle\|task:toggled\|room:clean\|type: \"task\"\|type==='daily'\|\.type===" server/src app/src --include=*.ts`
Expected: aucune ligne (hors `osc.type`, `renderer.shadowMap.type`). Supprimer ce qui reste.

- [ ] **Step 2 : README**

Ajouter après la section « Landing » :

```markdown
## Tâches

Trois types, comme Habitica : **habitudes** (boutons + / −, cochables plusieurs fois par jour, compteurs remis à zéro chaque matin), **quotidiennes** (jours de la semaine, série, ratée = perte d'énergie) et **à-faire** (une fois, date butoir facultative, checklist qui augmente la récompense). Chaque tâche a une difficulté (Banal / Facile / Moyen / Difficile) et une valeur cachée qui monte quand on la tient et baisse quand on la rate : elle teinte la ligne et l'ardoise dans la pièce, et module les gains (`delta = 0,9747^valeur × difficulté`, plafonné à 3 ; pièces = 10·delta, XP = 15·delta, dégâts au boss = 5·delta). Les règles sont dans `server/src/scoring.ts`, partagé avec le client.

L'**énergie** (0-50, jauge ☕ dans le HUD) remplace la dégradation : −3·delta par quotidienne ratée ou habitude « − » (immunité sous le niveau 3), +1 par tâche réussie, rechargée au level-up. À 0 : −30 % des pièces et un personnage épuisé jusqu'au lendemain. Le cron tourne à la première connexion du jour (`runRollover`, fuseau du client via `tzOffsetMinutes` dans `join`) et rejoue jusqu'à 30 jours manqués, perte plafonnée à 20.
```

Retirer les mentions de `degradation` / « nettoyer la room » du README s'il y en a (`grep -n -i "dégradation\|degradation\|room:clean" README.md`).

- [ ] **Step 3 : Suite complète**

Run: `cd app && npm test && npm run typecheck && npm run build && cd ../server && npm test && npx tsc --noEmit`
Expected: tout vert, build Vite OK.

- [ ] **Step 4 : Commit**

```bash
git add README.md server/src app/src
git commit -m "docs: describe the Habitica-style task system and energy gauge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Auto-revue (faite à l'écriture)

- **Couverture spec** : §2 modèle → T1, T3 ; §3 règles → T1-T2 ; §4 `task:score` → T4 ; §5 cron → T2, T4 ; §6 énergie → T4, T7, T8 ; §7 événements → T3-T4, T6-T7 ; §8.1-8.2 → T5 ; §8.3 → T6 ; §8.4 → T7 ; §8.5-8.6 → T8 ; §9 migration → T3, T5 (landing) ; §10 cas limites → T2 tests (jours manqués, plafond, > 30 j, `days = 0`, checklist tronquée), T6 (bouton désactivé au double clic) ; §11 tests → T1, T2, T5.
- **Hors plan, assumé** : l'achievement `streak-21` / `habit-100` / `second-souffle` de la spec §5.7 du bench n'est pas dans la spec de design finale → non implémenté.
- **Cohérence des noms** : `task:score` / `task:scored`, `runRollover`, `applyEnergy`, `setEnergy` (client + scène), `rowToTask` / `taskToRow`, `visible` / `remaining` / `pending`, `newTaskPayload`, `KIND_LABELS` — utilisés à l'identique d'une tâche à l'autre.
