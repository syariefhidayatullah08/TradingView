"use client";

import { useRef } from "react";
import { rng, useCanvasScene } from "./canvas";

// Anime Ninja: an original ninja-village-at-dusk scene. Striped setting sun, drifting clouds,
// pagoda rooftops with flickering lanterns, and an original ninja on the nearest roof with a
// scarf in the wind. Falling leaves and anime wind streaks are drawn live on a canvas.

const W = 1440;
const H = 900;

const CLOUDS = [
  { y: 150, w: 520, dur: 140, delay: -30 },
  { y: 250, w: 380, dur: 110, delay: -80 },
  { y: 95, w: 300, dur: 170, delay: -120 },
  { y: 330, w: 460, dur: 125, delay: -10 },
];

const LANTERNS = (() => {
  const rand = rng(12);
  return Array.from({ length: 14 }, (_, i) => ({
    x: 120 + i * 92 + rand() * 30,
    y: 640 + rand() * 50,
    delay: -rand() * 3,
  }));
})();

// A house silhouette with a curved, upturned roof (Japanese style).
function House({ x, y, w, h, fill }: { x: number; y: number; w: number; h: number; fill: string }) {
  const eave = w * 0.18;
  return (
    <g fill={fill}>
      <rect x={x} y={y} width={w} height={h} />
      <path
        d={`M${x - eave},${y + 4} Q${x + w * 0.1},${y - 2} ${x + w * 0.2},${y - h * 0.45} L${x + w * 0.8},${y - h * 0.45} Q${x + w * 0.9},${y - 2} ${x + w + eave},${y + 4} Q${x + w / 2},${y - 6} ${x - eave},${y + 4} Z`}
      />
    </g>
  );
}

function Pagoda({ x, y, fill }: { x: number; y: number; fill: string }) {
  const tiers = [0, 1, 2, 3];
  return (
    <g fill={fill}>
      {tiers.map((t) => {
        const w = 120 - t * 22;
        const ty = y - t * 58;
        return (
          <g key={t}>
            <rect x={x - w * 0.35} y={ty - 40} width={w * 0.7} height={40} />
            <path
              d={`M${x - w / 2 - 18},${ty - 34} Q${x - w / 4},${ty - 44} ${x - w * 0.3},${ty - 62} L${x + w * 0.3},${ty - 62} Q${x + w / 4},${ty - 44} ${x + w / 2 + 18},${ty - 34} Q${x},${ty - 44} ${x - w / 2 - 18},${ty - 34} Z`}
            />
          </g>
        );
      })}
      <rect x={x - 2} y={y - 4 * 58 - 50} width={4} height={50} />
    </g>
  );
}

