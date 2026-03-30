import * as PIXI from "pixi.js";
import { type GridPos, gridToScreen, isoDepth } from "./IsoEngine";

const STEP_DURATION = 300; // ms par tuile

export type AvatarState = "idle" | "walking" | "focus" | "pause" | "collective";

const STATE_CONFIG: Record<
  AvatarState,
  { bubble: number; auraColor?: number; bobFreq?: number; bobAmp?: number }
> = {
  idle:       { bubble: 0x44ff88 },
  walking:    { bubble: 0x44ff88 },
  focus:      { bubble: 0xff4444, auraColor: 0xff4444, bobFreq: 3.5, bobAmp: 2.5 },
  pause:      { bubble: 0xffaa00, auraColor: 0xffaa00 },
  collective: { bubble: 0xfbbf24, auraColor: 0xfbbf24, bobFreq: 2.2, bobAmp: 2.0 },
};

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

const CHAT_BUBBLE_DURATION = 6000;
const CHAT_BUBBLE_FADE = 1200;
const CHAT_BUBBLE_POP_MS = 350;
const CHAT_MAX_WIDTH = 160;
const CHAT_BUBBLE_BASE_Y = -80;
const CHAT_BUBBLE_GAP = 4;
const CHAT_BUBBLE_MAX = 5;
const CHAT_SHIFT_LERP = 0.18;

const POP_KEYFRAMES = [
  { t: 0.0, s: 0.0 },
  { t: 0.4, s: 1.2 },
  { t: 0.65, s: 0.88 },
  { t: 0.82, s: 1.05 },
  { t: 1.0, s: 1.0 },
];

function samplePop(progress: number): number {
  for (let i = 1; i < POP_KEYFRAMES.length; i++) {
    const a = POP_KEYFRAMES[i - 1];
    const b = POP_KEYFRAMES[i];
    if (progress <= b.t) {
      const localT = (progress - a.t) / (b.t - a.t);
      return a.s + (b.s - a.s) * localT;
    }
  }
  return 1;
}

interface ChatBubbleEntry {
  container: PIXI.Container;
  totalHeight: number;
  targetY: number;
  popStart: number;
  fadeStart: number;
  endAt: number;
  ticker: PIXI.Ticker;
}

export class AvatarSprite {
  public container: PIXI.Container;     // outer: world position + zIndex
  private bodyWrap: PIXI.Container;     // inner: receives bob animation
  private aura: PIXI.Graphics;          // glow ring drawn behind body
  private body: PIXI.Graphics;          // avatar figure
  private label: PIXI.Text;
  private color: number;
  private chatStack: ChatBubbleEntry[] = [];

  private currentBubble = 0x44ff88;
  private walkGeneration = 0;
  private walkTicker: PIXI.Ticker | null = null;
  private focusTicker: PIXI.Ticker | null = null;
  private bobPhase: number;
  private hatSprite: PIXI.Text | null = null;

  public col: number = 0;
  public row: number = 0;
  public walkTargetCol: number = 0;
  public walkTargetRow: number = 0;
  public state: AvatarState = "idle";
  public baseState: AvatarState = "idle"; // état réel hors marche

  constructor(name: string, color: number) {
    this.color = color;
    this.bobPhase = Math.random() * Math.PI * 2; // offset pour désynchroniser les avatars
    this.container = new PIXI.Container();
    this.bodyWrap = new PIXI.Container();
    this.aura = new PIXI.Graphics();
    this.body = new PIXI.Graphics();
    this.label = new PIXI.Text({
      text: name,
      style: { fontSize: 13, fill: 0xffffff, fontFamily: "monospace" },
    });
    // aura doit être derrière body
    this.bodyWrap.addChild(this.aura);
    this.bodyWrap.addChild(this.body);
    this.bodyWrap.addChild(this.label);
    this.container.addChild(this.bodyWrap);
  }

