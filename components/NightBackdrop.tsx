"use client";

import { useEffect, useRef } from "react";

// Live night sky behind the app: a slowly rotating star field with the Milky Way,
// twinkling stars and the odd shooting star, over a grassy hill where an original
// anime-style character lies watching the sky. Decorative only.

type Star = { r: number; a: number; size: number; alpha: number; freq: number; phase: number; color: string };
type Meteor = { x: number; y: number; vx: number; vy: number; life: number; max: number };

const ROTATION_SPEED = 0.0035; // radians per second around the pivot below the horizon
const FRAME_MS = 1000 / 40;

// Deterministic PRNG so the scene looks the same on every load.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function gauss(rand: () => number): number {
  return (rand() + rand() + rand() + rand() - 2) / 2;
}

function starColor(rand: () => number): string {
  const k = rand();
  if (k < 0.12) return "255,214,170";
  if (k < 0.32) return "180,205,255";
  return "255,255,255";
}

function SkyCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let pivotX = 0;
    let pivotY = 0;
    let stars: Star[] = [];
    let glow: HTMLCanvasElement | null = null;
    const glowScale = 0.25;
    let glowRadius = 0;
    // Direction and offset of the Milky Way band in sky coordinates.
    const bandAngle = -1.05;
    const meteors: Meteor[] = [];
    let nextMeteor = 3;

    function build() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      pivotX = w * 0.5;
      pivotY = h * 1.25;
      const R = Math.hypot(w, h * 1.25) * 1.15;
      glowRadius = R;
      const rand = rng(20261006);

      stars = [];
      const field = Math.min(900, Math.round((w * h) / 2600));
      for (let i = 0; i < field; i++) {
        const r = Math.sqrt(rand()) * R;
        stars.push({
          r,
          a: rand() * Math.PI * 2,
          size: rand() < 0.06 ? 1.6 + rand() : 0.5 + rand() * 0.9,
          alpha: 0.35 + rand() * 0.65,
          freq: 0.6 + rand() * 2.2,
          phase: rand() * Math.PI * 2,
          color: starColor(rand),
        });
      }

      // Dense faint stars along the band.
      const bx = Math.cos(bandAngle);
      const by = Math.sin(bandAngle);
      const ox = -by * R * 0.12;
      const oy = bx * R * 0.12 - R * 0.55;
      const bandStars = Math.min(1400, Math.round((w * h) / 1500));
      for (let i = 0; i < bandStars; i++) {
        const t = (rand() * 2 - 1) * R;
        const off = gauss(rand) * R * 0.07;
        const x = ox + bx * t - by * off;
        const y = oy + by * t + bx * off;
        stars.push({
          r: Math.hypot(x, y),
          a: Math.atan2(y, x),
          size: 0.35 + rand() * 0.7,
          alpha: 0.25 + rand() * 0.5,
          freq: 0.4 + rand() * 1.5,
          phase: rand() * Math.PI * 2,
          color: starColor(rand),
        });
      }

      // Soft glow of the band, rendered once at low resolution.
      const size = Math.ceil(R * 2 * glowScale);
      glow = document.createElement("canvas");
      glow.width = size;
      glow.height = size;
      const g = glow.getContext("2d")!;
      g.translate(size / 2, size / 2);
      g.scale(glowScale, glowScale);
      const clouds: [number, number, number, string][] = [];
      for (let i = 0; i < 70; i++) {
        const t = (rand() * 2 - 1) * R;
        const off = gauss(rand) * R * 0.05;
        const hue = rand();
        const color =
          hue < 0.45 ? "150,140,255" : hue < 0.75 ? "120,190,255" : hue < 0.9 ? "255,160,210" : "255,220,180";
        clouds.push([ox + bx * t - by * off, oy + by * t + bx * off, R * (0.05 + rand() * 0.09), color]);
      }
      for (const [x, y, rad, color] of clouds) {
        const grad = g.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, `rgba(${color},0.16)`);
        grad.addColorStop(1, `rgba(${color},0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
      // Dark dust lanes through the middle of the band.
      for (let i = 0; i < 26; i++) {
        const t = (rand() * 2 - 1) * R * 0.8;
        const off = gauss(rand) * R * 0.015;
        const x = ox + bx * t - by * off;
        const y = oy + by * t + bx * off;
        const rad = R * (0.02 + rand() * 0.035);
        const grad = g.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, "rgba(5,8,25,0.35)");
        grad.addColorStop(1, "rgba(5,8,25,0)");
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
    }

    function draw(time: number, dt: number) {
      const angle = time * ROTATION_SPEED;
      ctx!.clearRect(0, 0, w, h);

      if (glow) {
        ctx!.save();
        ctx!.translate(pivotX, pivotY);
        ctx!.rotate(angle);
        ctx!.globalCompositeOperation = "lighter";
        ctx!.drawImage(glow, -glowRadius, -glowRadius, glowRadius * 2, glowRadius * 2);
        ctx!.restore();
      }

      for (const s of stars) {
        const a = s.a + angle;
        const x = pivotX + Math.cos(a) * s.r;
        const y = pivotY + Math.sin(a) * s.r;
        if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
        const twinkle = reduced ? 1 : 0.55 + 0.45 * Math.sin(time * s.freq + s.phase);
        ctx!.fillStyle = `rgba(${s.color},${(s.alpha * twinkle).toFixed(3)})`;
        if (s.size > 1.5) {
          ctx!.beginPath();
          ctx!.arc(x, y, s.size, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.fillStyle = `rgba(${s.color},${(0.12 * twinkle).toFixed(3)})`;
          ctx!.beginPath();
          ctx!.arc(x, y, s.size * 3.2, 0, Math.PI * 2);
          ctx!.fill();
        } else {
          ctx!.fillRect(x, y, s.size, s.size);
        }
      }

      if (reduced) return;
      nextMeteor -= dt;
      if (nextMeteor <= 0) {
        const speed = 700 + Math.random() * 500;
        const dir = Math.PI * (0.15 + Math.random() * 0.2);
        meteors.push({
          x: w * (0.1 + Math.random() * 0.8),
          y: h * (0.02 + Math.random() * 0.3),
          vx: Math.cos(dir) * speed * (Math.random() < 0.5 ? 1 : -1),
          vy: Math.sin(dir) * speed,
          life: 0,
          max: 0.7 + Math.random() * 0.5,
        });
        nextMeteor = 4 + Math.random() * 7;
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.life += dt;
        if (m.life >= m.max) {
          meteors.splice(i, 1);
          continue;
        }
        const x = m.x + m.vx * m.life;
        const y = m.y + m.vy * m.life;
        const fade = Math.sin((m.life / m.max) * Math.PI);
        const tail = 0.12;
        const grad = ctx!.createLinearGradient(x, y, x - m.vx * tail, y - m.vy * tail);
        grad.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
        grad.addColorStop(1, "rgba(160,190,255,0)");
        ctx!.strokeStyle = grad;
        ctx!.lineWidth = 1.6;
        ctx!.lineCap = "round";
        ctx!.beginPath();
        ctx!.moveTo(x, y);
        ctx!.lineTo(x - m.vx * tail, y - m.vy * tail);
        ctx!.stroke();
      }
    }

    build();
    const start = performance.now();
    let last = start;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      draw((now - start) / 1000, dt);
    };
    if (reduced) draw(0, 0);
    else raf = requestAnimationFrame(loop);

    const onResize = () => {
      build();
      if (reduced) draw(0, 0);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="night-canvas" />;
}

const BLADES = (() => {
  const rand = rng(77);
  const out: { x: number; h: number; lean: number; delay: number; layer: number }[] = [];
  for (let i = 0; i < 220; i++) {
    out.push({ x: rand() * 1440, h: 10 + rand() * 26, lean: (rand() - 0.5) * 10, delay: -rand() * 4, layer: rand() < 0.5 ? 0 : 1 });
  }
  return out;
})();

const FIREFLIES = (() => {
  const rand = rng(9);
  return Array.from({ length: 16 }, () => ({
    left: rand() * 100,
    bottom: 4 + rand() * 22,
    delay: -rand() * 8,
    duration: 6 + rand() * 6,
  }));
})();

// Height of the near hill at x, so grass sits on its curve.
function hillY(x: number): number {
  return 236 - 46 * Math.sin((x / 1440) * Math.PI * 1.1 + 0.35) - 10 * Math.sin(x / 140);
}

function Meadow() {
  const near = Array.from({ length: 49 }, (_, i) => {
    const x = i * 30;
    return `${i === 0 ? "M" : "L"}${x},${hillY(x).toFixed(1)}`;
  }).join(" ");

  return (
    <svg className="night-meadow" viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="hill-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c2560" />
          <stop offset="1" stopColor="#0c1236" />
        </linearGradient>
        <linearGradient id="hill-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f1740" />
          <stop offset="1" stopColor="#050818" />
        </linearGradient>
      </defs>

      <path d="M0,190 C220,140 420,170 640,150 C860,128 1080,170 1260,140 C1350,126 1410,132 1440,138 L1440,320 L0,320 Z" fill="url(#hill-far)" opacity="0.9" />
      <path d={`${near} L1440,320 L0,320 Z`} fill="url(#hill-near)" />

      <g className="grass grass-back">
        {BLADES.filter((b) => b.layer === 0).map((b, i) => {
          const y = hillY(b.x) + 2;
          return (
            <path
              key={i}
              d={`M${b.x.toFixed(1)},${y.toFixed(1)} q${(b.lean / 2).toFixed(1)},${(-b.h / 2).toFixed(1)} ${b.lean.toFixed(1)},${(-b.h).toFixed(1)}`}
              style={{ animationDelay: `${b.delay}s` }}
            />
          );
        })}
      </g>

      {/* Anime-style character lying on the hill, hands behind the head, looking up. */}
      <g className="sleeper" transform="translate(985 200) rotate(-5) scale(1.45)">
        {/* long hair spread on the grass */}
        <path d="M-6,-4 C-24,-10 -46,-4 -58,6 C-44,4 -34,8 -26,10 C-38,12 -46,18 -50,22 C-34,18 -18,14 -6,10 Z" className="sleeper-hair" />
        <circle cx="0" cy="-6" r="13" className="sleeper-skin" />
        {/* fringe */}
        <path d="M-12,-14 C-8,-24 6,-24 12,-14 C8,-17 4,-15 2,-12 C0,-16 -6,-17 -12,-14 Z" className="sleeper-hair" />
        {/* arms folded behind the head */}
        <path d="M18,-6 C14,-20 8,-28 -2,-26 C-8,-24 -10,-18 -8,-14" className="sleeper-limb" />
        <path d="M16,2 C12,-12 4,-22 -8,-22" className="sleeper-limb sleeper-limb-far" />
        {/* hoodie torso */}
        <path d="M12,-8 C30,-12 56,-11 72,-7 C76,-2 76,6 72,10 C54,13 30,13 12,10 C8,4 8,-3 12,-8 Z" className="sleeper-shirt" />
        {/* one knee up, one leg stretched */}
        <path d="M70,0 C80,-8 88,-20 96,-26 C102,-16 108,-6 114,4" className="sleeper-leg" />
        <path d="M70,6 C88,7 106,8 124,8" className="sleeper-leg" />
        <ellipse cx="118" cy="6" rx="7" ry="4" className="sleeper-shoe" />
        <ellipse cx="129" cy="7" rx="7" ry="4" className="sleeper-shoe" />
        {/* sleeping cat curled at the feet */}
        <g transform="translate(152 5)">
          <ellipse cx="0" cy="0" rx="15" ry="8" className="sleeper-cat" />
          <circle cx="-11" cy="-4" r="6.5" className="sleeper-cat" />
          <path d="M-16,-8 L-15,-15 L-10,-10 Z M-8,-10 L-5,-16 L-3,-8 Z" className="sleeper-cat" />
          <path d="M13,3 q10,-1 5,-9" className="sleeper-tail" />
        </g>
      </g>

      <g className="grass grass-front">
        {BLADES.filter((b) => b.layer === 1).map((b, i) => {
          const y = hillY(b.x) + 10;
          return (
            <path
              key={i}
              d={`M${b.x.toFixed(1)},${y.toFixed(1)} q${(b.lean / 2).toFixed(1)},${(-b.h / 2).toFixed(1)} ${b.lean.toFixed(1)},${(-b.h).toFixed(1)}`}
              style={{ animationDelay: `${b.delay}s` }}
            />
          );
        })}
      </g>
    </svg>
  );
}

export default function NightBackdrop() {
  return (
    <div className="night-backdrop" aria-hidden="true">
      <SkyCanvas />
      <Meadow />
      {FIREFLIES.map((f, i) => (
        <span
          key={i}
          className="firefly"
          style={{
            left: `${f.left}%`,
            bottom: `${f.bottom}vh`,
            animationDelay: `${f.delay}s, ${f.delay}s`,
            animationDuration: `${f.duration}s, ${f.duration / 3}s`,
          }}
        />
      ))}
    </div>
  );
}
