// App-only Twitch access: viewer_count on Get Streams is public data, no per-user OAuth or mod rights needed.
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET ?? "";

let appToken: { token: string; exp: number } | null = null;
async function getAppToken(): Promise<string> {
  if (appToken && Date.now() < appToken.exp) return appToken.token;
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`twitch token: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  appToken = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  return appToken.token;
}

/** Current viewer count for a live channel, or null if it's offline (or doesn't exist). */
export async function getViewerCount(channel: string): Promise<number | null> {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error("Server misconfigured: TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET not set");
  }
  const token = await getAppToken();
  const res = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channel)}`,
    { headers: { "Client-Id": TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`twitch streams: ${res.status}`);
  const data = (await res.json()) as { data: { viewer_count: number }[] };
  return data.data[0]?.viewer_count ?? null;
}

// Account linking: standard OAuth authorization-code flow, so a gamiTask user can prove
// which Twitch account is theirs (and later let a streamer read their own channel's chatters).
const SCOPE = "user:read:email moderator:read:chatters";

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    state,
  });
  return `https://id.twitch.tv/oauth2/authorize?${params}`;
}

export interface TwitchTokens { accessToken: string; refreshToken: string; expiresAt: number }

function toTokens(data: { access_token: string; refresh_token: string; expires_in: number }): TwitchTokens {
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<TwitchTokens> {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`twitch code exchange: ${res.status}`);
  return toTokens(await res.json());
}

/** Twitch user access tokens expire (~4h); a stored refresh token gets a fresh one without re-consent. */
export async function refreshUserToken(refreshToken: string): Promise<TwitchTokens> {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`twitch token refresh: ${res.status}`);
  return toTokens(await res.json());
}

export interface TwitchUser { id: string; login: string; display_name: string }

export async function getTwitchUser(userAccessToken: string): Promise<TwitchUser> {
  const res = await fetch("https://api.twitch.tv/helix/users", {
    headers: { "Client-Id": TWITCH_CLIENT_ID, Authorization: `Bearer ${userAccessToken}` },
  });
  if (!res.ok) throw new Error(`twitch users: ${res.status}`);
  const data = (await res.json()) as { data: TwitchUser[] };
  const user = data.data[0];
  if (!user) throw new Error("twitch users: empty response");
  return user;
}

export interface Chatter { id: string; login: string; name: string }

/**
 * Who's actually in a channel's chat right now. Twitch only allows a broadcaster (or one of
 * their mods) to read this about their own channel, using that person's own user access token —
 * there's no way to read another streamer's chatters without them linking their own account.
 */
export async function getChatters(broadcasterId: string, userAccessToken: string): Promise<Chatter[]> {
  const params = new URLSearchParams({ broadcaster_id: broadcasterId, moderator_id: broadcasterId, first: "1000" });
  const res = await fetch(`https://api.twitch.tv/helix/chat/chatters?${params}`, {
    headers: { "Client-Id": TWITCH_CLIENT_ID, Authorization: `Bearer ${userAccessToken}` },
  });
  if (!res.ok) throw new Error(`twitch chatters: ${res.status}`);
  const data = (await res.json()) as { data: { user_id: string; user_login: string; user_name: string }[] };
  return data.data.map((c) => ({ id: c.user_id, login: c.user_login, name: c.user_name }));
}
