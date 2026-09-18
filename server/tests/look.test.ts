import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeLook } from "../src/look.ts";

test("defaults on garbage input", () => {
  assert.deepEqual(sanitizeLook(null, null, 0x336699), {
    skin: "peach",
    head: "round",
    bangs: "straight",
    back: "short",
    hairColor: "brown",
    shirt: 0x336699,
    trousers: "cream",
    headphones: true,
    hat: null,
  });
  assert.equal(sanitizeLook(42, null, 1).skin, "peach");
  assert.equal(sanitizeLook({ skin: 7, head: "triangle" }, null, 1).head, "round");
});

test("hat is always the server-side equipped hat", () => {
  assert.equal(sanitizeLook({ hat: "hat-crown" }, null, 0).hat, null);
  assert.equal(sanitizeLook({ hat: null }, "hat-halo", 0).hat, "hat-halo");
});

test("shirt falls back to avatarColor when out of range", () => {
  assert.equal(sanitizeLook({ shirt: -1 }, null, 111).shirt, 111);
  assert.equal(sanitizeLook({ shirt: 0x1000000 }, null, 111).shirt, 111);
  assert.equal(sanitizeLook({ shirt: 1.5 }, null, 111).shirt, 111);
  assert.equal(sanitizeLook({ shirt: 0 }, null, 111).shirt, 0);
  assert.equal(sanitizeLook({ shirt: 0xffffff }, null, 111).shirt, 0xffffff);
});

test("strings are capped at 16 chars and booleans kept", () => {
  assert.equal(sanitizeLook({ bangs: "x".repeat(50) }, null, 0).bangs.length, 16);
  assert.equal(sanitizeLook({ headphones: false }, null, 0).headphones, false);
  assert.equal(sanitizeLook({ headphones: "yes" }, null, 0).headphones, true);
  assert.equal(sanitizeLook({ head: "square" }, null, 0).head, "square");
});
