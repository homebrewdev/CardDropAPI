import { useEffect, useRef } from "react";

interface Flake {
  x: number;
  y: number;
  r: number; // радиус, px
  vy: number; // скорость падения, px/с
  sway: number; // амплитуда покачивания, px
  phase: number;
  speed: number; // частота покачивания
}

const FLAKES_PER_MEGAPIXEL = 180;

function makeFlake(w: number, h: number, anywhere: boolean): Flake {
  const r = 1 + Math.random() * 3;
  return {
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : -10,
    r,
    vy: 30 + r * 22 + Math.random() * 20,
    sway: 10 + Math.random() * 25,
    phase: Math.random() * Math.PI * 2,
    speed: 0.5 + Math.random() * 1.2,
  };
}

/** Снегопад на весь экран. Клики проходят насквозь. */
export function Snowfall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    let flakes: Flake[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round((w * h) / 1e6 * FLAKES_PER_MEGAPIXEL);
      // Первый запуск — снежинки сразу по всему экрану, дальше добираем сверху
      const first = flakes.length === 0;
      while (flakes.length < target) flakes.push(makeFlake(w, h, first));
      flakes.length = Math.min(flakes.length, target);
    }
    resize();
    window.addEventListener("resize", resize);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = performance.now();
    let raf = 0;

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx!.clearRect(0, 0, w, h);
      ctx!.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx!.shadowColor = "rgba(255, 255, 255, 0.8)";
      ctx!.shadowBlur = 4;
      ctx!.beginPath();
      for (const f of flakes) {
        f.y += f.vy * dt;
        f.phase += f.speed * dt;
        if (f.y > h + 10) Object.assign(f, makeFlake(w, h, false));
        const x = f.x + Math.sin(f.phase) * f.sway;
        ctx!.moveTo(x + f.r, f.y);
        ctx!.arc(x, f.y, f.r, 0, Math.PI * 2);
      }
      ctx!.fill();
      if (!reduced) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="snowfall" aria-hidden="true" />;
}
