import type { Look } from "./types.js";

const HEADS: ReadonlySet<string> = new Set(["round", "oval", "square"]);

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v.slice(0, 16) : fallback;
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
  };
}
