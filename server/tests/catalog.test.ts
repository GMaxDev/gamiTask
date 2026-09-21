import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeItem } from "../src/catalog.ts";

const part = { kind: "box", x: 0, y: 0.5, z: 0, w: 1, h: 1, d: 1, color: "#c9764f" };
const ok = { id: "stool", kind: "furniture", name: "Tabouret", emoji: "🪑", price: 50, w: 1, d: 1, parts: [part], anchors: [] };

test("a well-formed item passes through, with defaults filled in", () => {
  const it = sanitizeItem(ok)!;
  assert.equal(it.id, "stool");
  assert.deepEqual(it.parts[0], { kind: "box", x: 0, y: 0.5, z: 0, rx: 0, ry: 0, rz: 0, w: 1, h: 1, d: 1, r: 0.04, color: "#c9764f" });
});
test("ids are slugs, hats have no footprint", () => {
  assert.equal(sanitizeItem({ ...ok, id: "Bad Id!" }), null);
  assert.equal(sanitizeItem({ ...ok, id: "plant" }), null);// never shadows a built-in
  const hat = sanitizeItem({ ...ok, id: "hat-cone", kind: "hat", w: 3, d: 3 })!;
  assert.equal(hat.w, 1); assert.equal(hat.d, 1);
});
test("parts are bounded and typed", () => {
  assert.equal(sanitizeItem({ ...ok, parts: [] }), null);
  assert.equal(sanitizeItem({ ...ok, parts: Array(65).fill(part) }), null);
  assert.equal(sanitizeItem({ ...ok, parts: [{ ...part, kind: "torus" }] }), null);
  assert.equal(sanitizeItem({ ...ok, parts: [{ ...part, color: "red" }] }), null);
  assert.equal(sanitizeItem({ ...ok, parts: [{ ...part, w: Infinity }] }), null);
  assert.equal(sanitizeItem({ ...ok, parts: [{ ...part, w: 40 }] }), null);
  const cyl = sanitizeItem({ ...ok, parts: [{ kind: "cyl", x: 0, y: 0, z: 0, rt: 0, rb: 0.2, h: 0.4, color: "#fff", n: 200 }] })!;
  assert.deepEqual(cyl.parts[0], { kind: "cyl", x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rt: 0, rb: 0.2, h: 0.4, n: 64, color: "#fff" });
  const ball = sanitizeItem({ ...ok, parts: [{ kind: "ball", x: 0, y: 0, z: 0, r: 0.2, color: "#fff" }] })!;
  assert.deepEqual(ball.parts[0], { kind: "ball", x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, r: 0.2, sx: 1, sy: 1, sz: 1, color: "#fff" });
});
test("names, prices and footprints are clamped", () => {
  const it = sanitizeItem({ ...ok, name: "  x".repeat(40), price: -5, w: 9, d: 0.5, emoji: "" })!;
  assert.equal(it.name.length, 30); assert.equal(it.price, 0); assert.equal(it.w, 4); assert.equal(it.d, 1); assert.equal(it.emoji, "📦");
  assert.equal(sanitizeItem({ ...ok, name: "" }), null);
});
test("anchors carry a pose, surfaces a footprint too", () => {
  const it = sanitizeItem({ ...ok, anchors: [{ kind: "seat", x: 0.1, y: 0.6, z: 0, rot: 1.5 }, { kind: "surface", x: 0, y: 1, z: 0, w: 9, d: 0.5 }] })!;
  assert.deepEqual(it.anchors[0], { kind: "seat", x: 0.1, y: 0.6, z: 0, rot: 1.5 });
  assert.deepEqual(it.anchors[1], { kind: "surface", x: 0, y: 1, z: 0, rot: 0, w: 4, d: 0.5 });
  assert.equal(sanitizeItem({ ...ok, anchors: [{ kind: "bed", x: 0, y: 0, z: 0 }] }), null);
});
