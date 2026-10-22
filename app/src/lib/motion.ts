import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

// With reduced motion on, every change is instant: no route drawing, fades, eased light, or falling rain.
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const m = window.matchMedia?.(QUERY);
    if (!m) return;
    const f = () => setReduced(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return reduced;
}

// Run step(t) with t from 0 to 1 over ms milliseconds. Returns a cancel function.
export function animate(ms: number, step: (t: number) => void): () => void {
  const start = performance.now();
  let raf = requestAnimationFrame(function frame(now) {
    const t = Math.min(1, (now - start) / ms);
    step(t);
    if (t < 1) raf = requestAnimationFrame(frame);
  });
  return () => cancelAnimationFrame(raf);
}