  /** Affiche une bulle de chat ; les bulles s\'empilent bas→haut façon Habbo */
  showChatBubble(text: string): void {
    if (this.chatStack.length >= CHAT_BUBBLE_MAX) {
      const oldest = this.chatStack[this.chatStack.length - 1];
      oldest.ticker.destroy();
      this.bodyWrap.removeChild(oldest.container);
      this.chatStack.pop();
    }

    const truncated = text.length > 60 ? text.slice(0, 57) + "\u2026" : text;
    const txt = new PIXI.Text({
      text: truncated,
      style: {
        fontSize: 12,
        fill: 0x1a1a2e,
        fontFamily: "sans-serif",
        wordWrap: true,
        wordWrapWidth: CHAT_MAX_WIDTH - 16,
        align: "center",
      },
    });
    txt.anchor.set(0.5, 0);

    const bw = Math.min(txt.width + 16, CHAT_MAX_WIDTH);
    const bh = txt.height + 12;
    const tailH = 8;
    const totalH = bh + tailH;

    const bg = new PIXI.Graphics();
    bg.roundRect(-bw / 2, 0, bw, bh, 8);
    bg.fill(0xffffff);
    bg.stroke({ width: 1.5, color: this.color });
    bg.poly([-6, bh, 6, bh, 0, bh + tailH]);
    bg.fill(0xffffff);

    txt.x = 0;
    txt.y = 6;

    const bubble = new PIXI.Container();
    bubble.addChild(bg);
    bubble.addChild(txt);
    bubble.pivot.set(0, totalH);
    bubble.x = 0;
    bubble.scale.set(0);
    bubble.alpha = 1;

    this.bodyWrap.addChild(bubble);

    const now = performance.now();
    const entry: ChatBubbleEntry = {
      container: bubble,
      totalHeight: totalH,
      targetY: CHAT_BUBBLE_BASE_Y,
      popStart: now,
      fadeStart: now + CHAT_BUBBLE_DURATION,
      endAt: now + CHAT_BUBBLE_DURATION + CHAT_BUBBLE_FADE,
      ticker: null as unknown as PIXI.Ticker,
    };

    this.chatStack.unshift(entry);
    bubble.y = CHAT_BUBBLE_BASE_Y;
    this._restack();

    const ticker = new PIXI.Ticker();
    entry.ticker = ticker;

    ticker.add(() => {
      const t = performance.now();
      bubble.y += (entry.targetY - bubble.y) * CHAT_SHIFT_LERP;

      const popProgress = (t - entry.popStart) / CHAT_BUBBLE_POP_MS;
      bubble.scale.set(
        popProgress < 1 ? samplePop(Math.min(popProgress, 1)) : 1,
      );

      if (t >= entry.fadeStart) {
        bubble.alpha = Math.max(0, (entry.endAt - t) / CHAT_BUBBLE_FADE);
      }

      if (t >= entry.endAt) {
        ticker.destroy();
        this.bodyWrap.removeChild(bubble);
        const idx = this.chatStack.indexOf(entry);
        if (idx !== -1) this.chatStack.splice(idx, 1);
        this._restack();
      }
    });
    ticker.start();
  }

  /** Bulle de récompense (+10\u{1FA99}) : pilule flottante sans queue */
  showCoinBubble(text: string): void {
    const txt = new PIXI.Text({
      text,
      style: {
        fontSize: 14,
        fill: 0xfbbf24,
        fontFamily: "monospace",
        fontWeight: "bold",
      },
    });
    txt.anchor.set(0.5, 0.5);

    const pw = txt.width + 22;
    const ph = txt.height + 10;

    const bg = new PIXI.Graphics();
    bg.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
    bg.fill({ color: 0x0d0d1a, alpha: 0.92 });
    bg.stroke({ width: 2, color: this.color });

    const bubble = new PIXI.Container();
    bubble.addChild(bg);
    bubble.addChild(txt);
    bubble.x = 0;
    bubble.y = CHAT_BUBBLE_BASE_Y - 10;
    bubble.scale.set(0);
    bubble.alpha = 1;
    this.bodyWrap.addChild(bubble);

    const DURATION = 4000;
    const FADE = 700;
    const POP_MS = 320;
    const FLOAT = 50;
    const now = performance.now();
    const endAt = now + DURATION;
    const fadeStart = endAt - FADE;
    const startY = bubble.y;

    const ticker = new PIXI.Ticker();
    ticker.add(() => {
      const t = performance.now();
      const elapsed = t - now;
      const popP = elapsed / POP_MS;
      bubble.scale.set(popP < 1 ? samplePop(Math.min(popP, 1)) : 1);
      bubble.y = startY - FLOAT * easeInOut(Math.min(elapsed / DURATION, 1));
      if (t >= fadeStart) {
        bubble.alpha = Math.max(0, (endAt - t) / FADE);
      }
      if (t >= endAt) {
        ticker.destroy();
        this.bodyWrap.removeChild(bubble);
      }
    });
    ticker.start();
  }

  private _restack(): void {
    let y = CHAT_BUBBLE_BASE_Y;
    for (const entry of this.chatStack) {
      entry.targetY = y;
      y -= entry.totalHeight + CHAT_BUBBLE_GAP;
    }
  }

