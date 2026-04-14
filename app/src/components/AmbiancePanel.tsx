import { useEffect, useRef, useState, useCallback } from "react";
import type { VideoState } from "../net/types";
import type { SocketClient } from "../net/SocketClient";

// ── YouTube IFrame API types ──────────────────────────────────────────────────
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Load the YT script once across the app lifetime
let ytApiReady = false;
const ytReadyQueue: (() => void)[] = [];

function loadYTApi(cb: () => void) {
  if (ytApiReady) { cb(); return; }
  ytReadyQueue.push(cb);
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    prev?.();
    ytApiReady = true;
    ytReadyQueue.forEach((fn) => fn());
    ytReadyQueue.length = 0;
  };
}

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /embed\/([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  return null;
}

const DRIFT_TOLERANCE = 3;
const SYNC_INTERVAL_MS = 8000;
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const DEFAULT_VOLUME = 70;

interface Props {
  open: boolean;
  onClose: () => void;
  socket: SocketClient | null;
  socketId: string | undefined;
  videoState: VideoState | null;
}

export function AmbiancePanel({ open, onClose, socket, socketId, videoState }: Props) {
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");

  // Volume (0–100) and mute managed entirely in our UI
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [isMuted, setIsMutedState] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs for values needed inside stale YT callbacks
  const volumeRef = useRef(DEFAULT_VOLUME);
  const isMutedRef = useRef(false);
  const prevVolumeRef = useRef(DEFAULT_VOLUME); // saved before mute

  const playerDivRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const suppressRef = useRef(false);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeVideoIdRef = useRef<string | null>(null);

  const isOwner = !!videoState?.videoId && videoState.ownerId === socketId;
  const hasVideo = !!videoState?.videoId;

  // Helpers to keep state + ref in sync
  const setVolume = (v: number) => {
    volumeRef.current = v;
    setVolumeState(v);
  };
  const setMuted = (m: boolean) => {
    isMutedRef.current = m;
    setIsMutedState(m);
  };

  // Apply volume to the player using our values (not native YT controls)
  const applyVolume = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isMutedRef.current) {
      player.mute();
    } else {
      player.unMute();
      player.setVolume(volumeRef.current);
    }
  }, []);

  function expectedTime(state: VideoState): number {
    if (!state.playing) return state.timestamp;
    const elapsed = Date.now() / 1000 - state.syncedAt;
    return state.timestamp + elapsed * state.playbackRate;
  }

  // ── Create / recreate the YT player when videoId changes ─────────────────
  useEffect(() => {
    const videoId = videoState?.videoId ?? null;

    if (!videoId) {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
      activeVideoIdRef.current = null;
      setIsPlaying(false);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      return;
    }

    if (activeVideoIdRef.current === videoId) return;
    activeVideoIdRef.current = videoId;

    const ownerAtCreation = videoState!.ownerId === socketId;
    const initTimestamp = expectedTime(videoState!);

    loadYTApi(() => {
      if (!playerDivRef.current) return;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }

      playerRef.current = new window.YT.Player(playerDivRef.current, {
        videoId,
        width: "100%",
        height: "200",
        playerVars: {
          autoplay: 1,
          controls: 0,        // always off — volume/playback via our UI only
          disablekb: 1,       // block keyboard shortcuts inside the iframe
          start: Math.floor(Math.max(0, initTimestamp)),
          mute: 0,            // start unmuted; we control volume ourselves
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          fs: 0,
          playsinline: 1,
        },
        events: {
          onReady: (e: { target: typeof playerRef.current }) => {
            e.target.setPlaybackRate(videoState!.playbackRate);
            // Apply our volume immediately — ignore YT's own volume state
            e.target.unMute();
            e.target.setVolume(volumeRef.current);
            if (isMutedRef.current) e.target.mute();
            if (videoState!.playing) {
              e.target.playVideo();
              setIsPlaying(true);
            } else {
              e.target.pauseVideo();
              setIsPlaying(false);
            }
          },
          onStateChange: (e: { data: number; target: typeof playerRef.current }) => {
            const playing = e.data === 1;
            const paused = e.data === 2;
            if (playing || paused) {
              setIsPlaying(playing);
              if (!suppressRef.current && ownerAtCreation) {
                const ts: number = e.target.getCurrentTime() ?? 0;
                socket?.syncVideo(ts, playing, e.target.getPlaybackRate?.() ?? 1);
              }
            }
          },
          onPlaybackRateChange: (e: { data: number; target: typeof playerRef.current }) => {
            if (suppressRef.current || !ownerAtCreation) return;
            const ts: number = e.target.getCurrentTime() ?? 0;
            socket?.syncVideo(ts, e.target.getPlayerState() === 1, e.data);
          },
        },
      });
    });

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoState?.videoId]);

  // ── Non-owner: sync to incoming server state ──────────────────────────────
  useEffect(() => {
    if (!videoState?.videoId || isOwner || !playerRef.current) return;
    const player = playerRef.current;
    const expTime = expectedTime(videoState);

    suppressRef.current = true;
    try {
      const currentTime: number = player.getCurrentTime?.() ?? 0;
      if (Math.abs(currentTime - expTime) > DRIFT_TOLERANCE) {
        player.seekTo(expTime, true);
      }
      player.setPlaybackRate(videoState.playbackRate);
      if (videoState.playing) {
        player.playVideo();
        setIsPlaying(true);
      } else {
        player.pauseVideo();
        setIsPlaying(false);
      }
    } catch {}
    setTimeout(() => { suppressRef.current = false; }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoState, isOwner]);

  // ── Owner: periodic sync pulse ────────────────────────────────────────────
  useEffect(() => {
    if (!isOwner) {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      return;
    }
    syncIntervalRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        if (player.getPlayerState?.() === 1) {
          socket?.syncVideo(player.getCurrentTime(), true, player.getPlaybackRate?.() ?? 1);
        }
      } catch {}
    }, SYNC_INTERVAL_MS);
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [isOwner, socket]);

  // ── Volume controls ───────────────────────────────────────────────────────
  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val);
    if (val > 0 && isMutedRef.current) {
      setMuted(false);
    }
    const player = playerRef.current;
    if (!player) return;
    if (val === 0) {
      player.mute();
    } else {
      player.unMute();
      player.setVolume(val);
    }
  }, []);

  const handleMuteToggle = useCallback(() => {
    if (isMutedRef.current) {
      // Restore previous volume
      const restored = prevVolumeRef.current > 0 ? prevVolumeRef.current : DEFAULT_VOLUME;
      setMuted(false);
      setVolume(restored);
      playerRef.current?.unMute?.();
      playerRef.current?.setVolume?.(restored);
    } else {
      prevVolumeRef.current = volumeRef.current;
      setMuted(true);
      playerRef.current?.mute?.();
    }
  }, []);

  // Re-apply our volume whenever the panel re-opens (YT player might have reset)
  useEffect(() => {
    if (open) applyVolume();
  }, [open, applyVolume]);

  // ── Owner play/pause ──────────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.getPlayerState?.() === 1) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
    // onStateChange will fire and emit the sync
  }, []);

  // ── Speed change ──────────────────────────────────────────────────────────
  const handleRateChange = useCallback((rate: number) => {
    const player = playerRef.current;
    if (!player || !isOwner) return;
    try {
      const ts: number = player.getCurrentTime() ?? 0;
      const playing: boolean = player.getPlayerState() === 1;
      player.setPlaybackRate(rate);
      socket?.syncVideo(ts, playing, rate);
    } catch {}
  }, [isOwner, socket]);

  // ── URL submit ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    const id = extractVideoId(urlInput);
    if (!id) { setUrlError("URL YouTube invalide"); return; }
    setUrlError("");
    setUrlInput("");
    socket?.setVideo(id);
  }, [urlInput, socket]);

  const handleStop = useCallback(() => socket?.stopVideo(), [socket]);

  const volumeIcon = isMuted || volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊";

  return (
    <div id="ambiance-panel" className={open ? "open" : ""}>
      <div className="ambiance-header">
        <span className="ambiance-title">🎵 Ambiance</span>
        <button className="ambiance-close" onClick={onClose} aria-label="Fermer">✕</button>
      </div>

      <div className="ambiance-body">
        {(!hasVideo || isOwner) && (
          <div className="ambiance-url-row">
            <input
              className="ambiance-url-input"
              type="text"
              placeholder={hasVideo ? "Changer de vidéo…" : "Colle un lien YouTube…"}
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setUrlError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <button className="ambiance-launch-btn" onClick={handleSubmit}>▶</button>
          </div>
        )}
        {urlError && <p className="ambiance-error">{urlError}</p>}
        {!hasVideo && (
          <p className="ambiance-hint">La vidéo sera diffusée en synchronisé pour toute la room.</p>
        )}

        {/* Player — always in DOM so the YT player stays alive when panel is closed */}
        <div className="ambiance-player-wrap" style={{ display: hasVideo ? "flex" : "none" }}>
          <div className="ambiance-yt-slot">
            <div ref={playerDivRef} style={{ width: "100%", height: "100%" }} />
            {/* Overlay for non-owners: blocks click-to-pause inside the iframe */}
            {!isOwner && <div className="ambiance-player-overlay" />}
          </div>

          {/* Volume row — visible to everyone */}
          <div className="ambiance-volume-row">
            <button
              className={`ambiance-mute-btn${isMuted || volume === 0 ? " muted" : ""}`}
              onClick={handleMuteToggle}
              title={isMuted || volume === 0 ? "Réactiver le son" : "Couper le son"}
            >
              {volumeIcon}
            </button>
            <input
              type="range"
              className="ambiance-volume-slider"
              min={0}
              max={100}
              step={1}
              value={isMuted ? 0 : volume}
              style={{ "--val": isMuted ? 0 : volume } as React.CSSProperties}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
            />
            <span className="ambiance-volume-label">{isMuted ? 0 : volume}%</span>
          </div>

          {/* Owner controls */}
          {isOwner && (
            <div className="ambiance-owner-controls">
              <div className="ambiance-owner-left">
                <button
                  className="ambiance-playpause-btn"
                  onClick={handlePlayPause}
                  title={isPlaying ? "Pause" : "Lecture"}
                >
                  {isPlaying ? "⏸" : "▶"}
                </button>
                <div className="ambiance-rates">
                  {RATES.map((r) => (
                    <button
                      key={r}
                      className={`ambiance-rate-btn${videoState?.playbackRate === r ? " active" : ""}`}
                      onClick={() => handleRateChange(r)}
                      title={`Vitesse ×${r}`}
                    >
                      ×{r}
                    </button>
                  ))}
                </div>
              </div>
              <button className="ambiance-stop-btn" onClick={handleStop} title="Arrêter la diffusion">
                ⏹ Arrêter
              </button>
            </div>
          )}

          <div className="ambiance-owner-badge">
            {isOwner ? "🎧 Tu diffuses" : `🎧 ${videoState?.ownerName ?? ""}`}
          </div>
        </div>
      </div>
    </div>
  );
}
