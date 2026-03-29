import * as PIXI from "pixi.js";
import {
  type GridPos,
  TILE_HEIGHT,
  TILE_WIDTH,
  gridToScreen,
  isoDepth,
  screenToGrid,
} from "./IsoEngine";
import { AvatarSprite, type AvatarState } from "./AvatarSprite";
import { ScrollSprite } from "./ScrollSprite";
import { FurnitureSprite } from "./FurnitureSprite";
import { findPath } from "./Pathfinding";

export const GRID_COLS = 12;
export const GRID_ROWS = 12;

// Tiles that are blocked (walls, furniture)
const BLOCKED: Set<string> = new Set([
  "3,3",
  "3,4",
  "4,3", // desk cluster top-left
  "8,3",
  "8,4",
  "9,3", // desk cluster top-right
  "3,8",
  "3,9",
  "4,8", // desk cluster bottom-left
  "8,8",
  "8,9",
  "9,8", // desk cluster bottom-right
]);

export function isBlocked(col: number, row: number): boolean {
  return BLOCKED.has(`${col},${row}`);
}

const GUARDIAN_MSGS = [
  "",
  "ta room te manque...",
  "nettoie-moi...",
  "je souffre...",
  "reviens...",
  "c'est la fin...",
];

export class GameScene {
  public app: PIXI.Application;
  private worldContainer: PIXI.Container;
  private tileLayer: PIXI.Container;
  private spriteLayer: PIXI.Container;
  private localAvatar: AvatarSprite;
  private remoteAvatars = new Map<string, AvatarSprite>();
  private scrollMap = new Map<string, { sprite: ScrollSprite; col: number; row: number }>();
  private furnitureSprites = new Map<string, FurnitureSprite>();
  private offsetX: number;
  private offsetY: number;
  private resumeState: AvatarState = "idle";
  private pendingMoveItemId: string | null = null;
  private occupiedCells = new Set<string>();
  private currentPositions: Record<string, { col: number; row: number }> = {};
  private ghostItemId: string | null = null;
  private ghostSprite: FurnitureSprite | null = null;
  private ghostHighlight: PIXI.Graphics | null = null;
  private _ghostMoveHandler?: (e: PointerEvent) => void;
  private _ghostEscapeHandler?: (e: KeyboardEvent) => void;
  public onFurnitureMoved?: (itemId: string, col: number, row: number) => void;
  public onFurniturePlaced?: (itemId: string, col: number, row: number) => void;

  // Positions candidates pour les parchemins (hors BLOCKED, près des bureaux)
  private static readonly SCROLL_TILE_POOL: [number, number][] = [
    [2, 3], [3, 2], [5, 3], [5, 4],
    [10, 3], [10, 4], [6, 3], [7, 4],
    [2, 8], [2, 9], [5, 8], [4, 7],
    [10, 8], [10, 9], [6, 8], [7, 7],
  ];

  // Positions fixes du mobilier Feng Shui
  private static readonly FURNITURE_SLOTS: Record<string, { col: number; row: number }> = {
    plant:     { col: 1,  row: 5  },
    lamp:      { col: 6,  row: 1  },
    coffee:    { col: 10, row: 5  },
    bookshelf: { col: 6,  row: 10 },
    couch:     { col: 1,  row: 10 },
  };

  // Called when the local player finishes moving to a new tile
  public onLocalMove?: (col: number, row: number) => void;
  // Called when the local avatar's state changes (walking start/end)
  public onLocalStateChange?: (state: AvatarState) => void;

