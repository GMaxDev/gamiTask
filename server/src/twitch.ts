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

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
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
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
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
