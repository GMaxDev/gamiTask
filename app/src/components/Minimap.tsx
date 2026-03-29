import { useEffect, useRef } from "react";
import { GRID_COLS, GRID_ROWS, isBlocked } from "../engine/GameScene";

export interface MinimapPlayer {
  id: string;
  color: number;
  col: number;
  row: number;
}

interface MinimapProps {
  players: MinimapPlayer[];
  localCol: number;
  localRow: number;
  localColor: number;
}

const CELL = 14;
const PAD = 5;
const W = GRID_COLS * CELL + PAD * 2;
const H = GRID_ROWS * CELL + PAD * 2;

export function Minimap({
  players,
  localCol,
  localRow,
  localColor,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    // Grille
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        ctx.fillStyle = isBlocked(col, row)
          ? "rgba(255,255,255,0.18)"
          : "rgba(255,255,255,0.06)";
        ctx.fillRect(PAD + col * CELL, PAD + row * CELL, CELL - 1, CELL - 1);
      }
    }

    // Joueurs distants
    for (const p of players) {
      const x = PAD + p.col * CELL + CELL / 2;
      const y = PAD + p.row * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#" + p.color.toString(16).padStart(6, "0");
      ctx.fill();
    }

    // Joueur local (anneau blanc)
    const lx = PAD + localCol * CELL + CELL / 2;
    const ly = PAD + localRow * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(lx, ly, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#" + localColor.toString(16).padStart(6, "0");
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, ly, 5.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [players, localCol, localRow, localColor]);

  return (
    <canvas
      ref={canvasRef}
      id="minimap"
      width={W}
      height={H}
      title="Minimap — position des joueurs"
    />
  );
}