  /** Affiche une grosse émote flottante style Dofus au-dessus de l'avatar */
  showEmote(emoji: string): void {
    const EMOTE_DURATION = 2800;
    const EMOTE_FADE = 600;
    const EMOTE_POP_MS = 400;
    const EMOTE_FLOAT = 35;
    const EMOTE_BASE_Y = -90;

    const txt = new PIXI.Text({
      text: emoji,
      style: { fontSize: 28, fontFamily: "sans-serif" },
    });
    txt.anchor.set(0.5, 0.5);

    const container = new PIXI.Container();
    container.addChild(txt);
    container.x = 0;
    container.y = EMOTE_BASE_Y;
    container.scale.set(0);
    container.alpha = 1;
    this.bodyWrap.addChild(container);

    const now = performance.now();
    const endAt = now + EMOTE_DURATION;
    const fadeStart = endAt - EMOTE_FADE;
    const startY = EMOTE_BASE_Y;

    const ticker = new PIXI.Ticker();
    ticker.add(() => {
      const t = performance.now();
      const elapsed = t - now;
      // Pop-in bouncé
      const popP = elapsed / EMOTE_POP_MS;
      container.scale.set(popP < 1 ? samplePop(Math.min(popP, 1)) * 1.0 : 1.0);
      // Flotte vers le haut
      container.y = startY - EMOTE_FLOAT * easeInOut(Math.min(elapsed / EMOTE_DURATION, 1));
      // Fade-out
      if (t >= fadeStart) {
        container.alpha = Math.max(0, (endAt - t) / EMOTE_FADE);
      }
      if (t >= endAt) {
        ticker.destroy();
        if (container.parent) this.bodyWrap.removeChild(container);
        container.destroy({ children: true });
      }
    });
    ticker.start();
  }

  init(col: number, row: number, offsetX: number, offsetY: number): void {
    this.col = col;
    this.row = row;
    this.walkTargetCol = col;
    this.walkTargetRow = row;
    this.placeAt(col, row, offsetX, offsetY);
    this.drawAll();
  }

  private placeAt(
    col: number,
    row: number,
    offsetX: number,
    offsetY: number,
  ): void {
    const pos = gridToScreen(col, row, offsetX, offsetY);
    this.container.x = pos.x;
    this.container.y = pos.y;
    this.container.zIndex = isoDepth(col, row) + 1;
  }

  /** Dessine l\'aura colorée en fonction de l\'état courant */
  private drawAura(): void {
    this.aura.clear();
    const cfg = STATE_CONFIG[this.state];
    if (!cfg.auraColor) return;
    // Disque extérieur très transparent
    this.aura.circle(0, -24, 26);
    this.aura.fill({ color: cfg.auraColor, alpha: 0.18 });
    // Disque intérieur légèrement plus opaque
    this.aura.circle(0, -24, 16);
    this.aura.fill({ color: cfg.auraColor, alpha: 0.12 });
  }

  // Dessine tout l\'avatar (corps + bulle de statut) dans un seul Graphics
  private drawAll(): void {
    this.drawAura();
    this.body.clear();

    // Ombre au sol
    this.body.ellipse(0, 4, 14, 6);
    this.body.fill({ color: 0x000000, alpha: 0.3 });
    // Tronc
    this.body.roundRect(-8, -28, 16, 24, 6);
    this.body.fill(this.color);
    // Tête
    this.body.circle(0, -36, 10);
    this.body.fill(this.color);
    // Yeux
    this.body.circle(-3, -37, 2);
    this.body.fill(0xffffff);
    this.body.circle(3, -37, 2);
    this.body.fill(0xffffff);

    // Label nom (remonté si un chapeau est actif)
    this.label.anchor.set(0.5, 1);
    this.label.x = 0;
    this.label.y = this.hatSprite ? -70 : -50;

    // Bulle de statut — à droite du label, centrée verticalement
    const lw = this.label.width;
    const bx = lw / 2 + 10;
    const by = this.label.y - 7;
    this.body.circle(bx, by, 7);
    this.body.fill(0xffffff);
    this.body.circle(bx, by, 5);
    this.body.fill(this.currentBubble);
  }

