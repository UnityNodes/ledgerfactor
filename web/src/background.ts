// Aurora Drift - candlelight behind obsidian glass.
// A handful of large, soft gold and teal light-fields drift and breathe across a
// near-black canvas, overlapping additively into a quiet living aurora. Barely-there,
// premium, never fighting the foreground. Canvas 2D only, no filters, one rAF loop.
export function mountBackground(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return () => {};

  const reduce =
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let dpr = 1;

  // Warm-dark palette: ink, brass, obsidian.
  const BASE_TOP = '#070a0f';
  const BASE_BOT = '#05070a';
  const GOLD = [214, 176, 106] as const;
  const TEAL = [70, 208, 166] as const;

  type Field = {
    color: readonly [number, number, number];
    // drift: base position + two orbital components (fractions of viewport)
    bx: number; by: number;
    ax1: number; ay1: number; ax2: number; ay2: number;
    fx1: number; fy1: number; fx2: number; fy2: number;
    px1: number; py1: number; px2: number; py2: number;
    // breathing radius (fraction of the larger viewport dimension)
    rBase: number; rAmp: number; rFreq: number; rPhase: number;
    // breathing alpha
    aBase: number; aAmp: number; aFreq: number; aPhase: number;
  };

  // A restrained set: two gold, two teal, sizes and speeds varied so they never
  // beat in sync. Alphas are deliberately low - additive stacking does the rest.
  const fields: Field[] = [
    {
      color: GOLD,
      bx: 0.28, by: 0.32,
      ax1: 0.10, ay1: 0.07, ax2: 0.05, ay2: 0.04,
      fx1: 0.017, fy1: 0.013, fx2: 0.031, fy2: 0.023,
      px1: 0.0, py1: 1.7, px2: 3.1, py2: 0.6,
      rBase: 0.62, rAmp: 0.06, rFreq: 0.011, rPhase: 0.4,
      aBase: 0.050, aAmp: 0.016, aFreq: 0.009, aPhase: 1.2,
    },
    {
      color: TEAL,
      bx: 0.74, by: 0.30,
      ax1: 0.09, ay1: 0.08, ax2: 0.04, ay2: 0.05,
      fx1: 0.014, fy1: 0.019, fx2: 0.027, fy2: 0.033,
      px1: 2.2, py1: 0.3, px2: 1.1, py2: 4.0,
      rBase: 0.58, rAmp: 0.07, rFreq: 0.013, rPhase: 2.1,
      aBase: 0.044, aAmp: 0.015, aFreq: 0.011, aPhase: 0.2,
    },
    {
      color: GOLD,
      bx: 0.60, by: 0.78,
      ax1: 0.11, ay1: 0.06, ax2: 0.06, ay2: 0.05,
      fx1: 0.012, fy1: 0.021, fx2: 0.025, fy2: 0.017,
      px1: 4.5, py1: 2.4, px2: 0.7, py2: 3.3,
      rBase: 0.66, rAmp: 0.05, rFreq: 0.010, rPhase: 3.0,
      aBase: 0.038, aAmp: 0.014, aFreq: 0.008, aPhase: 2.6,
    },
    {
      color: TEAL,
      bx: 0.20, by: 0.80,
      ax1: 0.08, ay1: 0.09, ax2: 0.05, ay2: 0.04,
      fx1: 0.019, fy1: 0.011, fx2: 0.029, fy2: 0.037,
      px1: 1.3, py1: 5.0, px2: 2.8, py2: 1.9,
      rBase: 0.54, rAmp: 0.06, rFreq: 0.014, rPhase: 0.9,
      aBase: 0.040, aAmp: 0.013, aFreq: 0.012, aPhase: 4.1,
    },
  ];

  // Static overlays are pre-baked on resize and reused every frame (zero
  // per-frame gradient allocation). The base is a vertical ink wash; the
  // vignette presses the edges into obsidian so the currents never fight
  // foreground content at the margins.
  let baseGrad: CanvasGradient | null = null;
  let vignetteGrad: CanvasGradient | null = null;

  function buildStatics() {
    const base = ctx!.createLinearGradient(0, 0, 0, height);
    base.addColorStop(0, BASE_TOP);
    base.addColorStop(1, BASE_BOT);
    baseGrad = base;

    const maxDim = Math.max(width, height);
    const vig = ctx!.createRadialGradient(
      width * 0.5, height * 0.46, maxDim * 0.28,
      width * 0.5, height * 0.5, maxDim * 0.82
    );
    vig.addColorStop(0, 'rgba(5,7,10,0)');
    vig.addColorStop(0.62, 'rgba(5,7,10,0.16)');
    vig.addColorStop(1, 'rgba(5,7,10,0.46)');
    vignetteGrad = vig;
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStatics();
    if (reduce) draw(6.0); // static, mid-phase calm frame
  }

  function paintField(f: Field, t: number) {
    const g = ctx!;
    const maxDim = Math.max(width, height);
    const cx =
      (f.bx +
        f.ax1 * Math.sin(t * f.fx1 * Math.PI * 2 + f.px1) +
        f.ax2 * Math.sin(t * f.fx2 * Math.PI * 2 + f.px2)) * width;
    const cy =
      (f.by +
        f.ay1 * Math.sin(t * f.fy1 * Math.PI * 2 + f.py1) +
        f.ay2 * Math.sin(t * f.fy2 * Math.PI * 2 + f.py2)) * height;

    const r =
      (f.rBase + f.rAmp * Math.sin(t * f.rFreq * Math.PI * 2 + f.rPhase)) * maxDim;
    let a = (f.aBase + f.aAmp * Math.sin(t * f.aFreq * Math.PI * 2 + f.aPhase)) * 1.5;
    if (a < 0) a = 0;

    const [cr, cg, cb] = f.color;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    // Soft falloff built from many low-alpha stops = blur without filters.
    grad.addColorStop(0.0, `rgba(${cr},${cg},${cb},${a})`);
    grad.addColorStop(0.18, `rgba(${cr},${cg},${cb},${a * 0.72})`);
    grad.addColorStop(0.4, `rgba(${cr},${cg},${cb},${a * 0.38})`);
    grad.addColorStop(0.66, `rgba(${cr},${cg},${cb},${a * 0.14})`);
    grad.addColorStop(1.0, `rgba(${cr},${cg},${cb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, width, height);
  }

  function draw(t: number) {
    const g = ctx!;
    // Base ink wash (cached, opaque - no clear needed since alpha:false).
    g.fillStyle = baseGrad!;
    g.fillRect(0, 0, width, height);

    // Living aurora, stacked additively.
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < fields.length; i++) paintField(fields[i], t);
    g.globalCompositeOperation = 'source-over';

    // Cached vignette presses the margins back into obsidian.
    g.fillStyle = vignetteGrad!;
    g.fillRect(0, 0, width, height);
  }

  let raf = 0;
  let start = 0;

  function frame(now: number) {
    if (!start) start = now;
    const t = (now - start) / 1000;
    draw(t);
    raf = requestAnimationFrame(frame);
  }

  // Debounced resize: coalesces the burst of events fired during a window drag
  // into a single re-setup, and re-honors reduced-motion once it settles.
  let resizeTimer = 0;
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0;
      resize();
    }, 150);
  }

  resize();
  window.addEventListener('resize', onResize);

  if (!reduce) {
    raf = requestAnimationFrame(frame);
  }

  return () => {
    if (raf) cancelAnimationFrame(raf);
    if (resizeTimer) clearTimeout(resizeTimer);
    window.removeEventListener('resize', onResize);
  };
}