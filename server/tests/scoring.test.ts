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
