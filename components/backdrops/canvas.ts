"use client";

import { useEffect, type RefObject } from "react";

const FRAME_MS = 1000 / 40;

// Deterministic PRNG so a scene looks the same on every load.
export function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export type Scene = {
  // Called on mount and on every resize, with the canvas size in CSS pixels.
  build: (w: number, h: number) => void;
  // `time` in seconds since start, `dt` seconds since the last frame (0 for a still frame).
  draw: (time: number, dt: number) => void;
};

// Runs a decorative canvas animation at ~40 fps. With reduced motion it draws one still frame.
export function useCanvasScene(
  ref: RefObject<HTMLCanvasElement | null>,
  create: (ctx: CanvasRenderingContext2D, reduced: boolean) => Scene,
) {
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = create(ctx, reduced);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.build(w, h);
      if (reduced) scene.draw(0, 0);
    };
    resize();

    const start = performance.now();
    let last = start;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      scene.draw((now - start) / 1000, dt);
    };
    if (!reduced) raf = requestAnimationFrame(loop);

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
    // The scene factory is fixed per component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
