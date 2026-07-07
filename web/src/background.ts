// Guilloche - the fine engraved line-work on banknotes and share certificates.
// Interwoven gold and teal rose-curves, drawn as thin low-alpha strokes on an ink
// base, breathing almost imperceptibly. Crafted and on-theme, never a gradient blob.
// Canvas 2D only, one rAF loop, DPR-capped, resize-safe, reduced-motion aware.

interface Band {
  r: number;
  a: number;
  p: number;
  ph: number;
  sp: number;
  c: string;
  w: number;
}

export function mountBackground(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return () => {};

  const reduce =
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let raf = 0;
  let startT = 0;
  let cx = 0;
  let cy = 0;
  let unit = 0;

  const GOLD = '214, 176, 106';
  const TEAL = '70, 208, 166';

  // Each pair (same r/a/p, opposite spin, half-petal phase offset) interweaves into
  // the classic guilloche lattice where the strands cross.
  const bands: Band[] = [
    { r: 0.30, a: 0.030, p: 58, ph: 0.0, sp: 0.010, c: GOLD, w: 0.7 },
    { r: 0.30, a: 0.030, p: 58, ph: Math.PI / 58, sp: -0.010, c: GOLD, w: 0.7 },
    { r: 0.21, a: 0.022, p: 42, ph: 0.5, sp: 0.014, c: GOLD, w: 0.6 },
    { r: 0.21, a: 0.022, p: 42, ph: 0.5 + Math.PI / 42, sp: -0.014, c: GOLD, w: 0.6 },
    { r: 0.41, a: 0.020, p: 88, ph: 1.2, sp: 0.007, c: TEAL, w: 0.6 },
    { r: 0.41, a: 0.020, p: 88, ph: 1.2 + Math.PI / 88, sp: -0.007, c: TEAL, w: 0.6 },
    { r: 0.13, a: 0.016, p: 30, ph: 2.1, sp: 0.018, c: GOLD, w: 0.5 },
  ];

  let baseGrad: CanvasGradient | null = null;
  let vignette: CanvasGradient | null = null;

  function buildStatics() {
    const b = ctx!.createLinearGradient(0, 0, 0, H);
    b.addColorStop(0, '#070a0f');
    b.addColorStop(1, '#05070a');
    baseGrad = b;

    const maxDim = Math.max(W, H);
    const v = ctx!.createRadialGradient(
      W * 0.68, H * 0.34, maxDim * 0.12,
      W * 0.5, H * 0.5, maxDim * 0.9
    );
    v.addColorStop(0, 'rgba(5,7,10,0)');
    v.addColorStop(0.58, 'rgba(5,7,10,0.34)');
    v.addColorStop(1, 'rgba(5,7,10,0.66)');
    vignette = v;

    cx = W * 0.68;
    cy = H * 0.34;
    unit = Math.min(W, H);
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStatics();
    if (reduce) draw(0);
  }

  function strand(bd: Band, t: number) {
    const g = ctx!;
    const R = bd.r * unit;
    const A = bd.a * unit;
    const phase = bd.ph + t * bd.sp;
    const STEPS = 640;
    g.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const th = (i / STEPS) * Math.PI * 2;
      const rr = R + A * Math.sin(bd.p * th + phase);
      const x = cx + rr * Math.cos(th);
      const y = cy + rr * Math.sin(th);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = `rgba(${bd.c}, 0.05)`;
    g.lineWidth = bd.w;
    g.stroke();
  }

  function draw(t: number) {
    const g = ctx!;
    g.fillStyle = baseGrad!;
    g.fillRect(0, 0, W, H);

    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < bands.length; i++) strand(bands[i], t);
    g.globalCompositeOperation = 'source-over';

    g.fillStyle = vignette!;
    g.fillRect(0, 0, W, H);
  }

  function frame(now: number) {
    if (!startT) startT = now;
    draw((now - startT) / 1000);
    raf = requestAnimationFrame(frame);
  }

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
  if (!reduce) raf = requestAnimationFrame(frame);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    if (resizeTimer) clearTimeout(resizeTimer);
    window.removeEventListener('resize', onResize);
  };
}
