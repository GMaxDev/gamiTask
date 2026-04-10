// Synthèse sonore légère — aucun asset externe, tout généré par WebAudio
let ctx: AudioContext | null = null;

// ── Paramètres globaux des sons ───────────────────────────────────────────
type AmbientType = "cafe" | "pluie" | "nuit";

let soundsEnabled = true;
let masterVolume = 0.8; // 0.0 à 1.0
let ambientEnabled = true;
let ambientType: AmbientType = "cafe";
let ambientNode: {
  source: AudioBufferSourceNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  lowOsc: OscillatorNode;
  lowGain: GainNode;
} | null = null;

// Charger les paramètres depuis localStorage
function loadSoundSettings(): void {
  try {
    const enabled = localStorage.getItem("gamitask-sounds-enabled");
    const volume = localStorage.getItem("gamitask-sounds-volume");
    const ambient = localStorage.getItem("gamitask-sounds-ambient-enabled");
    if (enabled !== null) soundsEnabled = enabled === "true";
    if (volume !== null) masterVolume = Math.max(0, Math.min(1, parseFloat(volume)));
    if (ambient !== null) ambientEnabled = ambient === "true";
    const type = localStorage.getItem("gamitask-sounds-ambient-type");
    if (type === "cafe" || type === "pluie" || type === "nuit") {
      ambientType = type;
    }
  } catch {
    // Ignore les erreurs localStorage
  }
}

// Sauvegarder les paramètres dans localStorage
function saveSoundSettings(): void {
  try {
    localStorage.setItem("gamitask-sounds-enabled", soundsEnabled.toString());
    localStorage.setItem("gamitask-sounds-volume", masterVolume.toString());
    localStorage.setItem("gamitask-sounds-ambient-enabled", ambientEnabled.toString());
    localStorage.setItem("gamitask-sounds-ambient-type", ambientType);
  } catch {
    // Ignore les erreurs localStorage
  }
}

// Initialiser les paramètres au chargement du module
loadSoundSettings();

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  // Débloquer le contexte si suspendu (politique autoplay navigateur)
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function getAmbientPreset(type: AmbientType) {
  switch (type) {
    case "pluie":
      return {
        baseGain: 0.028,
        noiseGain: 0.18,
        filterFreq: 1200,
        filterQ: 0.9,
        lfoRate: 3.2,
        lfoDepth: 0.15,
        extraLowFreq: 120,
      };
    case "nuit":
      return {
        baseGain: 0.03,
        noiseGain: 0.1,
        filterFreq: 260,
        filterQ: 1.1,
        lfoRate: 0.12,
        lfoDepth: 0.04,
        extraLowFreq: 55,
      };
    case "cafe":
    default:
      return {
        baseGain: 0.036,
        noiseGain: 0.16,
        filterFreq: 560,
        filterQ: 1.4,
        lfoRate: 0.22,
        lfoDepth: 0.06,
        extraLowFreq: 80,
      };
  }
}

function createAmbientLoop(): void {
  if (!ambientEnabled || ambientNode) return;
  const c = getCtx();
  const preset = getAmbientPreset(ambientType);

  const noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * preset.noiseGain;
  }

  const source = c.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;

  const filter = c.createBiquadFilter();
  filter.type = ambientType === "pluie" ? "highpass" : "bandpass";
  filter.frequency.value = preset.filterFreq;
  filter.Q.value = preset.filterQ;

  const gain = c.createGain();
  gain.gain.value = 0;

  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = preset.lfoRate;

  const lfoGain = c.createGain();
  lfoGain.gain.value = preset.lfoDepth * masterVolume;

  const lowOsc = c.createOscillator();
  lowOsc.type = "sine";
  lowOsc.frequency.value = preset.extraLowFreq;
  const lowGain = c.createGain();
  lowGain.gain.value = 0.002 * masterVolume;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  lowOsc.connect(lowGain);
  lowGain.connect(c.destination);
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);

  source.start();
  lfo.start();
  lowOsc.start();

  ambientNode = { source, filter, gain, lfo, lfoGain, lowOsc, lowGain };
  updateAmbientGain();
}

function updateAmbientGain(): void {
  if (!ambientNode) return;
  const preset = getAmbientPreset(ambientType);
  const target = soundsEnabled && ambientEnabled ? masterVolume * preset.baseGain : 0;
  ambientNode.gain.gain.setTargetAtTime(target, getCtx().currentTime, 0.5);
}

function stopAmbientLoop(): void {
  if (!ambientNode) return;
  ambientNode.source.stop();
  ambientNode.lfo.stop();
  ambientNode.lowOsc.stop();
  ambientNode.source.disconnect();
  ambientNode.lfo.disconnect();
  ambientNode.lowOsc.disconnect();
  ambientNode.lfoGain.disconnect();
  ambientNode.gain.disconnect();
  ambientNode.filter.disconnect();
  ambientNode.lowGain.disconnect();
  ambientNode = null;
}

function playTone(
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  attack = 0.01,
  decay = duration,
): void {
  if (!soundsEnabled) return;
  if (ambientEnabled) createAmbientLoop();
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = type;
  osc.frequency.value = frequency;
  const now = c.currentTime;
  const finalVolume = volume * masterVolume;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(finalVolume, now + attack);
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

// ── Contrôles des sons ───────────────────────────────────────────────────

/** Activer/désactiver tous les sons */
export function setSoundsEnabled(enabled: boolean): void {
  soundsEnabled = enabled;
  saveSoundSettings();
  if (enabled) {
    createAmbientLoop();
  } else {
    stopAmbientLoop();
  }
  updateAmbientGain();
}

/** Obtenir l'état d'activation des sons */
export function getSoundsEnabled(): boolean {
  return soundsEnabled;
}

export function setAmbientEnabled(enabled: boolean): void {
  ambientEnabled = enabled;
  saveSoundSettings();
  if (enabled) {
    createAmbientLoop();
  } else {
    stopAmbientLoop();
  }
  updateAmbientGain();
}

export function getAmbientEnabled(): boolean {
  return ambientEnabled;
}

export function setAmbientType(type: AmbientType): void {
  ambientType = type;
  saveSoundSettings();
  if (ambientEnabled) {
    stopAmbientLoop();
    createAmbientLoop();
  }
}

export function getAmbientType(): AmbientType {
  return ambientType;
}

/** Définir le volume maître (0.0 à 1.0) */
export function setMasterVolume(volume: number): void {
  masterVolume = Math.max(0, Math.min(1, volume));
  saveSoundSettings();
  updateAmbientGain();
}

/** Obtenir le volume maître */
export function getMasterVolume(): number {
  return masterVolume;
}