  setState(state: AvatarState): void {
    if (state !== "walking") this.baseState = state;
    this.state = state;
    this.currentBubble = STATE_CONFIG[state].bubble;

    // Arrêter l\'animation précédente
    if (this.focusTicker) {
      this.focusTicker.destroy();
      this.focusTicker = null;
      this.bodyWrap.y = 0;
    }

    this.drawAll();

    // Démarrer la nouvelle animation si l\'état le demande
    const cfg = STATE_CONFIG[state];
    if (cfg.bobFreq && cfg.bobAmp) {
      const t0 = performance.now();
      const { bobFreq, bobAmp, auraColor } = cfg;
      const ticker = new PIXI.Ticker();
      this.focusTicker = ticker;
      ticker.add(() => {
        const elapsed = (performance.now() - t0) / 1000;
        // Oscillation verticale douce
        this.bodyWrap.y = Math.sin(elapsed * bobFreq + this.bobPhase) * bobAmp;
        // Pulsation de l\'aura
        if (auraColor) {
          const pulse = 0.12 + 0.10 * Math.sin(elapsed * 1.5 + this.bobPhase);
          this.aura.clear();
          this.aura.circle(0, -24, 26);
          this.aura.fill({ color: auraColor, alpha: pulse + 0.06 });
          this.aura.circle(0, -24, 16);
          this.aura.fill({ color: auraColor, alpha: pulse });
        }
      });
      ticker.start();
    }
    // Pour "pause", l\'aura statique est déjà dessinée par drawAura()
  }
  /** Applique ou retire le chapeau cosmétique sur l'avatar */
  setHat(hatId: string | null): void {
    if (this.hatSprite) {
      this.bodyWrap.removeChild(this.hatSprite);
      this.hatSprite.destroy();
      this.hatSprite = null;
    }
    if (!hatId) {
      this.label.y = -50; // plus de chapeau → label revient à sa position normale
      this.drawAll(); // recalcule la position de la bulle de statut
      return;
    }
    const HAT_EMOJIS: Record<string, string> = {
      "hat-party": "🎉",
      "hat-halo": "😇",
      "hat-crown": "👑",
      "hat-cowboy": "🤠",
      "hat-wizard": "🧙",
    };
    const emoji = HAT_EMOJIS[hatId];
    if (!emoji) return;
    const sprite = new PIXI.Text({
      text: emoji,
      style: new PIXI.TextStyle({ fontSize: 18 }),
    });
    sprite.anchor.set(0.5, 1);
    sprite.x = 0;
    sprite.y = -46; // sommet de la tête
    this.bodyWrap.addChild(sprite);
    this.hatSprite = sprite;
    this.label.y = -70; // remonte le label au-dessus du chapeau
    this.drawAll(); // recalcule la position de la bulle de statut
  }
  walkPath(
    path: GridPos[],
    offsetX: number,
    offsetY: number,
    onStep?: () => void,
    finalState: AvatarState = "idle",
    onDone?: () => void,
  ): void {
    if (path.length === 0) return;

    const myGen = ++this.walkGeneration;
    if (this.walkTicker) {
      this.walkTicker.destroy();
      this.walkTicker = null;
    }

    // Initialiser baseState depuis finalState (peut être mis à jour pendant la marche)
    this.baseState = finalState;
    this.setState("walking");
    // Pendant la marche, la bulle garde la couleur de l'état actif (pomo)
    if (finalState !== "idle") {
      this.currentBubble = STATE_CONFIG[finalState].bubble;
      this.drawAll();
    }
    let stepIndex = 0;

    const moveToNext = (): void => {
      if (myGen !== this.walkGeneration) return;

      if (stepIndex >= path.length) {
        this.setState(this.baseState); // baseState peut avoir été mis à jour pendant la marche (ex: pomo démarré)
        onDone?.();
        return;
      }

      const target = path[stepIndex++];
      this.walkTargetCol = target.col;
      this.walkTargetRow = target.row;
      const targetPos = gridToScreen(target.col, target.row, offsetX, offsetY);
      const startX = this.container.x;
      const startY = this.container.y;
      const dx = targetPos.x - startX;
      const dy = targetPos.y - startY;
      const startTime = performance.now();

      const ticker = new PIXI.Ticker();
      this.walkTicker = ticker;
      ticker.add(() => {
        if (myGen !== this.walkGeneration) {
          ticker.destroy();
          return;
        }
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / STEP_DURATION, 1);
        const ease = easeInOut(t);
        this.container.x = startX + dx * ease;
        this.container.y = startY + dy * ease - Math.sin(t * Math.PI) * 6;
        this.container.zIndex = isoDepth(target.col, target.row) + 1;
        if (t >= 1) {
          this.col = target.col;
          this.row = target.row;
          this.container.x = targetPos.x;
          this.container.y = targetPos.y;
          this.walkTicker = null;
          ticker.destroy();
          onStep?.();
          moveToNext();
        }
      });
      ticker.start();
    };

    moveToNext();
  }
}
