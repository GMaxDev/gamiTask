import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { cleanEmail } from "./waitlist.js";
import { seal } from "./secretbox.js";
import { buildAuthorizeUrl, exchangeCodeForToken, getTwitchUser } from "./twitch.js";
import { disconnectChat as disconnectTwitchChat } from "./twitchChat.js";
import { stopTwitchNpcs } from "./twitchNpcs.js";
import { CORS_ORIGINS, JWT_SECRET, JWT_ALGS, TOKEN_KEY, ADMIN_EMAIL, GOOGLE_CLIENT_ID, TWITCH_REDIRECT_URI, APP_URL } from "./config.js";
import { sql, sqlWaitlist, type UserRow } from "./db.js";
import { buildRoomSummaries } from "./rooms.js";
import { allow } from "./rewards.js";
import type { IoServer } from "./context.js";

const googleOAuthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function requireAuth(req: express.Request, res: express.Response): string | null {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return null;
  }
  try {
    return (jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGS }) as { userId: string }).userId;
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
    return null;
  }
}

const TWITCH_LINK_COOKIE = "twitch_link";
const cookieValue = (header: string | undefined, name: string): string | null =>
  header?.split(";").map((c) => c.trim().split("=")).find(([k]) => k === name)?.[1] ?? null;

export function registerRoutes(app: express.Express, io: IoServer): void {
  app.set("trust proxy", 1);
  app.disable("x-powered-by"); // one nginx in front: req.ip is the client's, not the proxy's
  app.use(cors({ origin: CORS_ORIGINS, credentials: true })); // the same origins as socket.io; credentials for the Twitch-link cookie
  app.use(express.json());

  app.post("/auth/google", async (req, res): Promise<void> => {
    const { credential } = req.body as { credential?: string };
    if (!credential) {
      res.status(400).json({ error: "Missing credential" });
      return;
    }
    if (!GOOGLE_CLIENT_ID) {
      res
        .status(500)
        .json({ error: "Server misconfigured: GOOGLE_CLIENT_ID not set" });
      return;
    }
    try {
      const ticket = await googleOAuthClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload()!;
      const googleId = payload.sub;
      const email = payload.email ?? null;
      const googleName = payload.name ?? email ?? "User";
      const isAdminLogin = !!ADMIN_EMAIL && email === ADMIN_EMAIL && payload.email_verified === true;
      let user = sql.getUserByGoogleId.get(googleId) as UserRow | undefined;
      let userId: string;
      if (!user) {
        userId = randomUUID();
        sql.insertGoogleUser.run(userId, email, googleId, googleName);
        if (isAdminLogin) sql.setAdminFlag.run(userId);
        user = sql.getUserByGoogleId.get(googleId) as UserRow;
      } else {
        userId = user.id;
        sql.updateGoogleAuth.run(email, googleName, userId);
        if (isAdminLogin && user.role !== "admin") sql.setAdminFlag.run(userId);
        user = sql.getUserByGoogleId.get(googleId) as UserRow;
      }
      const token = jwt.sign({ userId, googleId }, JWT_SECRET, {
        expiresIn: "30d",
      });
      res.json({
        userId,
        token,
        name: user.displayName ?? googleName,
        color: user.avatarColor ?? 0,
        isAdmin: user.role === "admin",
        role: user.role,
        isGoogleUser: true,
        twitchLogin: user.twitchLogin,
        twitchDisplayName: user.twitchDisplayName,
      });
    } catch (err) {
      console.error("[auth/google]", err);
      res.status(401).json({ error: "Invalid Google credential" });
    }
  });

  // ponytail: per-IP throttle in memory, a real limiter if the landing ever draws a crowd
  app.post("/api/waitlist", (req, res): void => {
    if (!allow(req.ip ?? "?", "waitlist", 5, 60_000)) { res.status(429).json({ error: "Doucement." }); return; }
    const email = cleanEmail((req.body as { email?: unknown })?.email);
    if (!email) { res.status(400).json({ error: "Adresse invalide." }); return; }
    sqlWaitlist.run(email, Date.now());
    res.json({ ok: true });
  });

  app.get("/api/rooms", (_req, res): void => {
    res.json({ rooms: buildRoomSummaries() });
  });

  app.post("/auth/token", (req, res): void => {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: "Missing token" });
      return;
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGS }) as { userId: string };
      const user = sql.getUser.get(decoded.userId) as UserRow | undefined;
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json({
        userId: user.id,
        token,
        name: user.displayName ?? "",
        color: user.avatarColor ?? 0,
        isAdmin: user.role === "admin",
        role: user.role,
        isGoogleUser: !!user.googleId,
        twitchLogin: user.twitchLogin,
        twitchDisplayName: user.twitchDisplayName,
      });
    } catch {
      res.status(401).json({ error: "Token invalide ou expiré" });
    }
  });

  app.get("/auth/twitch/start", (req, res): void => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
      res.status(500).json({ error: "Server misconfigured: TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET not set" });
      return;
    }
    // The state names who asked; the cookie proves the browser finishing the flow is the one that asked.
    // Without it, a link generated by an attacker and clicked by a streamer would bind the streamer's Twitch to the attacker's account.
    const nonce = randomUUID();
    const state = jwt.sign({ userId, purpose: "twitch-link", nonce }, JWT_SECRET, { expiresIn: "10m" });
    const secure = TWITCH_REDIRECT_URI.startsWith("https://") ? "; Secure" : "";
    res.setHeader("Set-Cookie", `${TWITCH_LINK_COOKIE}=${nonce}; Max-Age=600; Path=/auth/twitch; HttpOnly; SameSite=Lax${secure}`);
    res.json({ url: buildAuthorizeUrl(TWITCH_REDIRECT_URI, state) });
  });

  app.get("/auth/twitch/callback", async (req, res): Promise<void> => {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    if (error || !code || !state) {
      res.redirect(`${APP_URL}/app/?twitch=denied`);
      return;
    }
    let userId: string;
    try {
      const decoded = jwt.verify(state, JWT_SECRET, { algorithms: JWT_ALGS }) as { userId: string; purpose: string; nonce?: string };
      if (decoded.purpose !== "twitch-link") throw new Error("wrong purpose");
      if (!decoded.nonce || decoded.nonce !== cookieValue(req.headers.cookie, TWITCH_LINK_COOKIE)) throw new Error("state not from this browser");
      userId = decoded.userId;
    } catch {
      res.redirect(`${APP_URL}/app/?twitch=expired`);
      return;
    }
    res.setHeader("Set-Cookie", `${TWITCH_LINK_COOKIE}=; Max-Age=0; Path=/auth/twitch; HttpOnly; SameSite=Lax`);
    try {
      const tokens = await exchangeCodeForToken(code, TWITCH_REDIRECT_URI);
      const twitchUser = await getTwitchUser(tokens.accessToken);
      const existing = sql.getUserByTwitchId.get(twitchUser.id) as UserRow | undefined;
      if (existing && existing.id !== userId) {
        res.redirect(`${APP_URL}/app/?twitch=taken`);
        return;
      }
      sql.linkTwitch.run(
        twitchUser.id, twitchUser.login, twitchUser.display_name,
        seal(tokens.accessToken, TOKEN_KEY), seal(tokens.refreshToken, TOKEN_KEY), tokens.expiresAt, userId,
      );
      res.redirect(`${APP_URL}/app/?twitch=linked`);
    } catch (err) {
      console.error("[auth/twitch/callback]", err);
      res.redirect(`${APP_URL}/app/?twitch=error`);
    }
  });

  app.post("/auth/twitch/unlink", (req, res): void => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    sql.unlinkTwitch.run(userId);
    disconnectTwitchChat(userId);
    stopTwitchNpcs(io, userId);
    res.json({ ok: true });
  });

  // Last: a route or the JSON body parser that throws answers with a plain status, never Express's HTML page and stack.
  app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error("[http]", err);
    res.status(status).json({ error: status >= 500 ? "server error" : "bad request" });
  });
}
