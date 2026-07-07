// A 3D silk-wave surface flying past in perspective. Violet strands, every
// seventh row lilac, faint lime crest-nodes on the nearest strand, and a drift
// of coloured specks above it. The top and left are darkened so the masthead and
// hero copy stay legible. Canvas 2D, one rAF loop, DPR-capped, reduced-motion aware.

export function mountBackground(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  let raf = 0;

  const resize = () => {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.max(1, Math.round(w * DPR));
    canvas.height = Math.max(1, Math.round(h * DPR));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  };
  resize();

  // Floating specks, seeded so the field is stable frame to frame.
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const specks: { x: number; y: number; sp: number; ph: number; r: number; c: string }[] = [];
  for (let i = 0; i < 42; i++) {
    specks.push({
      x: rnd(),
      y: rnd(),
      sp: 0.00001 + rnd() * 0.00003,
      ph: rnd() * Math.PI * 2,
      r: 0.8 + rnd() * 1.6,
      c: rnd() < 0.18 ? '243,255,151' : rnd() < 0.5 ? '213,165,227' : '168,159,145',
    });
  }

  const COLS = 96;
  const ROWS = 30;

  const draw = (t: number) => {
    ctx.fillStyle = '#030206';
    ctx.fillRect(0, 0, w, h);

    const horizon = h * 0.34;
    const cx = w * 0.5;
    const T1 = t * 0.00055;
    const T2 = t * 0.00034;

    const point = (i: number, j: number): [number, number] => {
      const x = (i / (COLS - 1)) * 2 - 1;
      const z = j / (ROWS - 1);
      const zz = 1 - z;
      const y =
        0.2 * Math.sin(x * 2.6 + T1 + zz * 2.2) +
        0.11 * Math.sin(x * 5.3 - T2 + zz * 5.0) +
        0.06 * Math.sin(zz * 9.0 + T1 * 1.4);
      const persp = 0.22 + zz * 1.05;
      const sx = cx + x * w * 0.78 * persp;
      const sy = horizon + (0.62 + y * 0.5) * h * 0.62 * persp - h * 0.1;
      return [sx, sy];
    };

    // horizontal strands
    for (let j = 0; j < ROWS; j++) {
      const zz = 1 - j / (ROWS - 1);
      const lilac = j % 7 === 3;
      const a = (0.045 + zz * 0.16) * (lilac ? 1.5 : 1);
      ctx.strokeStyle = lilac
        ? 'rgba(213,165,227,' + a.toFixed(3) + ')'
        : 'rgba(135,92,255,' + a.toFixed(3) + ')';
      ctx.lineWidth = lilac ? 1.3 : 1;
      ctx.beginPath();
      for (let i = 0; i < COLS; i++) {
        const p = point(i, j);
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
    }

    // vertical strands, sparser
    for (let i = 0; i < COLS; i += 4) {
      ctx.strokeStyle = 'rgba(135,92,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 0; j < ROWS; j++) {
        const p = point(i, j);
        if (j === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
    }

    // lime crest nodes on the nearest strand
    for (let i = 6; i < COLS - 6; i += 12) {
      const p = point(i, ROWS - 1);
      ctx.fillStyle = 'rgba(243,255,151,0.5)';
      ctx.beginPath();
      ctx.arc(p[0], p[1], 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // floating specks above the silk
    for (const s of specks) {
      const sx = ((s.x + t * s.sp) % 1) * w;
      const sy = (s.y * 0.5 + 0.03 * Math.sin(t * 0.0004 + s.ph)) * h;
      ctx.fillStyle = 'rgba(' + s.c + ',' + (0.22 + 0.16 * Math.sin(t * 0.001 + s.ph)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // keep the top dark for the masthead and hero text
    const fadeTop = ctx.createLinearGradient(0, 0, 0, h * 0.52);
    fadeTop.addColorStop(0, 'rgba(3,2,6,0.9)');
    fadeTop.addColorStop(1, 'rgba(3,2,6,0)');
    ctx.fillStyle = fadeTop;
    ctx.fillRect(0, 0, w, h * 0.52);

    const fadeLeft = ctx.createLinearGradient(0, 0, w * 0.5, 0);
    fadeLeft.addColorStop(0, 'rgba(3,2,6,0.72)');
    fadeLeft.addColorStop(1, 'rgba(3,2,6,0)');
    ctx.fillStyle = fadeLeft;
    ctx.fillRect(0, 0, w * 0.5, h);
  };

  const reduced =
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let resizeTimer = 0;
  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0;
      resize();
      if (reduced) draw(30000);
    }, 150);
  };
  window.addEventListener('resize', onResize);

  if (reduced) {
    draw(30000);
  } else {
    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return () => {
    if (raf) cancelAnimationFrame(raf);
    if (resizeTimer) clearTimeout(resizeTimer);
    window.removeEventListener('resize', onResize);
  };
}
