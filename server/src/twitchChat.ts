// Live chat mirroring: one EventSub-over-WebSocket connection per online, Twitch-linked
// gamiTask user, subscribed to their own channel's chat. Twitch only allows a user to
// subscribe to channel.chat.message using their own access token (scope user:read:chat)
// for a broadcaster_user_id/user_id pair that matches themselves — same one-channel-only
// restriction as Get Chatters, just for a live stream of messages instead of a snapshot.
import WebSocket from "ws";

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? "";
const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";

export interface ChatMessageEvent {
  chatterId: string;
  chatterLogin: string;
  chatterName: string;
  text: string;
  color: string | null;
}

interface Session {
  ws: WebSocket;
  broadcasterId: string;
  getAccessToken: () => Promise<string | null>;
  onMessage: (msg: ChatMessageEvent) => void;
}

const sessions = new Map<string, Session>(); // keyed by gamiTask userId

async function subscribe(accessToken: string, broadcasterId: string, sessionId: string): Promise<boolean> {
  const res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method: "POST",
    headers: {
      "Client-Id": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "channel.chat.message",
      version: "1",
      condition: { broadcaster_user_id: broadcasterId, user_id: broadcasterId },
      transport: { method: "websocket", session_id: sessionId },
    }),
  });
  if (!res.ok) console.error("[twitchChat] subscribe failed", res.status, await res.text().catch(() => ""));
  return res.ok;
}

function open(userId: string): void {
  const existing = sessions.get(userId);
  if (!existing) return;
  const ws = new WebSocket(EVENTSUB_URL);
  existing.ws = ws;

  ws.on("message", async (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const type = msg.metadata?.message_type;
    const session = sessions.get(userId);
    if (!session) return; // torn down while a message was in flight

    if (type === "session_welcome") {
      const token = await session.getAccessToken();
      if (!token) {
        disconnectChat(userId);
        return;
      }
      const ok = await subscribe(token, session.broadcasterId, msg.payload.session.id);
      if (ok) console.log(`[twitchChat] listening to broadcaster ${session.broadcasterId}`);
      else disconnectChat(userId);
    } else if (type === "session_reconnect") {
      try {
        ws.close();
      } catch {}
      open(userId); // Twitch's reconnect_url carries session continuity we don't need: a fresh handshake + resubscribe is simpler and just as correct
    } else if (type === "notification" && msg.payload?.subscription?.type === "channel.chat.message") {
      const e = msg.payload.event;
      session.onMessage({
        chatterId: e.chatter_user_id,
        chatterLogin: e.chatter_user_login,
        chatterName: e.chatter_user_name,
        text: e.message?.text ?? "",
        color: e.color || null,
      });
    } else if (type === "revocation") {
      disconnectChat(userId);
    }
  });
  ws.on("error", () => {});
  ws.on("close", () => {
    if (sessions.get(userId)?.ws === ws) sessions.delete(userId);
  });
}

export function connectChat(
  userId: string,
  broadcasterId: string,
  getAccessToken: () => Promise<string | null>,
  onMessage: (msg: ChatMessageEvent) => void,
): void {
  if (sessions.has(userId)) return;
  sessions.set(userId, { ws: null as unknown as WebSocket, broadcasterId, getAccessToken, onMessage });
  open(userId);
}

export function disconnectChat(userId: string): void {
  const session = sessions.get(userId);
  if (!session) return;
  sessions.delete(userId);
  try {
    session.ws.close();
  } catch {}
}
