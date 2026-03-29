// Synthèse sonore légère — aucun asset externe, tout généré par WebAudio
let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  // Débloquer le contexte si suspendu (politique autoplay navigateur)
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function playTone(
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  attack = 0.01,
  decay = duration,
): void {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = type;
  osc.frequency.value = frequency;
  const now = c.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
  osc.start(now);
  osc.stop(now + decay + 0.05);
}

/** Cloche de fin de focus (ding doux x2) */
export function playPomoDone(): void {
  playTone(880, 0.6, 0.25, "sine", 0.01, 0.55);
  setTimeout(() => playTone(1108, 0.8, 0.2, "sine", 0.01, 0.7), 300);
}

/** Son de pause (tonalité descente) */
export function playPomoBreak(): void {
  playTone(660, 0.4, 0.18, "sine", 0.01, 0.35);
  setTimeout(() => playTone(440, 0.5, 0.15, "sine", 0.01, 0.45), 200);
}

/** Petit "bloip" de pièce */
export function playCoin(): void {
  playTone(1047, 0.12, 0.18, "triangle", 0.005, 0.1);
  setTimeout(() => playTone(1319, 0.12, 0.14, "triangle", 0.005, 0.1), 80);
}

// ── Sons spatiaux (volume 0–1 selon la distance) ────────────────────────────

const MAX_DIST = 10; // tuiles au-delà desquelles le son est inaudible

export function spatialVolume(dist: number): number {
  return Math.max(0, 1 - dist / MAX_DIST);
}

/** Son de chat d'un autre joueur, attenué selon la distance */
export function playChatSpatial(dist: number): void {
  const vol = spatialVolume(dist);
  if (vol <= 0) return;
  playTone(520, 0.08, vol * 0.12, "sine", 0.005, 0.07);
}

/** Notification de mention @nom — court ping distinct */
export function playMention(): void {
  playTone(1320, 0.07, 0.22, "sine", 0.003, 0.06);
  setTimeout(() => playTone(1760, 0.12, 0.18, "sine", 0.003, 0.1), 70);
}

/** Son de pièce d'un autre joueur, attenué selon la distance */
export function playCoinSpatial(dist: number): void {
  const vol = spatialVolume(dist);
  if (vol <= 0) return;
  playTone(1047, 0.12, vol * 0.15, "triangle", 0.005, 0.1);
  setTimeout(() => playTone(1319, 0.12, vol * 0.1, "triangle", 0.005, 0.1), 80);
}