  constructor(localName = "Vous", localColor = 0x4f8ef7) {
    this.app = new PIXI.Application();
    // We init async below
    this.worldContainer = new PIXI.Container();
    this.tileLayer = new PIXI.Container();
    this.spriteLayer = new PIXI.Container();
    this.localAvatar = new AvatarSprite(localName, localColor);
    this.offsetX = 0;
    this.offsetY = 0;
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      resizeTo: window,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // Use worldContainer as the centering layer (offsetX/Y remain 0)
    this.offsetX = 0;
    this.offsetY = 0;
    this.worldContainer.x = this.app.screen.width / 2;
    this.worldContainer.y = TILE_HEIGHT * 2;
    // Zoom légèrement par défaut pour que la scène ne soit pas trop petite
    this.worldContainer.scale.set(1.5);

    // Mise à jour du hitArea uniquement (ne pas écraser la position si l'utilisateur a zoomé)
    this.app.renderer.on("resize", () => {
      this.app.stage.hitArea = this.app.screen;
    });

    // Zoom molette vers le curseur
    canvas.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const prevScale = this.worldContainer.scale.x;
        const newScale = Math.max(0.4, Math.min(4.0, prevScale * factor));
        // Zoom centré sur le curseur
        const mx = e.clientX;
        const my = e.clientY;
        this.worldContainer.x =
          mx + (this.worldContainer.x - mx) * (newScale / prevScale);
        this.worldContainer.y =
          my + (this.worldContainer.y - my) * (newScale / prevScale);
        this.worldContainer.scale.set(newScale);
      },
      { passive: false },
    );

    // Drag to pan (clic droit ou clic gauche maintenu + glissement sans relâcher hors de la tuile)
    let dragStart: { x: number; y: number; wx: number; wy: number } | null =
      null;
    let isDragging = false;
    canvas.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.button === 2 && this.ghostItemId !== null) {
        this.cancelGhostPlacement();
        return;
      }
      if (e.button !== 2) return; // clic droit = pan
      dragStart = {
        x: e.clientX,
        y: e.clientY,
        wx: this.worldContainer.x,
        wy: this.worldContainer.y,
      };
      isDragging = false;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e: PointerEvent) => {
      if (!dragStart) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4))
        isDragging = true;
      if (isDragging) {
        this.worldContainer.x = dragStart.wx + dx;
        this.worldContainer.y = dragStart.wy + dy;
      }
    });
    canvas.addEventListener("pointerup", () => {
      dragStart = null;
      isDragging = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.worldContainer.addChild(this.tileLayer);
    this.worldContainer.addChild(this.spriteLayer);
    this.app.stage.addChild(this.worldContainer);

    this.buildTiles();
    this.buildFurniture();
    this.initLocalAvatar();
    this.setupClickHandler();

    this.initialized = true;
  }

  private buildTiles(): void {
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const tile = this.createTile(col, row);
        this.tileLayer.addChild(tile);
      }
    }
  }

  private createTile(col: number, row: number): PIXI.Graphics {
    const pos = gridToScreen(col, row, this.offsetX, this.offsetY);
    const g = new PIXI.Graphics();

    const blocked = isBlocked(col, row);
    const fillColor = blocked ? 0x3d2b1f : 0x16213e;
    const strokeColor = blocked ? 0x7a5c3f : 0x0f3460;

    g.poly([
      pos.x,
      pos.y - TILE_HEIGHT / 2,
      pos.x + TILE_WIDTH / 2,
      pos.y,
      pos.x,
      pos.y + TILE_HEIGHT / 2,
      pos.x - TILE_WIDTH / 2,
      pos.y,
    ]);
    g.fill(fillColor);
    g.stroke({ width: 1, color: strokeColor });
    g.zIndex = isoDepth(col, row);

    // Hover highlight on walkable tiles
    if (!blocked) {
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerover", () => {
        g.tint = 0xaaaaff;
      });
      g.on("pointerout", () => {
        g.tint = 0xffffff;
      });
    }

    return g;
  }

  private buildFurniture(): void {
    // Draw simple desk sprites on blocked tiles
    const deskPositions: GridPos[] = [
      { col: 3, row: 3 },
      { col: 8, row: 3 },
      { col: 3, row: 8 },
      { col: 8, row: 8 },
    ];

    for (const { col, row } of deskPositions) {
      const pos = gridToScreen(col, row, this.offsetX, this.offsetY);
      const desk = new PIXI.Graphics();
      // Table top (diamond shape, raised)
      const lift = 12;
      desk.poly([
        pos.x,
        pos.y - TILE_HEIGHT / 2 - lift,
        pos.x + TILE_WIDTH / 2,
        pos.y - lift,
        pos.x,
        pos.y + TILE_HEIGHT / 2 - lift,
        pos.x - TILE_WIDTH / 2,
        pos.y - lift,
      ]);
      desk.fill(0x8b5e3c);
      desk.stroke({ width: 1, color: 0x5c3a1e });
      // Table legs (left face)
      desk.rect(pos.x - TILE_WIDTH / 2, pos.y - lift, 8, lift);
      desk.fill(0x5c3a1e);
      // Table legs (right face)
      desk.rect(pos.x + TILE_WIDTH / 2 - 8, pos.y - lift, 8, lift);
      desk.fill(0x5c3a1e);
      desk.zIndex = isoDepth(col, row) + 0.5;
      this.spriteLayer.addChild(desk);
    }
  }

  private initLocalAvatar(): void {
    // Random start near center to avoid stacking when multiple players join
    const startCol = 4 + Math.floor(Math.random() * 5); // 4–8
    const startRow = 4 + Math.floor(Math.random() * 5); // 4–8
    this.localAvatar.init(startCol, startRow, this.offsetX, this.offsetY);
    this.spriteLayer.addChild(this.localAvatar.container);
    this.updateSpriteDepth();
  }

  private setupClickHandler(): void {
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;

    this.app.stage.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
      // Ignorer le clic droit (réservé au drag-to-pan)
      if (e.button !== 0) return;

      // toLocal() gère automatiquement le zoom et la translation du worldContainer
      const local = this.worldContainer.toLocal(e.global);
      const target = screenToGrid(local.x, local.y, 0, 0);

      // Rejeter si hors de la grille (ne pas clamper au bord)
      const col = Math.round(target.col);
      const row = Math.round(target.row);
      if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;

      // Mode placement fantôme : clic confirme la position
      if (this.ghostItemId !== null) {
        if (!isBlocked(col, row) && !this.occupiedCells.has(`${col},${row}`)) {
          const itemId = this.ghostItemId;
          this.cancelGhostPlacement();
          const { x, y } = gridToScreen(col, row, this.offsetX, this.offsetY);
          const sprite = new FurnitureSprite(itemId);
          sprite.container.x = x;
          sprite.container.y = y;
          sprite.container.zIndex = isoDepth(col, row) + 0.4;
          sprite.onSelect = () => this._selectFurnitureForMove(itemId);
          this.spriteLayer.addChild(sprite.container);
          this.furnitureSprites.set(itemId, sprite);
          this.occupiedCells.add(`${col},${row}`);
          this.currentPositions[itemId] = { col, row };
          this.onFurniturePlaced?.(itemId, col, row);
          this.updateSpriteDepth();
        }
        return;
      }

      // Mode déplacement de meuble : clic sur tuile place le meuble sélectionné
      if (this.pendingMoveItemId !== null) {
        if (!isBlocked(col, row)) {
          const itemId = this.pendingMoveItemId;
          const oldPos = this.currentPositions[itemId];
          const isOwnCell = !!oldPos && oldPos.col === col && oldPos.row === row;
          if (!this.occupiedCells.has(`${col},${row}`) || isOwnCell) {
            const sprite = this.furnitureSprites.get(itemId);
            if (sprite) {
              const { x, y } = gridToScreen(col, row, this.offsetX, this.offsetY);
              sprite.container.x = x;
              sprite.container.y = y;
              sprite.container.zIndex = isoDepth(col, row) + 0.4;
              sprite.setSelected(false);
            }
            if (oldPos) this.occupiedCells.delete(`${oldPos.col},${oldPos.row}`);
            this.occupiedCells.add(`${col},${row}`);
            this.currentPositions[itemId] = { col, row };
            this.pendingMoveItemId = null;
            this.onFurnitureMoved?.(itemId, col, row);
          }
        }
        return;
      }

      if (isBlocked(col, row)) return;

      const path = findPath(
        { col: this.localAvatar.walkTargetCol, row: this.localAvatar.walkTargetRow },
        { col, row },
        GRID_COLS,
        GRID_ROWS,
        isBlocked,
      );

      if (path.length > 0) {
        this.onLocalStateChange?.("walking");
        this.localAvatar.walkPath(
          path,
          this.offsetX,
          this.offsetY,
          () => {
            this.updateSpriteDepth();
            this.onLocalMove?.(this.localAvatar.col, this.localAvatar.row);
          },
          this.resumeState,
          () => {
            this.onLocalStateChange?.(this.resumeState);
          },
        );
      }
    });
  }

  private updateSpriteDepth(): void {
    this.spriteLayer.sortableChildren = true;
    // Children already have zIndex set on construction — sortChildren() re-orders them.
    this.spriteLayer.sortChildren();
  }

  public initialized = false;
  private _degradationLevel = 0;
  private guardianNPC: PIXI.Container | null = null;
  private guardianLabel: PIXI.Text | null = null;
  private guardianTicker: ((delta: PIXI.Ticker) => void) | null = null;

  /** Applique un tint progressivement plus sale selon le niveau de dégradation (0-5) */
  setDegradationLevel(level: number): void {
    this._degradationLevel = Math.min(5, Math.max(0, level));
    // Tints du plus propre au plus dégradé : blanc → brun-jaune sale
    const tints = [0xffffff, 0xf5ead8, 0xe8d4a8, 0xd4b870, 0xb89040, 0x8a6020];
    this.worldContainer.tint = tints[this._degradationLevel];
    if (this._degradationLevel > 0) {
      if (!this.guardianNPC) {
        this._showGuardianNPC();
      } else if (this.guardianLabel) {
        this.guardianLabel.text = GUARDIAN_MSGS[this._degradationLevel];
      }
    } else {
      this._hideGuardianNPC();
    }
  }

  private _showGuardianNPC(): void {
    const npc = new PIXI.Container();

    // Corps : cercle fantôme translucide
    const g = new PIXI.Graphics();
    g.circle(0, -4, 15);
    g.fill({ color: 0xc4cfe8, alpha: 0.72 });
    // Yeux tristes
    g.ellipse(-5, -5, 2.5, 3);
    g.fill({ color: 0x3a4a6a });
    g.ellipse(5, -5, 2.5, 3);
    g.fill({ color: 0x3a4a6a });
    // Bouche triste
    g.moveTo(-5, 5);
    g.quadraticCurveTo(0, 2, 5, 5);
    g.stroke({ color: 0x3a4a6a, width: 1.5 });
    npc.addChild(g);

    // Label
    const label = new PIXI.Text({
      text: GUARDIAN_MSGS[this._degradationLevel],
      style: new PIXI.TextStyle({
        fontSize: 9,
        fill: 0x8899bb,
        fontFamily: "sans-serif",
      }),
    });
    label.anchor.set(0.5, 0);
    label.y = 15;
    npc.addChild(label);
    this.guardianLabel = label;

    // Position : centre de la room (col=6, row=6)
    const { x, y } = gridToScreen(6, 6, 0, 0);
    npc.x = x;
    npc.y = y - 10;
    npc.alpha = 0;
    npc.zIndex = isoDepth(6, 6);
    this.spriteLayer.addChild(npc);
    this.guardianNPC = npc;

    // Animation bob + fade-in
    let phase = Math.random() * Math.PI * 2;
    const baseY = npc.y;
    const ticker = (delta: PIXI.Ticker) => {
      phase += delta.deltaTime * 0.025;
      if (!this.guardianNPC) return;
      this.guardianNPC.y = baseY + Math.sin(phase) * 5;
      this.guardianNPC.alpha = Math.min(
        0.85,
        this.guardianNPC.alpha + delta.deltaTime * 0.03,
      );
    };
    this.guardianTicker = ticker;
    this.app.ticker.add(ticker);
  }

  private _hideGuardianNPC(): void {
    if (!this.guardianNPC) return;
    if (this.guardianTicker) {
      this.app.ticker.remove(this.guardianTicker);
      this.guardianTicker = null;
    }
    this.spriteLayer.removeChild(this.guardianNPC);
    this.guardianNPC.destroy({ children: true });
    this.guardianNPC = null;
    this.guardianLabel = null;
  }

  setAvatarState(state: AvatarState): void {
    this.resumeState = state;
    this.localAvatar.setState(state);
    this._updateFocusDim();
  }

  /** Estompe les avatars distants non-focus quand le joueur local est en focus */
  private _updateFocusDim(): void {
    const localFocused =
      this.resumeState === "focus" || this.resumeState === "collective";
    for (const [, avatar] of this.remoteAvatars) {
      const remoteFocused =
        avatar.state === "focus" || avatar.state === "collective";
      avatar.container.alpha = localFocused && !remoteFocused ? 0.38 : 1.0;
    }
  }

  zoomIn(): void {
    const s = Math.min(4.0, this.worldContainer.scale.x * 1.15);
    this.worldContainer.scale.set(s);
  }

  zoomOut(): void {
    const s = Math.max(0.4, this.worldContainer.scale.x / 1.15);
    this.worldContainer.scale.set(s);
  }

  centerView(): void {
    const ax = this.localAvatar.container.x;
    const ay = this.localAvatar.container.y;
    const s = this.worldContainer.scale.x;
    this.worldContainer.x = this.app.screen.width / 2 - ax * s;
    this.worldContainer.y = this.app.screen.height / 2 - ay * s;
  }

  get localCol(): number {
    return this.localAvatar.col;
  }
  get localRow(): number {
    return this.localAvatar.row;
  }

  /** Distance de Chebyshev entre l'avatar local et un avatar distant */
  distanceTo(id: string): number {
    const remote = this.remoteAvatars.get(id);
    if (!remote) return Infinity;
    return Math.max(
      Math.abs(this.localAvatar.col - remote.col),
      Math.abs(this.localAvatar.row - remote.row),
    );
  }

  getLocalAvatarState(): AvatarState {
    return this.localAvatar.state;
  }

  /** Repositionne l'avatar local instantanément (position persistante) */
  teleportLocalAvatar(col: number, row: number): void {
    this.localAvatar.init(col, row, this.offsetX, this.offsetY);
    this.updateSpriteDepth();
  }

  // ── Remote avatars ────────────────────────────────────────────────────────

  addRemoteAvatar(
    id: string,
    name: string,
    color: number,
    col: number,
    row: number,
    hat?: string | null,
  ): void {
    if (this.remoteAvatars.has(id)) return;
    const avatar = new AvatarSprite(name, color);
    avatar.init(col, row, this.offsetX, this.offsetY);
    if (hat) avatar.setHat(hat);
    this.spriteLayer.addChild(avatar.container);
    this.remoteAvatars.set(id, avatar);
    this.updateSpriteDepth();
  }

  removeRemoteAvatar(id: string): void {
    const avatar = this.remoteAvatars.get(id);
    if (!avatar) return;
    this.spriteLayer.removeChild(avatar.container);
    this.remoteAvatars.delete(id);
  }

  moveRemoteAvatar(id: string, col: number, row: number): void {
    const avatar = this.remoteAvatars.get(id);
    if (!avatar) return;
    const path = findPath(
      { col: avatar.col, row: avatar.row },
      { col, row },
      GRID_COLS,
      GRID_ROWS,
      isBlocked,
    );
    if (path.length > 0) {
      avatar.walkPath(
        path,
        this.offsetX,
        this.offsetY,
        () => {
          this.updateSpriteDepth();
        },
        avatar.state,
      );
    } else {
      // Teleport if no path (edge case)
      avatar.init(col, row, this.offsetX, this.offsetY);
    }
  }

  setRemoteAvatarState(id: string, state: AvatarState): void {
    const avatar = this.remoteAvatars.get(id);
    if (!avatar) return;
    avatar.setState(state);
    this._updateFocusDim();
  }

  setLocalHat(hatId: string | null): void {
    this.localAvatar.setHat(hatId);
  }

  setRemoteHat(socketId: string, hatId: string | null): void {
    this.remoteAvatars.get(socketId)?.setHat(hatId);
  }

  /** Synchronise les parchemins physiques avec la liste de tâches actuelle. */
  setTasks(tasks: { id: string; done: boolean }[]): void {
    const undoneIds = new Set(tasks.filter((t) => !t.done).map((t) => t.id));
    const doneIds = new Set(tasks.filter((t) => t.done).map((t) => t.id));

    // Supprimer les parchemins des tâches désormais complétées (animation pop)
    for (const [id, entry] of [...this.scrollMap.entries()]) {
      if (doneIds.has(id)) {
        this.scrollMap.delete(id);
        entry.sprite.popOut(() => entry.sprite.destroy());
      }
    }

    // Supprimer les parchemins des tâches supprimées (instantané)
    for (const [id, entry] of [...this.scrollMap.entries()]) {
      if (!undoneIds.has(id)) {
        this.scrollMap.delete(id);
        entry.sprite.destroy();
      }
    }

    // Ajouter les parchemins pour les nouvelles tâches non complétées
    const usedPositions = new Set(
      [...this.scrollMap.values()].map((e) => `${e.col},${e.row}`),
    );

    for (const task of tasks) {
      if (task.done || this.scrollMap.has(task.id)) continue;

      const pos = GameScene.SCROLL_TILE_POOL.find(
        ([c, r]) => !usedPositions.has(`${c},${r}`),
      );
      if (!pos) break; // pool épuisé

      const [col, row] = pos;
      usedPositions.add(`${col},${row}`);

      const { x, y } = gridToScreen(col, row, this.offsetX, this.offsetY);
      const sprite = new ScrollSprite();
      sprite.container.x = x;
      sprite.container.y = y;
      sprite.container.zIndex = isoDepth(col, row) + 0.3;
      this.spriteLayer.addChild(sprite.container);
      this.scrollMap.set(task.id, { sprite, col, row });
    }
  }

  /** Synchronise le mobilier Feng Shui du joueur local avec la liste des items possédés. */
  setFurniture(ownedIds: string[], positions: Record<string, { col: number; row: number }> = {}): void {
    const ownedSet = new Set(ownedIds);

    // Supprimer les meubles qui ne sont plus possédés
    for (const [id, sprite] of [...this.furnitureSprites.entries()]) {
      if (!ownedSet.has(id)) {
        this.furnitureSprites.delete(id);
        sprite.destroy();
      }
    }

    // Ajouter ou mettre à jour les meubles
    for (const id of ownedIds) {
      const slot = positions[id] ?? GameScene.FURNITURE_SLOTS[id];
      if (!slot) continue;
      const existingSprite = this.furnitureSprites.get(id);
      if (existingSprite) {
        // Mettre à jour la position si elle a changé
        const { x, y } = gridToScreen(slot.col, slot.row, this.offsetX, this.offsetY);
        existingSprite.container.x = x;
        existingSprite.container.y = y;
        existingSprite.container.zIndex = isoDepth(slot.col, slot.row) + 0.4;
        continue;
      }
      const { x, y } = gridToScreen(slot.col, slot.row, this.offsetX, this.offsetY);
      const sprite = new FurnitureSprite(id);
      sprite.container.x = x;
      sprite.container.y = y;
      sprite.container.zIndex = isoDepth(slot.col, slot.row) + 0.4;
      sprite.onSelect = () => this._selectFurnitureForMove(id);
      this.spriteLayer.addChild(sprite.container);
      this.furnitureSprites.set(id, sprite);
    }

    // Reconstruire la carte des cellules occupées
    this.occupiedCells.clear();
    this.currentPositions = {};
    for (const id of ownedIds) {
      const slot = positions[id] ?? GameScene.FURNITURE_SLOTS[id];
      if (slot) {
        this.occupiedCells.add(`${slot.col},${slot.row}`);
        this.currentPositions[id] = { col: slot.col, row: slot.row };
      }
    }
  }

  private _selectFurnitureForMove(id: string): void {
    const prevId = this.pendingMoveItemId;
    if (prevId !== null) {
      this.furnitureSprites.get(prevId)?.setSelected(false);
    }
    if (prevId === id) {
      this.pendingMoveItemId = null;
    } else {
      this.pendingMoveItemId = id;
      this.furnitureSprites.get(id)?.setSelected(true);
    }
  }

  startGhostPlacement(itemId: string): void {
    this.cancelGhostPlacement();
    this.ghostItemId = itemId;

    const sprite = new FurnitureSprite(itemId);
    sprite.container.alpha = 0.55;
    sprite.container.zIndex = 1000;
    this.spriteLayer.addChild(sprite.container);
    this.ghostSprite = sprite;

    const highlight = new PIXI.Graphics();
    highlight.zIndex = 999;
    this.spriteLayer.addChild(highlight);
    this.ghostHighlight = highlight;

    const canvas = this.app.canvas as HTMLCanvasElement;

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const gx = e.clientX - rect.left;
      const gy = e.clientY - rect.top;
      const local = this.worldContainer.toLocal({ x: gx, y: gy });
      const target = screenToGrid(local.x, local.y, 0, 0);
      const col = Math.round(target.col);
      const row = Math.round(target.row);
      if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;
      const { x, y } = gridToScreen(col, row, this.offsetX, this.offsetY);
      sprite.container.x = x;
      sprite.container.y = y;
      sprite.container.zIndex = isoDepth(col, row) + 0.45;
      const valid = !isBlocked(col, row) && !this.occupiedCells.has(`${col},${row}`);
      highlight.clear();
      highlight.poly([
        x, y - TILE_HEIGHT / 2,
        x + TILE_WIDTH / 2, y,
        x, y + TILE_HEIGHT / 2,
        x - TILE_WIDTH / 2, y,
      ]);
      highlight.fill({ color: valid ? 0x4ade80 : 0xef4444, alpha: 0.25 });
      highlight.stroke({ color: valid ? 0x4ade80 : 0xef4444, width: 2, alpha: 0.8 });
      highlight.zIndex = isoDepth(col, row) + 0.35;
      this.spriteLayer.sortableChildren = true;
      this.spriteLayer.sortChildren();
    };

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") this.cancelGhostPlacement();
    };

    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onEscape);
    this._ghostMoveHandler = onMove;
    this._ghostEscapeHandler = onEscape;
  }

  cancelGhostPlacement(): void {
    if (!this.ghostItemId) return;
    if (this.ghostSprite) {
      if (this.ghostSprite.container.parent) this.spriteLayer.removeChild(this.ghostSprite.container);
      this.ghostSprite.destroy();
      this.ghostSprite = null;
    }
    if (this.ghostHighlight) {
      if (this.ghostHighlight.parent) this.spriteLayer.removeChild(this.ghostHighlight);
      this.ghostHighlight.destroy();
      this.ghostHighlight = null;
    }
    if (this._ghostMoveHandler) {
      (this.app.canvas as HTMLCanvasElement).removeEventListener("pointermove", this._ghostMoveHandler);
      this._ghostMoveHandler = undefined;
    }
    if (this._ghostEscapeHandler) {
      window.removeEventListener("keydown", this._ghostEscapeHandler);
      this._ghostEscapeHandler = undefined;
    }
    this.ghostItemId = null;
  }

  showLocalChat(text: string): void {
    this.localAvatar.showChatBubble(text);
  }

  showLocalCoin(text: string): void {
    this.localAvatar.showCoinBubble(text);
  }

  showRemoteChat(id: string, text: string): void {
    this.remoteAvatars.get(id)?.showChatBubble(text);
  }

  showRemoteCoin(id: string, text: string): void {
    this.remoteAvatars.get(id)?.showCoinBubble(text);
  }

  destroy(): void {
    if (!this.initialized) return;
    this.app.destroy(true);
  }
}
