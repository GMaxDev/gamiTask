import * as PIXI from "pixi.js";
import { TILE_WIDTH, TILE_HEIGHT } from "./IsoEngine";

/** Parchemin physique représentant une tâche dans la room. */
export class ScrollSprite {
  readonly container: PIXI.Container;
  private inner: PIXI.Container;
  private bobTicker: PIXI.Ticker | null = null;

  constructor() {
    this.container = new PIXI.Container();
    this.inner = new PIXI.Container();
    this.container.addChild(this.inner);

    // Socle isométrique (mini diamant plat)
    const hw = TILE_WIDTH / 4.5; // ~14px
    const hh = TILE_HEIGHT / 4.5; // ~7px
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
    const t0 = performance.now() + Math.random() * Math.PI * 700; // phase aléatoire
    const ticker = new PIXI.Ticker();
    this.bobTicker = ticker;
    ticker.add(() => {
      const elapsed = (performance.now() - t0) / 1000;
      this.inner.y = Math.sin(elapsed * 1.8) * 2.5;
    });
    ticker.start();
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
      // scale up légèrement puis disparaît (pop effect)
      const scale = progress < 0.2
        ? 1 + progress * 1.5
        : 1.3 - (progress - 0.2) * (1.3 / 0.8);
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
