// Items built in the in-app editor: a recipe of primitives the client turns into meshes. Pure validation, no DB.

export type PartKind = "box" | "cyl" | "ball" | "torus" | "shell";
interface PartBase { kind: PartKind; x: number; y: number; z: number; rx: number; ry: number; rz: number; color: string }
export type Part =
  | (PartBase & { kind: "box"; w: number; h: number; d: number; r: number })
  | (PartBase & { kind: "cyl"; rt: number; rb: number; h: number; n: number })
  | (PartBase & { kind: "ball"; r: number; sx: number; sy: number; sz: number })
  | (PartBase & { kind: "torus"; rad: number; tube: number; n: number; arc: number })
  // A hollow box: five walls of thickness t, open on its +z face, the way a shelf or a cupboard is carved.
  | (PartBase & { kind: "shell"; w: number; h: number; d: number; t: number; r: number });
export type AnchorKind = "seat" | "surface" | "portable" | "wearable";
// A surface also has a footprint: the area later inventory items may be set down on.
export type Anchor = { kind: AnchorKind; x: number; y: number; z: number; rot: number; w?: number; d?: number };
// kind "decor": a piece of the rooms (chair, table…) that only exists as an override of the coded one, never in the shop.
export interface CatalogItem { id: string; kind: "hat" | "furniture" | "decor"; name: string; emoji: string; price: number; w: number; d: number; parts: Part[]; anchors: Anchor[] }

export const MAX_PARTS = 64;
const num = (v: unknown, lo: number, hi: number, dflt: number): number | null =>
  v === undefined ? dflt : typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 1000) / 1000 : null;
const COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function sanitizePart(raw: unknown): Part | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.color !== "string" || !COLOR.test(p.color)) return null;
  const base = { x: num(p.x, -8, 8, 0), y: num(p.y, -8, 8, 0), z: num(p.z, -8, 8, 0), rx: num(p.rx, -7, 7, 0), ry: num(p.ry, -7, 7, 0), rz: num(p.rz, -7, 7, 0) };
  if (Object.values(base).some((v) => v === null)) return null;
  const b = base as { x: number; y: number; z: number; rx: number; ry: number; rz: number }, color = p.color;
  const dims = (spec: Record<string, [number, number, number | undefined]>): Record<string, number> | null => {
    const out: Record<string, number> = {};
    for (const [k, [lo, hi, dflt]] of Object.entries(spec)) { const v = num(p[k], lo, hi, dflt ?? NaN); if (v === null || Number.isNaN(v)) return null; out[k] = v; }
    return out;
  };
  if (p.kind === "box") { const d = dims({ w: [0.01, 8, undefined], h: [0.01, 8, undefined], d: [0.01, 8, undefined], r: [0, 2, 0.04] }); return d && { kind: "box", ...b, ...(d as { w: number; h: number; d: number; r: number }), color }; }
  if (p.kind === "cyl") { const d = dims({ rt: [0, 8, undefined], rb: [0, 8, undefined], h: [0.01, 8, undefined] }), n = typeof p.n === "number" && Number.isFinite(p.n) ? Math.max(3, Math.min(64, Math.round(p.n))) : 16; return d && { kind: "cyl", ...b, ...(d as { rt: number; rb: number; h: number }), n, color }; }
  if (p.kind === "ball") { const d = dims({ r: [0.01, 8, undefined], sx: [0.05, 8, 1], sy: [0.05, 8, 1], sz: [0.05, 8, 1] }); return d && { kind: "ball", ...b, ...(d as { r: number; sx: number; sy: number; sz: number }), color }; }
  const segs = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(3, Math.min(64, Math.round(v))) : dflt);
  if (p.kind === "torus") { const d = dims({ rad: [0.01, 8, undefined], tube: [0.005, 4, undefined], arc: [0.1, 6.283, 6.283] }); return d && { kind: "torus", ...b, ...(d as { rad: number; tube: number; arc: number }), n: segs(p.n, 24), color }; }
  if (p.kind === "shell") { const d = dims({ w: [0.02, 8, undefined], h: [0.02, 8, undefined], d: [0.02, 8, undefined], t: [0.005, 4, 0.04], r: [0, 2, 0.02] }); return d && d.t * 2 < Math.min(d.w, d.h, d.d) ? { kind: "shell", ...b, ...(d as { w: number; h: number; d: number; t: number; r: number }), color } : null; }
  return null;
}
function sanitizeAnchor(raw: unknown): Anchor | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (!["seat", "surface", "portable", "wearable"].includes(a.kind as string)) return null;
  const x = num(a.x, -8, 8, 0), y = num(a.y, -8, 8, 0), z = num(a.z, -8, 8, 0), rot = num(a.rot, -7, 7, 0);
  if (x === null || y === null || z === null || rot === null) return null;
  const out: Anchor = { kind: a.kind as AnchorKind, x, y, z, rot };
  if (out.kind === "surface") { const clamp = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.max(0.05, Math.min(4, Math.round(v * 1000) / 1000)) : 1; out.w = clamp(a.w); out.d = clamp(a.d); }
  return out;
}
export function sanitizeItem(raw: unknown): CatalogItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(r.id)) return null;
  if (r.kind !== "hat" && r.kind !== "furniture" && r.kind !== "decor") return null;
  const name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, 30) : "";
  if (!name) return null;
  const emoji = typeof r.emoji === "string" && r.emoji.trim() ? r.emoji.trim().slice(0, 8) : "📦";
  const price = typeof r.price === "number" && Number.isFinite(r.price) ? Math.max(0, Math.min(99999, Math.round(r.price))) : 0;
  const cells = (v: unknown) => (r.kind !== "furniture" ? 1 : typeof v === "number" && Number.isFinite(v) ? Math.max(1, Math.min(4, Math.round(v))) : 1);
  if (!Array.isArray(r.parts) || r.parts.length === 0 || r.parts.length > MAX_PARTS) return null;
  const parts: Part[] = [];
  for (const p of r.parts) { const s = sanitizePart(p); if (!s) return null; parts.push(s); }
  const anchors: Anchor[] = [];
  for (const a of Array.isArray(r.anchors) ? r.anchors.slice(0, 16) : []) { const s = sanitizeAnchor(a); if (!s) return null; anchors.push(s); }
  return { id: r.id, kind: r.kind, name, emoji, price, w: cells(r.w), d: cells(r.d), parts, anchors };
}
