import * as PIXI from "pixi.js";
import { TILE_WIDTH, TILE_HEIGHT } from "./IsoEngine";

/** Parchemin physique représentant une tâche dans la room. */
export class ScrollSprite {
  readonly container: PIXI.Container;
  private inner: PIXI.Container;
  private bobTicker: PIXI.Ticker | null = null;

  constructor(ownerName: string, taskText: string | null) {
    this.container = new PIXI.Container();
    this.container.eventMode = "static";
    this.inner = new PIXI.Container();
    this.container.addChild(this.inner);

    const hw = TILE_WIDTH / 4.5; // ~14px
    const hh = TILE_HEIGHT / 4.5; // ~7px

    // Ombre au sol (ellipse décalée et aplatie)
    const shadow = new PIXI.Graphics();
    shadow.ellipse(3, 5, hw * 0.85, hh * 0.55);
    shadow.fill({ color: 0x000000, alpha: 0.28 });
    this.inner.addChild(shadow);

    // Socle isométrique (mini diamant plat)
    const base = new PIXI.Graphics();
    base.poly([
      { x: 0, y: -hh },
      { x: hw, y: 0 },
      { x: 0, y: hh },
      { x: -hw, y: 0 },
    ]);
    base.fill({ color: 0xfef3c7, alpha: 0.88 });
    base.poly([
      { x: 0, y: -hh },
      { x: hw, y: 0 },
      { x: 0, y: hh },
      { x: -hw, y: 0 },
    ]);
    base.stroke({ color: 0xd97706, width: 1.2, alpha: 0.9 });
    this.inner.addChild(base);

    // Icône parchemin flottant au-dessus du socle
    const icon = new PIXI.Text({
      text: "📜",
      style: new PIXI.TextStyle({ fontSize: 16 }),
    });
    icon.anchor.set(0.5, 1);
    icon.y = -hh - 3;
    this.inner.addChild(icon);

    // Animation de flottement douce
    const t0 = performance.now() + Math.random() * Math.PI * 700;
    const ticker = new PIXI.Ticker();
    this.bobTicker = ticker;
    ticker.add(() => {
      const elapsed = (performance.now() - t0) / 1000;
      this.inner.y = Math.sin(elapsed * 1.8) * 2.5;
    });
    ticker.start();

    // Infobulle
    const tooltip = this._buildTooltip(ownerName, taskText);
    tooltip.visible = false;
    this.container.addChild(tooltip);

    this.container.on("pointerover", () => {
      tooltip.visible = true;
    });
    this.container.on("pointerout", () => {
      tooltip.visible = false;
    });
  }

  private _buildTooltip(
    ownerName: string,
    taskText: string | null,
  ): PIXI.Container {
    const c = new PIXI.Container();
    const padding = 7;
    const maxCharsPerLine = 26;

    // Ligne d'en-tête : propriétaire
    const lines: string[] = [`📜 ${ownerName}`];

    // Contenu de la tâche (si visible)
    if (taskText) {
      const words = taskText.split(" ");
      let current = "";
      for (const word of words) {
        if (
          current.length + word.length + 1 > maxCharsPerLine &&
          current.length > 0
        ) {
          lines.push(current.trimEnd());
          current = word + " ";
        } else {
          current += word + " ";
        }
      }
      if (current.trim()) lines.push(current.trimEnd());
    }

    // Dimensions estimées (évite un rendu anticipé)
    const charPx = 6;
    const linePx = 14;
    const maxLen = Math.max(...lines.map((l) => l.length));
    const w = Math.max(maxLen * charPx + padding * 2, 72);
    const h = lines.length * linePx + padding * 2;

    const bg = new PIXI.Graphics();
    bg.roundRect(-w / 2, -h, w, h, 4);
    bg.fill({ color: 0x1a0e07, alpha: 0.92 });
    bg.stroke({ color: 0xd97706, width: 1, alpha: 0.85 });

    const label = new PIXI.Text({
      text: lines.join("\n"),
      style: new PIXI.TextStyle({
        fontSize: 10,
        fill: 0xfef3c7,
        fontFamily: "sans-serif",
        align: "center",
      }),
    });
    label.anchor.set(0.5, 1);
    label.y = -padding;

    c.addChild(bg);
    c.addChild(label);
    // Positionner au-dessus de l'icône
    c.y = -52;

    return c;
  }

  /** Animation de disparition (tâche complétée). Appelle onDone quand terminé. */
  popOut(onDone: () => void): void {
    if (this.bobTicker) {
      this.bobTicker.destroy();
      this.bobTicker = null;
    }

    const t0 = performance.now();
    const duration = 400;

    const ticker = new PIXI.Ticker();
    ticker.add(() => {
      const progress = Math.min((performance.now() - t0) / duration, 1);
      const scale =
        progress < 0.2
          ? 1 + progress * 1.5
          : 1.3 - ((progress - 0.2) * 1.3) / 0.8;
      this.container.scale.set(Math.max(0, scale));
      this.container.alpha = 1 - progress;
      if (progress >= 1) {
        ticker.destroy();
        onDone();
      }
    });
    ticker.start();
  }

  destroy(): void {
    if (this.bobTicker) {
      this.bobTicker.destroy();
      this.bobTicker = null;
    }
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
    this.container.destroy({ children: true });
  }
}
