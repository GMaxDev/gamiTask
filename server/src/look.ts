import type { Look } from "./types.js";

const HEADS: ReadonlySet<string> = new Set(["round", "oval", "square"]);
const EYES: ReadonlySet<string> = new Set(["round", "almond", "wide", "sleepy", "wink"]);
const BROWS: ReadonlySet<string> = new Set(["straight", "arched", "thick", "thin"]);
const NOSES: ReadonlySet<string> = new Set(["button", "straight", "wide", "small"]);
const MOUTHS: ReadonlySet<string> = new Set(["smile", "neutral", "grin", "open", "pout"]);
const BODIES: ReadonlySet<string> = new Set(["slim", "regular", "round"]);
const SLEEVES: ReadonlySet<string> = new Set(["short", "long"]);
const BOTTOMS: ReadonlySet<string> = new Set(["trousers", "shorts", "skirt"]);

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v.slice(0, 16) : fallback;
}

function pickEnum<T extends string>(v: unknown, set: ReadonlySet<string>, fallback: T): T {
  return typeof v === "string" && set.has(v) ? (v as T) : fallback;
}

function slider(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= -3 && v <= 3 ? v : 0;
}

// Le chapeau et la couleur de t-shirt restent sous autorité serveur : le client
// ne peut pas se donner un chapeau qu'il ne possède pas.
export function sanitizeLook(
  raw: unknown,
  equippedHat: string | null,
  shirt: number,
): Look {
  const o: Record<string, unknown> =
    raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const head = typeof o.head === "string" && HEADS.has(o.head) ? o.head : "round";
  const rawShirt = o.shirt;
  const validShirt =
    typeof rawShirt === "number" &&
    Number.isInteger(rawShirt) &&
    rawShirt >= 0 &&
    rawShirt <= 0xffffff;
  return {
    skin: str(o.skin, "peach"),
    head: head as Look["head"],
    bangs: str(o.bangs, "straight"),
    back: str(o.back, "short"),
    hairColor: str(o.hairColor, "brown"),
    shirt: validShirt ? (rawShirt as number) : shirt,
    trousers: str(o.trousers, "cream"),
    headphones: typeof o.headphones === "boolean" ? o.headphones : true,
    hat: equippedHat,
    eyes: pickEnum(o.eyes, EYES, "round"),
    brows: pickEnum(o.brows, BROWS, "straight"),
    nose: pickEnum(o.nose, NOSES, "button"),
    mouth: pickEnum(o.mouth, MOUTHS, "smile"),
    eyesY: slider(o.eyesY),
    eyesGap: slider(o.eyesGap),
    eyesSize: slider(o.eyesSize),
    browsY: slider(o.browsY),
    noseY: slider(o.noseY),
    noseSize: slider(o.noseSize),
    mouthY: slider(o.mouthY),
    mouthSize: slider(o.mouthSize),
    body: pickEnum(o.body, BODIES, "regular"),
    topPattern: str(o.topPattern, "plain"),
    sleeves: pickEnum(o.sleeves, SLEEVES, "short"),
    bottom: pickEnum(o.bottom, BOTTOMS, "trousers"),
    shoes: str(o.shoes, "brown"),
  };
}
