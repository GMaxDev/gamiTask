import jwt from "jsonwebtoken";
import { parseKey } from "./secretbox.js";

// Grid bound shared by every room. The 3D café is 24x20; 32 leaves room for bigger layouts.
export const MAX_GRID = 32;
export const CORS_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173").split(",");

// No fallback: a guessable secret signs admin sessions. The server refuses to start rather than run with one.
export const JWT_SECRET = process.env.JWT_SECRET ?? "";
if (JWT_SECRET.length < 32) {
  console.error("[config] JWT_SECRET must be set and at least 32 characters long (see README, .env.prod.example)");
  process.exit(1);
}
export const JWT_ALGS: jwt.Algorithm[] = ["HS256"]; // pin the algorithm on verify: a token may not pick its own
// Twitch tokens rest encrypted under TOKEN_KEY (32 bytes, hex or base64). Same rule as the JWT secret: no key, no start.
export const TOKEN_KEY: Buffer = parseKey(process.env.TOKEN_KEY) ?? ((): never => {
  console.error("[config] TOKEN_KEY must be 32 bytes in hex or base64 (see README, .env.prod.example)");
  return process.exit(1);
})();
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";

// ── Twitch account linking ──────────────────────────────────────────────
export const TWITCH_REDIRECT_URI = process.env.TWITCH_REDIRECT_URI ?? "http://localhost:3001/auth/twitch/callback";
export const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
if (!process.env.APP_URL) console.warn("[twitch] APP_URL is not set: OAuth returns will point at", APP_URL);

export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
export const DB_PATH = process.env.DB_PATH ?? "./data.db";
