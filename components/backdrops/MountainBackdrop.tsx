"use client";

import { useRef } from "react";
import { rng, useCanvasScene } from "./canvas";

// Pegunungan: a calm green valley by day. Layered ridges fading into haze, drifting clouds
// and mist, swaying grass and flowers; birds and pollen are drawn live on a canvas.

const W = 1440;
const H = 900;

function ridge(seed: number, base: number, amp: number, sharp: number): string {
  const rand = rng(seed);
  const f = [0.004 + rand() * 0.003, 0.011 + rand() * 0.006, 0.027 + rand() * 0.01];
  const p = [rand() * 6, rand() * 6, rand() * 6];
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 16) {
    // Folded sines give pointed peaks; `sharp` blends from rolling hills to peaks.
    const a = Math.sin(x * f[0] + p[0]);
    const peak = 1 - Math.abs(a);
    const shape = (1 - sharp) * (a * 0.5 + 0.5) + sharp * peak * peak;
    const y = base - amp * (0.7 * shape + 0.2 * (Math.sin(x * f[1] + p[1]) * 0.5 + 0.5) + 0.1 * Math.sin(x * f[2] + p[2]));
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return `M0,${H} L${pts.join(" L")} L${W},${H} Z`;
}

const LAYERS = [
  { d: ridge(11, 470, 230, 0.9), fill: "url(#mtn-far)" },
  { d: ridge(23, 560, 170, 0.7), fill: "#86b8a4" },
  { d: ridge(37, 640, 130, 0.45), fill: "#62a173" },
  { d: ridge(41, 715, 90, 0.25), fill: "#3f8350" },
];

function nearY(x: number): number {
  return 790 - 38 * Math.sin((x / W) * Math.PI * 1.3 + 0.6) - 9 * Math.sin(x / 90);
}

const NEAR = `M0,${H} ` + Array.from({ length: 91 }, (_, i) => `L${i * 16},${nearY(i * 16).toFixed(1)}`).join(" ") + ` L${W},${H} Z`;

const TREES = (() => {
  const rand = rng(5);
  return Array.from({ length: 34 }, () => {
    const x = rand() * W;
    const s = 0.6 + rand() * 0.8;
    // Sit the trees on the fourth ridge's band.
    return { x, y: 690 + rand() * 40, s };
  }).sort((a, b) => a.y - b.y);
})();

const BLADES = (() => {
  const rand = rng(77);
  return Array.from({ length: 260 }, () => ({
    x: rand() * W,
    h: 12 + rand() * 30,
    lean: (rand() - 0.5) * 12,
    delay: -rand() * 4,
  }));
})();

const FLOWERS = (() => {
  const rand = rng(31);
  const colors = ["#fde68a", "#fbcfe8", "#ffffff", "#c4b5fd"];
  return Array.from({ length: 40 }, () => {
    const x = rand() * W;
    return { x, y: nearY(x) + 14 + rand() * 60, c: colors[Math.floor(rand() * colors.length)], delay: -rand() * 4 };
  });
})();

const CLOUDS = [
  { y: 110, s: 1.2, dur: 160, delay: -20 },
  { y: 190, s: 0.8, dur: 130, delay: -70 },
  { y: 70, s: 0.9, dur: 190, delay: -120 },
  { y: 260, s: 1.0, dur: 150, delay: -100 },
  { y: 150, s: 0.7, dur: 120, delay: -40 },
];

function Cloud({ s }: { s: number }) {
  return (
    <g transform={`scale(${s})`}>
      <ellipse cx="0" cy="0" rx="90" ry="26" />
      <ellipse cx="-40" cy="-14" rx="44" ry="28" />
      <ellipse cx="20" cy="-24" rx="52" ry="34" />
      <ellipse cx="62" cy="-8" rx="38" ry="22" />
    </g>
  );
}

