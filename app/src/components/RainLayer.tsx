import { useEffect, useRef } from "react";
import { useReducedMotion } from "../lib/motion";

// Light rain over the map in rain mode. A timer redraws a half-resolution canvas 10 times a second; there is
// no requestAnimationFrame loop, so the page wakes only for those frames. Long, faint streaks hide the low frame
// rate. The rain stops while the tab is hidden. With reduced motion it draws one still frame.
const FRAME_MS = 100;
const SCALE = 0.5;

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

export default function RainLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let drops: Drop[] = [];
    let w = 0;
    let h = 0;
    const seed = () => {
      // Drawn in CSS pixels on a canvas at half resolution; the browser scales it up.
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.ceil(w * SCALE);
      canvas.height = Math.ceil(h * SCALE);
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      drops = Array.from({ length: Math.round((w * h) / 9000) }, () => ({
        x: Math.random() * (w + 80),
        y: Math.random() * h,
        len: 26 + Math.random() * 18,
        speed: 520 + Math.random() * 260,
        alpha: 0.38 + Math.random() * 0.24,
      }));
    };
    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#1E40AF";
      for (const d of drops) {
        d.y += d.speed * dt;
        d.x -= d.speed * dt * 0.18;
        if (d.y - d.len > h) {
          d.y = -Math.random() * 40;
          d.x = Math.random() * (w + 80);
        }
        ctx.globalAlpha = d.alpha;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * 0.18, d.y - d.len);
        ctx.stroke();
      }
    };
    seed();
    draw(0);
    const ro = new ResizeObserver(() => {
      seed();
      draw(0);
    });
    ro.observe(canvas);
    if (reduced) return () => ro.disconnect();

    let timer = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      draw(Math.min(0.1, (now - last) / 1000));
      last = now;
      timer = window.setTimeout(tick, FRAME_MS);
    };
    const start = () => {
      if (timer || document.hidden) return;
      last = performance.now();
      timer = window.setTimeout(tick, FRAME_MS);
      canvas.dataset.running = "1";
    };
    const stop = () => {
      clearTimeout(timer);
      timer = 0;
      canvas.dataset.running = "0";
    };
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduced]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" data-testid="rain-layer" data-running="0" />;
}
