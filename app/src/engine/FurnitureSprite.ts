import * as PIXI from "pixi.js";
import { TILE_WIDTH, TILE_HEIGHT } from "./IsoEngine";

const CONFIGS: Record<
  string,
  { topColor: number; sideColor: number; h: number; emoji: string; bonus: string }
> = {
  plant:     { topColor: 0x166534, sideColor: 0x14532d, h: 10, emoji: "🪴", bonus: "+2 coins/tache" },
  lamp:      { topColor: 0x92400e, sideColor: 0x78350f, h: 22, emoji: "💡", bonus: "+10 XP/pomo" },
  coffee:    { topColor: 0x374151, sideColor: 0x1f2937, h: 12, emoji: "☕", bonus: "+5 coins/pomo" },
  bookshelf: { topColor: 0x3730a3, sideColor: 0x312e81, h: 20, emoji: "📚", bonus: "+2 coins/tache" },
  couch:     { topColor: 0x7f1d1d, sideColor: 0x5a1e1e, h: 8,  emoji: "🛋️", bonus: "Nettoyage -10" },
};

export class FurnitureSprite {
  readonly container: PIXI.Container;
  private selectRing: PIXI.Graphics;
  private tooltip: PIXI.Container;
  public onSelect?: () => void;

  constructor(itemId: string) {
    this.container = new PIXI.Container();
    this.container.eventMode = "static";
    this.container.cursor = "pointer";

    this.selectRing = new PIXI.Graphics();
    this.container.addChild(this.selectRing);

    this._draw(itemId);

    const bonus = (CONFIGS[itemId] ?? { bonus: "" }).bonus;
    this.tooltip = this._buildTooltip(bonus);
    this.tooltip.visible = false;
    this.container.addChild(this.tooltip);

    this.container.on("pointerover", () => { this.tooltip.visible = true; });
    this.container.on("pointerout",  () => { this.tooltip.visible = false; });
    this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      this.onSelect?.();
    });
  }

  private _buildTooltip(text: string): PIXI.Container {
    const c = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.roundRect(-60, -10, 120, 20, 3);
    bg.fill({ color: 0x0f172a, alpha: 0.88 });
    bg.stroke({ color: 0xfbbf24, width: 1, alpha: 0.8 });
    const label = new PIXI.Text({
      text,
      style: new PIXI.TextStyle({
        fontSize: 10,
        fill: 0xfbbf24,
        fontFamily: "monospace",
        fontWeight: "bold",
      }),
    });
    label.anchor.set(0.5, 0.5);
    c.addChild(bg);
    c.addChild(label);
    c.y = -40;
    return c;
  }

  private _draw(itemId: string): void {
    const cfg = CONFIGS[itemId] ?? { topColor: 0x444444, sideColor: 0x222222, h: 12, emoji: "?", bonus: "" };
    const hw = TILE_WIDTH / 4;
    const hh = TILE_HEIGHT / 4;
    const h  = cfg.h;
    const g = new PIXI.Graphics();
    g.poly([0, -hh - h, hw, -h, 0, hh - h, -hw, -h]);
    g.fill(cfg.topColor);
    g.stroke({ width: 1, color: cfg.sideColor });
    g.poly([-hw, -h, 0, hh - h, 0, hh, -hw, 0]);
    g.fill(cfg.sideColor);
    g.poly([hw, -h, 0, hh - h, 0, hh, hw, 0]);
    g.fill(cfg.topColor + 0x1a1a1a);
    g.stroke({ width: 1, color: cfg.sideColor });
    this.container.addChild(g);
    const icon = new PIXI.Text({
      text: cfg.emoji,
      style: new PIXI.TextStyle({ fontSize: 15 }),
    });
    icon.anchor.set(0.5, 1);
    icon.y = -hh - h - 3;
    this.container.addChild(icon);
  }

  setSelected(selected: boolean): void {
    this.selectRing.clear();
    if (!selected) return;
    const hw = TILE_WIDTH / 4 + 5;
    const hh = TILE_HEIGHT / 4 + 4;
    this.selectRing.poly([0, -hh, hw, 0, 0, hh, -hw, 0]);
    this.selectRing.stroke({ color: 0x60a5fa, width: 2 });
    this.selectRing.fill({ color: 0x60a5fa, alpha: 0.18 });
  }

  destroy(): void {
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
    this.container.destroy({ children: true });
  }
}