// Original ninja standing on the roof ridge, arms crossed, looking toward the sunset.
function Ninja({ reduced }: { reduced: boolean }) {
  const scarfA = "M14,-118 C40,-122 70,-112 96,-120 C120,-128 140,-118 160,-126 C150,-112 128,-104 104,-104 C78,-100 46,-108 18,-104 Z";
  const scarfB = "M14,-118 C42,-112 68,-128 98,-118 C124,-108 144,-126 164,-114 C150,-104 126,-96 104,-100 C76,-108 46,-96 18,-104 Z";
  const tailA = "M10,-152 C26,-150 40,-158 54,-150 C42,-146 26,-144 12,-146 Z";
  const tailB = "M10,-152 C26,-158 42,-148 56,-156 C44,-146 28,-142 12,-146 Z";
  return (
    <g className="ninja" transform="translate(1180 652)">
      {/* scarf flowing in the wind */}
      <path d={scarfA} className="ninja-scarf">
        {!reduced && <animate attributeName="d" values={`${scarfA};${scarfB};${scarfA}`} dur="1.4s" repeatCount="indefinite" />}
      </path>
      {/* legs */}
      <path d="M-14,-62 L-24,0 L-12,0 L-4,-50 L4,-50 L12,0 L24,0 L14,-62 Z" className="ninja-body" />
      {/* torso with vest */}
      <path d="M-22,-112 C-24,-90 -20,-72 -16,-60 L16,-60 C20,-72 24,-90 22,-112 C10,-118 -10,-118 -22,-112 Z" className="ninja-body" />
      {/* arms crossed */}
      <path d="M-24,-104 C-30,-92 -26,-82 -10,-84 L22,-88 C26,-86 26,-80 20,-78 L-8,-74 C-26,-72 -36,-90 -24,-104 Z" className="ninja-body" />
      {/* head */}
      <circle cx="0" cy="-132" r="17" className="ninja-body" />
      {/* spiky hair */}
      <path d="M-18,-136 L-30,-150 L-16,-148 L-20,-166 L-6,-154 L-2,-174 L6,-156 L18,-170 L16,-150 L30,-156 L20,-138 Z" className="ninja-body" />
      {/* headband with a blank metal plate, tails fluttering */}
      <rect x="-18" y="-144" width="36" height="7" rx="2" className="ninja-band" />
      <rect x="-8" y="-145" width="16" height="9" rx="1.5" className="ninja-plate" />
      <path d={tailA} className="ninja-band">
        {!reduced && <animate attributeName="d" values={`${tailA};${tailB};${tailA}`} dur="0.9s" repeatCount="indefinite" />}
      </path>
      {/* eye glint toward the sunset */}
      <path d="M-12,-133 L-5,-134" stroke="#fde68a" strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}

function Leaves() {
  const ref = useRef<HTMLCanvasElement>(null);

  useCanvasScene(ref, (ctx) => {
    let w = 0;
    let h = 0;
    type Leaf = { x: number; y: number; vx: number; vy: number; rot: number; spin: number; size: number; color: string; phase: number };
    let leaves: Leaf[] = [];
    const streaks: { y: number; x: number; len: number; life: number }[] = [];
    let nextGust = 3;
    const colors = ["74,160,70", "120,180,60", "180,200,70", "60,130,60", "230,170,60"];

    function spawn(rand: () => number, anywhere: boolean): Leaf {
      return {
        x: anywhere ? rand() * w : -20 - rand() * w * 0.2,
        y: anywhere ? rand() * h : rand() * h * 0.6,
        vx: 30 + rand() * 50,
        vy: 12 + rand() * 22,
        rot: rand() * Math.PI * 2,
        spin: (rand() - 0.5) * 3,
        size: 5 + rand() * 6,
        color: colors[Math.floor(rand() * colors.length)],
        phase: rand() * 6,
      };
    }

    return {
      build(nw, nh) {
        w = nw;
        h = nh;
        const rand = rng(99);
        leaves = Array.from({ length: Math.min(45, Math.round(w / 32)) }, () => spawn(rand, true));
      },
      draw(time, dt) {
        ctx.clearRect(0, 0, w, h);
        nextGust -= dt;
        const gusting = streaks.length > 0;
        if (nextGust <= 0) {
          for (let i = 0; i < 8; i++) {
            streaks.push({ y: h * (0.15 + Math.random() * 0.6), x: -Math.random() * w * 0.5, len: 80 + Math.random() * 220, life: 0 });
          }
          nextGust = 7 + Math.random() * 8;
        }
        for (const l of leaves) {
          const boost = gusting ? 2.4 : 1;
          l.x += (l.vx * boost + Math.sin(time * 1.5 + l.phase) * 20) * dt;
          l.y += (l.vy + Math.cos(time * 2 + l.phase) * 14) * dt;
          l.rot += l.spin * dt * boost;
          if (l.x > w + 20 || l.y > h + 20) Object.assign(l, spawn(Math.random, false));
          ctx.save();
          ctx.translate(l.x, l.y);
          ctx.rotate(l.rot);
          // Flip around the long axis so the leaf seems to tumble.
          ctx.scale(1, Math.cos(time * 3 + l.phase));
          ctx.fillStyle = `rgba(${l.color},0.85)`;
          ctx.beginPath();
          ctx.moveTo(-l.size, 0);
          ctx.quadraticCurveTo(0, -l.size * 0.6, l.size, 0);
          ctx.quadraticCurveTo(0, l.size * 0.6, -l.size, 0);
          ctx.fill();
          ctx.strokeStyle = "rgba(30,60,30,0.5)";
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(-l.size, 0);
          ctx.lineTo(l.size, 0);
          ctx.stroke();
          ctx.restore();
        }
        // Anime wind streaks during a gust.
        ctx.lineCap = "round";
        for (let i = streaks.length - 1; i >= 0; i--) {
          const s = streaks[i];
          s.life += dt;
          s.x += 1400 * dt;
          if (s.life > 0.9 || s.x - s.len > w) {
            streaks.splice(i, 1);
            continue;
          }
          const a = Math.sin((s.life / 0.9) * Math.PI) * 0.35;
          const g = ctx.createLinearGradient(s.x - s.len, 0, s.x, 0);
          g.addColorStop(0, "rgba(255,255,255,0)");
          g.addColorStop(1, `rgba(255,245,230,${a})`);
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(s.x - s.len, s.y);
          ctx.lineTo(s.x, s.y);
          ctx.stroke();
        }
      },
    };
  });

  return <canvas ref={ref} className="theme-canvas" />;
}

export default function NinjaBackdrop() {
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div className="theme-backdrop" aria-hidden="true">
      <svg className="theme-canvas" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="nj-sun" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff3b0" />
            <stop offset="0.6" stopColor="#ffb347" />
            <stop offset="1" stopColor="#ff6b4a" />
          </linearGradient>
          <radialGradient id="nj-glow">
            <stop offset="0" stopColor="#ffd28a" stopOpacity="0.8" />
            <stop offset="1" stopColor="#ff8a5c" stopOpacity="0" />
          </radialGradient>
          {/* Horizontal cuts across the lower half of the sun, a classic anime sunset. */}
          <mask id="nj-stripes">
            <rect x="0" y="0" width={W} height={H} fill="#fff" />
            {[0, 1, 2, 3, 4].map((i) => (
              <rect key={i} x="0" y={520 + i * 26} width={W} height={4 + i * 2.5} fill="#000" />
            ))}
          </mask>
          <linearGradient id="nj-cloud" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd1b8" />
            <stop offset="1" stopColor="#e86a8a" />
          </linearGradient>
        </defs>

        <circle className="nj-glow" cx="560" cy="500" r="330" fill="url(#nj-glow)" />
        <circle cx="560" cy="500" r="170" fill="url(#nj-sun)" mask="url(#nj-stripes)" />

        <g opacity="0.9">
          {CLOUDS.map((c, i) => (
            <g key={i} className="nj-cloud" style={{ animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}>
              <path
                transform={`translate(0 ${c.y})`}
                d={`M0,0 C${c.w * 0.1},-22 ${c.w * 0.3},-26 ${c.w * 0.42},-12 C${c.w * 0.55},-30 ${c.w * 0.78},-26 ${c.w * 0.86},-8 C${c.w * 0.95},-10 ${c.w},-2 ${c.w},4 L0,4 Z`}
                fill="url(#nj-cloud)"
              />
            </g>
          ))}
        </g>

        {/* distant mountains */}
        <path d="M0,600 L120,520 L230,570 L360,470 L470,560 L600,500 L760,580 L900,480 L1040,560 L1180,500 L1320,560 L1440,520 L1440,900 L0,900 Z" fill="#7a3566" opacity="0.75" />

        {/* village */}
        <g>
          <Pagoda x={260} y={700} fill="#4a1a45" />
          <House x={360} y={650} w={120} h={60} fill="#4a1a45" />
          <House x={520} y={670} w={150} h={70} fill="#4a1a45" />
          <House x={720} y={640} w={110} h={80} fill="#4a1a45" />
          <House x={880} y={665} w={140} h={60} fill="#4a1a45" />
          <House x={60} y={680} w={130} h={60} fill="#4a1a45" />
          <rect x="0" y="720" width={W} height="180" fill="#3a1338" />
          {LANTERNS.map((l, i) => (
            <g key={i} className="nj-lantern" style={{ animationDelay: `${l.delay}s` }}>
              <circle cx={l.x} cy={l.y} r="14" fill="#ffb347" opacity="0.25" />
              <ellipse cx={l.x} cy={l.y} rx="5" ry="7" fill="#ff9a3c" />
            </g>
          ))}
        </g>

        {/* nearest roof with the ninja */}
        <path d="M980,900 L980,700 Q1060,690 1120,652 L1330,652 Q1390,690 1440,700 L1440,900 Z" fill="#240a24" />
        <path d="M1080,664 L1360,664" stroke="#5a2140" strokeWidth="3" />
        <Ninja reduced={reduced} />

        {/* tree branch framing the top left */}
        <g fill="#2a1a24">
          <path d="M0,40 C120,70 220,60 330,110 C300,120 230,100 140,96 C80,94 30,90 0,92 Z" />
          {[60, 130, 200, 260, 310].map((x, i) => (
            <ellipse key={i} cx={x} cy={70 + (i % 2) * 34} rx="46" ry="22" fill="#2f5a34" opacity="0.9" />
          ))}
        </g>
      </svg>
      <Leaves />
    </div>
  );
}
