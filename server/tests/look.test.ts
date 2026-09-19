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
    eyes: "round",
    brows: "straight",
    nose: "button",
    mouth: "smile",
    eyesY: 0,
    eyesGap: 0,
    eyesSize: 0,
    browsY: 0,
    noseY: 0,
    noseSize: 0,
    mouthY: 0,
    mouthSize: 0,
    body: "regular",
    topPattern: "plain",
    sleeves: "short",
    bottom: "trousers",
    shoes: "brown",
  });
  assert.equal(sanitizeLook(42, null, 1).skin, "peach");
  assert.equal(sanitizeLook({ skin: 7, head: "triangle" }, null, 1).head, "round");
});

test("v1 look sanitizes to v2 defaults for the new fields", () => {
  const v1 = {
    skin: "peach",
    head: "round",
    bangs: "straight",
    back: "short",
    hairColor: "brown",
    shirt: 5,
    trousers: "cream",
    headphones: true,
    hat: null,
  };
  const l = sanitizeLook(v1, null, 5);
  assert.equal(l.eyes, "round");
  assert.equal(l.body, "regular");
  assert.equal(l.topPattern, "plain");
  assert.equal(l.sleeves, "short");
  assert.equal(l.bottom, "trousers");
  assert.equal(l.shoes, "brown");
  assert.equal(l.eyesY, 0);
});

test("face/outfit enums fall back to default on garbage, valid ids pass", () => {
  assert.equal(sanitizeLook({ eyes: "square" }, null, 0).eyes, "round");
  assert.equal(sanitizeLook({ eyes: "wink" }, null, 0).eyes, "wink");
  assert.equal(sanitizeLook({ brows: "nope" }, null, 0).brows, "straight");
  assert.equal(sanitizeLook({ brows: "thick" }, null, 0).brows, "thick");
  assert.equal(sanitizeLook({ nose: "nope" }, null, 0).nose, "button");
  assert.equal(sanitizeLook({ nose: "wide" }, null, 0).nose, "wide");
  assert.equal(sanitizeLook({ mouth: "nope" }, null, 0).mouth, "smile");
  assert.equal(sanitizeLook({ mouth: "grin" }, null, 0).mouth, "grin");
  assert.equal(sanitizeLook({ body: "huge" }, null, 0).body, "regular");
  assert.equal(sanitizeLook({ body: "slim" }, null, 0).body, "slim");
  assert.equal(sanitizeLook({ sleeves: "nope" }, null, 0).sleeves, "short");
  assert.equal(sanitizeLook({ sleeves: "long" }, null, 0).sleeves, "long");
  assert.equal(sanitizeLook({ bottom: "nope" }, null, 0).bottom, "trousers");
  assert.equal(sanitizeLook({ bottom: "skirt" }, null, 0).bottom, "skirt");
});

test("face sliders are integers clamped to -3..3, else 0", () => {
  assert.equal(sanitizeLook({ eyesY: 3 }, null, 0).eyesY, 3);
  assert.equal(sanitizeLook({ eyesY: -3 }, null, 0).eyesY, -3);
  assert.equal(sanitizeLook({ eyesY: 4 }, null, 0).eyesY, 0);
  assert.equal(sanitizeLook({ eyesY: -4 }, null, 0).eyesY, 0);
  assert.equal(sanitizeLook({ eyesY: 1.5 }, null, 0).eyesY, 0);
  assert.equal(sanitizeLook({ eyesY: "2" }, null, 0).eyesY, 0);
  assert.equal(sanitizeLook({ eyesGap: 2 }, null, 0).eyesGap, 2);
  assert.equal(sanitizeLook({ eyesSize: -2 }, null, 0).eyesSize, -2);
  assert.equal(sanitizeLook({ browsY: 2 }, null, 0).browsY, 2);
  assert.equal(sanitizeLook({ noseY: 2 }, null, 0).noseY, 2);
  assert.equal(sanitizeLook({ noseSize: 2 }, null, 0).noseSize, 2);
  assert.equal(sanitizeLook({ mouthY: 2 }, null, 0).mouthY, 2);
  assert.equal(sanitizeLook({ mouthSize: 2 }, null, 0).mouthSize, 2);
});

test("topPattern and shoes are free strings capped at 16 chars", () => {
  assert.equal(sanitizeLook({ topPattern: "x".repeat(50) }, null, 0).topPattern.length, 16);
  assert.equal(sanitizeLook({ shoes: "x".repeat(50) }, null, 0).shoes.length, 16);
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
