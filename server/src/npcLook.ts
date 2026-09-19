// Random Look for a decorative Twitch NPC. The id vocabulary here mirrors the client's
// catalogues (app/src/look.ts) — sanitizeLook accepts free-form strings for most fields, so
// this only needs to speak the same ids the client's own pickers recognize, not import them.
import type { Look } from "./types.js";

const SKINS = ["porcelain", "peach", "honey", "caramel", "cocoa", "ebony"];
const HEADS: Look["head"][] = ["round", "oval", "square"];
const BANGS = ["none", "straight", "curtain", "side", "curly"];
const BACKS = ["none", "short", "bob", "ponytail", "braids"];
const HAIR_COLORS = ["black", "brown", "chestnut", "ginger", "blond", "ash", "white", "sage"];
const TROUSERS = ["cream", "sand", "olive", "slate"];
const EYES = ["round", "almond", "wide", "sleepy", "wink"];
const BROWS = ["straight", "arched", "thick", "thin"];
const NOSES = ["button", "straight", "wide", "small"];
const MOUTHS = ["smile", "neutral", "grin", "open", "pout"];
const BODIES: Look["body"][] = ["slim", "regular", "round"];
const PATTERNS = ["plain", "stripes", "dots", "collar"];
const SLEEVES: Look["sleeves"][] = ["short", "long"];
const BOTTOMS: Look["bottom"][] = ["trousers", "shorts", "skirt"];
const SHOES = ["brown", "black", "white", "terracotta"];
const PALETTE = [0x819478, 0xc9764f, 0x8aa6b8, 0xd2a754, 0xa04050, 0x7a8e4a, 0xb85530, 0x384d43];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}
const slider = (): number => Math.floor(Math.random() * 5) - 2; // -2..2

export function randomNpcLook(): { look: Look; color: number } {
  const color = pick(PALETTE);
  const look: Look = {
    skin: pick(SKINS), head: pick(HEADS), bangs: pick(BANGS), back: pick(BACKS), hairColor: pick(HAIR_COLORS),
    shirt: color, trousers: pick(TROUSERS), headphones: Math.random() < 0.5, hat: null,
    eyes: pick(EYES), brows: pick(BROWS), nose: pick(NOSES), mouth: pick(MOUTHS),
    eyesY: slider(), eyesGap: slider(), eyesSize: slider(), browsY: slider(),
    noseY: slider(), noseSize: slider(), mouthY: slider(), mouthSize: slider(),
    body: pick(BODIES), topPattern: pick(PATTERNS), sleeves: pick(SLEEVES), bottom: pick(BOTTOMS), shoes: pick(SHOES),
  };
  return { look, color };
}
