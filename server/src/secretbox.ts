// Secrets at rest (Twitch tokens): AES-256-GCM under one key from the environment.
// A sealed value reads `v1:<iv>:<tag>:<ciphertext>` in base64url; anything else is taken as legacy
// plaintext, so rows written before the key existed still open and get re-sealed on their next write.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "v1:";

export function parseKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64url")).join(":");
}

export const isSealed = (v: string | null | undefined): boolean => typeof v === "string" && v.startsWith(PREFIX);

export function open(stored: string | null, key: Buffer): string | null {
  if (stored === null) return null;
  if (!isSealed(stored)) return stored; // legacy plaintext
  const [iv, tag, ct] = stored.slice(PREFIX.length).split(":").map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