function Birds() {
  const ref = useRef<HTMLCanvasElement>(null);

  useCanvasScene(ref, (ctx) => {
    let w = 0;
    let h = 0;
    type Bird = { x: number; y: number; vx: number; phase: number; size: number };
    const birds: Bird[] = [];
    let nextFlock = 2;
    let pollen: { x: number; y: number; r: number; vx: number; vy: number; phase: number }[] = [];

    function flock() {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y0 = h * (0.1 + Math.random() * 0.25);
      const n = 3 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        birds.push({
          x: dir > 0 ? -40 - i * 26 : w + 40 + i * 26,
          y: y0 + (i % 2 ? 1 : -1) * i * 7,
          vx: dir * (40 + Math.random() * 15),
          phase: Math.random() * 6,
          size: 5 + Math.random() * 3,
        });
      }
    }

    return {
      build(nw, nh) {
        w = nw;
        h = nh;
        const rand = rng(8);
        pollen = Array.from({ length: 40 }, () => ({
          x: rand() * w,
          y: h * (0.45 + rand() * 0.55),
          r: 0.8 + rand() * 1.6,
          vx: 6 + rand() * 10,
          vy: -2 - rand() * 4,
          phase: rand() * 6,
        }));
      },
      draw(time, dt) {
        ctx.clearRect(0, 0, w, h);
        for (const p of pollen) {
          p.x += p.vx * dt;
          p.y += p.vy * dt + Math.sin(time + p.phase) * 0.2;
          if (p.x > w + 5) p.x = -5;
          if (p.y < h * 0.4) p.y = h + 5;
          ctx.fillStyle = `rgba(255,250,220,${0.35 + 0.3 * Math.sin(time * 2 + p.phase)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        nextFlock -= dt;
        if (nextFlock <= 0) {
          flock();
          nextFlock = 14 + Math.random() * 16;
        }
        ctx.strokeStyle = "rgba(28,52,44,0.55)";
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        for (let i = birds.length - 1; i >= 0; i--) {
          const b = birds[i];
          b.x += b.vx * dt;
          b.y += Math.sin(time * 0.8 + b.phase) * 0.15;
          if (b.x < -80 || b.x > w + 80) {
            birds.splice(i, 1);
            continue;
          }
          const flap = Math.sin(time * 9 + b.phase) * b.size * 0.7;
          ctx.beginPath();
          ctx.moveTo(b.x - b.size, b.y - flap);
          ctx.quadraticCurveTo(b.x - b.size / 2, b.y - flap / 3, b.x, b.y);
          ctx.quadraticCurveTo(b.x + b.size / 2, b.y - flap / 3, b.x + b.size, b.y - flap);
          ctx.stroke();
        }
      },
    };
  });

  return <canvas ref={ref} className="theme-canvas" />;
}

export default function MountainBackdrop() {
  return (
    <div className="theme-backdrop" aria-hidden="true">
      <svg className="theme-canvas" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">
        <defs>
          <radialGradient id="mtn-sun">
            <stop offset="0" stopColor="#fffbe6" />
            <stop offset="0.35" stopColor="#fff3c4" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff3c4" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mtn-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c9e2ea" />
            <stop offset="0.5" stopColor="#a9cfcf" />
            <stop offset="1" stopColor="#9cc6b9" />
          </linearGradient>
          <linearGradient id="mtn-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a7d43" />
            <stop offset="1" stopColor="#1d4f28" />
          </linearGradient>
          <filter id="mtn-blur" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>

        <circle className="mtn-sun" cx="1120" cy="200" r="150" fill="url(#mtn-sun)" />
        <circle cx="1120" cy="200" r="46" fill="#fffdf2" />

        <g className="mtn-clouds" fill="#ffffff" opacity="0.85">
          {CLOUDS.map((c, i) => (
            <g key={i} className="mtn-cloud" style={{ animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}>
              <g transform={`translate(0 ${c.y})`}>
                <Cloud s={c.s} />
              </g>
            </g>
          ))}
        </g>

        <path d={LAYERS[0].d} fill={LAYERS[0].fill} />
        <path d={LAYERS[1].d} fill={LAYERS[1].fill} />
        <ellipse className="mtn-mist" cx="500" cy="560" rx="700" ry="40" fill="#ffffff" opacity="0.45" filter="url(#mtn-blur)" />
        <path d={LAYERS[2].d} fill={LAYERS[2].fill} />
        <ellipse className="mtn-mist mtn-mist-slow" cx="1000" cy="660" rx="650" ry="34" fill="#ffffff" opacity="0.35" filter="url(#mtn-blur)" />
        <path d={LAYERS[3].d} fill={LAYERS[3].fill} />

        {TREES.map((t, i) => (
          <g key={i} transform={`translate(${t.x.toFixed(1)} ${t.y.toFixed(1)}) scale(${t.s.toFixed(2)})`}>
            <rect x="-1.5" y="-4" width="3" height="8" fill="#24452a" />
            <path d="M0,-34 L10,-14 L5,-14 L13,-2 L-13,-2 L-5,-14 L-10,-14 Z" fill="#2a5e35" />
          </g>
        ))}

        <path d={NEAR} fill="url(#mtn-near)" />

        <g className="grass mtn-grass">
          {BLADES.map((b, i) => {
            const y = nearY(b.x) + 6;
            return (
              <path
                key={i}
                d={`M${b.x.toFixed(1)},${y.toFixed(1)} q${(b.lean / 2).toFixed(1)},${(-b.h / 2).toFixed(1)} ${b.lean.toFixed(1)},${(-b.h).toFixed(1)}`}
                style={{ animationDelay: `${b.delay}s` }}
              />
            );
          })}
        </g>
        {FLOWERS.map((f, i) => (
          <g key={i} className="mtn-flower" style={{ animationDelay: `${f.delay}s` }}>
            <line x1={f.x} y1={f.y} x2={f.x} y2={f.y - 10} stroke="#2f6b35" strokeWidth="1.5" />
            <circle cx={f.x} cy={f.y - 12} r="3.2" fill={f.c} />
            <circle cx={f.x} cy={f.y - 12} r="1.2" fill="#f59e0b" />
          </g>
        ))}
      </svg>
      <Birds />
    </div>
  );
}
