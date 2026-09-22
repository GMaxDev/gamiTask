import { test } from "node:test";
import assert from "node:assert/strict";
import {
  delta, rewards, energyLoss, tint, levelOf, clampValue,
  DELTA_CAP, VALUE_MIN, VALUE_MAX,
} from "../src/scoring.ts";
import type { Task } from "../src/types.ts";
import { score, isDue, dayBit, startOfDay, rollover, cleanKind, cleanDifficulty, cleanDays, cleanChecklist, cleanNote, coinsDelta, CRON_ENERGY_CAP } from "../src/scoring.ts";

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
  const three = rollover([d], TUE - 5 * DAY, TUE, TZ, LVL);
  assert.equal(three.days, 5);
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

test("cleanChecklist escapes item text and is idempotent (no double-escape on a re-sent checklist)", () => {
  assert.equal(cleanChecklist([{ text: "<b>", done: false }])[0].text, "&lt;b&gt;");
  assert.equal(cleanChecklist([{ text: "&lt;b&gt;", done: false }])[0].text, "&lt;b&gt;");
});

test("coinsDelta applies the bonus signed, floors bonus at 0, and is a no-op on a zero base", () => {
  assert.equal(coinsDelta(10, 2), 12);
  assert.equal(coinsDelta(-10, 2), -12);
  assert.equal(coinsDelta(0, 2), 0);
  assert.equal(coinsDelta(10, -5), 10);
});

test("cleanNote truncates the raw string before escaping, never leaving a dangling entity", () => {
  const result = cleanNote("z".repeat(199) + "<b>");
  assert.ok(result.endsWith("&lt;"));
  assert.equal(result, "z".repeat(199) + "&lt;");
});
