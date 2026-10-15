"use client";

import { useRef } from "react";
import { rng, useCanvasScene } from "./canvas";

// Trading Pro: a quiet trading-terminal backdrop. A slowly scrolling grid, a few live price
// lines drawn as random walks, faint candles along the bottom and dashed price levels.

const GRID = 48;
const STEP = 6; // px between price points
const SCROLL = 14; // px per second

type Line = { ys: number[]; base: number; color: string; vol: number; carry: number };

export default function ProBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useCanvasScene(ref, (ctx) => {
    const rand = rng(424242);
    let w = 0;
    let h = 0;
    let lines: Line[] = [];
    let candles: { o: number; c: number; hi: number; lo: number }[] = [];
    let candleCarry = 0;
    let lastClose = 0;

    function nextY(l: Line, prev: number): number {
      // Random walk pulled back toward the line's home level so it never leaves the screen.
      return prev + (rand() - 0.5) * l.vol + (l.base - prev) * 0.02;
    }

    function nextCandle() {
      const o = lastClose;
      const c = o + (rand() - 0.48) * 14;
      lastClose = c;
      candles.push({ o, c, hi: Math.max(o, c) + rand() * 8, lo: Math.min(o, c) - rand() * 8 });
    }

    function build(nw: number, nh: number) {
      w = nw;
      h = nh;
      const count = Math.ceil(w / STEP) + 2;
      const specs = [
        { base: 0.32, color: "34,197,94", vol: 9 },
        { base: 0.5, color: "245,158,11", vol: 7 },
        { base: 0.66, color: "96,165,250", vol: 6 },
      ];
      lines = specs.map((s) => {
        const l: Line = { ys: [], base: h * s.base, color: s.color, vol: s.vol, carry: 0 };
        let y = l.base;
        for (let i = 0; i < count; i++) l.ys.push((y = nextY(l, y)));
        return l;
      });
      candles = [];
      lastClose = 0;
      for (let i = 0; i < Math.ceil(w / 14) + 2; i++) nextCandle();
    }

    function draw(time: number, dt: number) {
      ctx.clearRect(0, 0, w, h);

      // Grid, drifting left.
      const off = (time * SCROLL) % GRID;
      ctx.strokeStyle = "rgba(148,163,184,0.075)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -off; x < w; x += GRID) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = 0; y < h; y += GRID) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
      }
      ctx.stroke();

      // Dashed horizontal price levels.
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = "rgba(245,158,11,0.10)";
      for (const f of [0.24, 0.58]) {
        ctx.beginPath();
        ctx.moveTo(0, h * f);
        ctx.lineTo(w, h * f);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Live price lines: shift left, append new points at the right edge.
      for (const l of lines) {
        l.carry += dt * SCROLL;
        while (l.carry >= STEP) {
          l.carry -= STEP;
          l.ys.shift();
          l.ys.push(nextY(l, l.ys[l.ys.length - 1]));
        }
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, `rgba(${l.color},0)`);
        grad.addColorStop(0.6, `rgba(${l.color},0.22)`);
        grad.addColorStop(1, `rgba(${l.color},0.55)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        l.ys.forEach((y, i) => {
          const x = i * STEP - l.carry;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        // Glowing head on the newest price.
        const hx = (l.ys.length - 1) * STEP - l.carry;
        const hy = l.ys[l.ys.length - 1];
        if (hx <= w + 4) {
          ctx.fillStyle = `rgba(${l.color},0.15)`;
          ctx.beginPath();
          ctx.arc(Math.min(hx, w - 6), hy, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(${l.color},0.7)`;
          ctx.beginPath();
          ctx.arc(Math.min(hx, w - 6), hy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Faint candles along the bottom.
      candleCarry += dt * SCROLL;
      while (candleCarry >= 14) {
        candleCarry -= 14;
        candles.shift();
        nextCandle();
      }
      const lo = Math.min(...candles.map((c) => c.lo));
      const hi = Math.max(...candles.map((c) => c.hi));
      const band = h * 0.16;
      const top = h - band - 12;
      const y = (v: number) => top + band - ((v - lo) / (hi - lo || 1)) * band;
      candles.forEach((c, i) => {
        const x = i * 14 - candleCarry;
        const up = c.c >= c.o;
        ctx.fillStyle = up ? "rgba(34,197,94,0.13)" : "rgba(239,68,68,0.13)";
        ctx.fillRect(x + 6, y(c.hi), 1, y(c.lo) - y(c.hi));
        ctx.fillRect(x + 3, y(Math.max(c.o, c.c)), 7, Math.max(1, Math.abs(y(c.o) - y(c.c))));
      });

      // Vignette keeps the center calm.
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, "rgba(5,7,10,0)");
      v.addColorStop(1, "rgba(5,7,10,0.55)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    }

    return { build, draw };
  });

  return (
    <div className="theme-backdrop" aria-hidden="true">
      <canvas ref={ref} className="theme-canvas" />
    </div>
  );
}
