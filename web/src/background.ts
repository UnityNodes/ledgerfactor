export function mountBackground(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return () => {};
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, dpr = 1;
  let raf = 0;
  let t0 = performance.now();

  const GLYPHS = '0123456789ABCDEF⬡◇◈⊘⊗∎∴⋮';
  const cell = 42;
  let cols = 0, rows = 0;

  interface Mote {
    x: number; y: number; vy: number; vx: number; ch: string; size: number;
    life: number; ttl: number; alpha: number; gold: boolean; swap: number; swapT: number;
  }
  let motes: Mote[] = [];

  // --- GRAFT: gold MARGIN-routing burst (from Living Ledger, re-plumbed) ---
  // A bounded ring of gold packets that ignite from the margin-card region and
  // route outward to only two bearings, then fade. Fired explicitly by
  // canvas.__routeMargin() from App.tsx at the offer step -- no MutationObserver,
  // and gold appears ONLY here at the disclosure moment (color contract intact).
  interface Packet {
    ox: number; oy: number; ang: number; dist: number; p: number; speed: number; size: number;
  }
  let packets: Packet[] = [];
  let ripple = 0;             // 0..1 expanding disclosure ring, 0 = idle
  let rippleX = 0, rippleY = 0;

  function fireRoute() {
    // origin: read the live margin card's on-screen position so the burst
    // physically emanates from it; fall back to a right-of-centre zone.
    let cx = W * 0.62, cy = H * 0.5;
    try {
      const el = document.querySelector('.card-sensitive');
      if (el) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && r.height > 0) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
      }
    } catch (e) { /* ignore */ }
    rippleX = cx; rippleY = cy;
    ripple = 0.0001;          // arm the expanding ring
    packets = [];
    // route to ONLY two bearings -- the disclosed parties -- redaction in light.
    const bearings = [-0.62, 0.62];
    const perBearing = reduce ? 3 : 9;
    for (const b of bearings) {
      for (let i = 0; i < perBearing; i++) {
        packets.push({
          ox: cx, oy: cy,
          ang: b + (Math.random() - 0.5) * 0.5,
          dist: 120 + Math.random() * 240,
          p: -i * 0.04,       // stagger the emission
          speed: 0.55 + Math.random() * 0.5,
          size: 1.6 + Math.random() * 2.2,
        });
      }
    }
  }
  (canvas as unknown as { __routeMargin?: () => void }).__routeMargin = fireRoute;

  function spawn(): Mote {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vy: 6 + Math.random() * 16,
      vx: (Math.random() - 0.5) * 4,
      ch: GLYPHS[(Math.random() * GLYPHS.length) | 0],
      size: 10 + Math.random() * 9,
      life: 0,
      ttl: 6 + Math.random() * 10,
      alpha: 0.05 + Math.random() * 0.22,
      gold: Math.random() < 0.16,
      swap: 0.6 + Math.random() * 1.4,
      swapT: 0,
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(W / cell) + 1;
    rows = Math.ceil(H / cell) + 1;
    const count = Math.max(14, Math.min(46, Math.floor((W * H) / 42000)));
    motes = new Array(count).fill(0).map(() => spawn());
  }

  function draw(now: number) {
    const g = ctx!;
    const dt = Math.min(0.05, (now - t0) / 1000);
    t0 = now;
    const time = now / 1000;
    g.clearRect(0, 0, W, H);

    // --- breathing ledger-grid hairlines with a moving highlight sweep ---
    const sweep = (time * 0.06) % 1;
    g.lineWidth = 1;
    for (let i = 0; i < cols; i++) {
      const x = i * cell + 0.5;
      const phase = (i / cols + sweep) % 1;
      const glow = Math.pow(Math.max(0, 1 - Math.abs(phase - 0.5) * 2.2), 3);
      const a = 0.015 + glow * 0.05;
      g.strokeStyle = 'rgba(120,150,170,' + a.toFixed(3) + ')';
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let j = 0; j < rows; j++) {
      const y = j * cell + 0.5;
      const phase = (j / rows + sweep * 0.7) % 1;
      const glow = Math.pow(Math.max(0, 1 - Math.abs(phase - 0.5) * 2.2), 3);
      const a = 0.012 + glow * 0.04;
      g.strokeStyle = 'rgba(120,150,170,' + a.toFixed(3) + ')';
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }

    // --- occasional gold 'ledger commit' pulse rings at intersections ---
    const pulseSeed = Math.floor(time * 0.5);
    for (let k = 0; k < 5; k++) {
      const seed = (pulseSeed + k * 131) % 997;
      const gx = ((seed * 53) % cols) * cell;
      const gy = ((seed * 97) % rows) * cell;
      const localT = (time * 0.5) % 1;
      const r = localT * 22;
      const a = (1 - localT) * 0.18;
      g.strokeStyle = 'rgba(214,176,106,' + a.toFixed(3) + ')';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(gx, gy, r, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(214,176,106,' + (a * 1.4).toFixed(3) + ')';
      g.fillRect(gx - 1, gy - 1, 2, 2);
    }

    // --- drifting hex/crypto glyph field (a few glowing gold) ---
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    for (const m of motes) {
      m.y += m.vy * dt;
      m.x += m.vx * dt;
      m.life += dt;
      m.swapT += dt;
      if (m.swapT >= m.swap) { m.swapT = 0; m.ch = GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
      if (m.y > H + 30 || m.life > m.ttl) {
        Object.assign(m, spawn());
        m.y = -20;
        m.x = Math.random() * W;
      }
      const fade = Math.min(1, m.life * 0.6) * Math.min(1, (m.ttl - m.life) * 0.6);
      const a = m.alpha * Math.max(0, fade);
      if (a <= 0.002) continue;
      g.font = m.size.toFixed(1) + 'px "JetBrains Mono Variable", monospace';
      if (m.gold) {
        g.fillStyle = 'rgba(214,176,106,' + a.toFixed(3) + ')';
        g.shadowColor = 'rgba(214,176,106,0.5)';
        g.shadowBlur = 6;
      } else {
        g.fillStyle = 'rgba(150,185,205,' + a.toFixed(3) + ')';
        g.shadowBlur = 0;
      }
      g.fillText(m.ch, m.x, m.y);
      g.shadowBlur = 0;
    }

    // --- GRAFT: disclosure ripple + gold routing packets (the money-shot payoff) ---
    if (ripple > 0) {
      ripple += dt * 0.9;
      const rr = ripple * Math.min(W, H) * 0.42;
      const ringA = Math.max(0, 0.5 * (1 - ripple));
      if (ringA > 0.004) {
        g.strokeStyle = 'rgba(243,217,154,' + ringA.toFixed(3) + ')';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(rippleX, rippleY, rr, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = 'rgba(214,176,106,' + (ringA * 0.6).toFixed(3) + ')';
        g.lineWidth = 6;
        g.beginPath();
        g.arc(rippleX, rippleY, rr * 0.72, 0, Math.PI * 2);
        g.stroke();
      }
      if (ripple >= 1) ripple = 0;
    }

    if (packets.length) {
      let alive = false;
      for (const pk of packets) {
        pk.p += dt * pk.speed;
        if (pk.p < 0) { alive = true; continue; }     // still staggered-in
        if (pk.p >= 1) continue;                        // done
        alive = true;
        const e = pk.p * (2 - pk.p);                    // ease-out
        const x = pk.ox + Math.cos(pk.ang) * pk.dist * e;
        const y = pk.oy + Math.sin(pk.ang) * pk.dist * e;
        const a = 0.9 * (1 - pk.p);
        const glow = pk.size * 3.2;
        const rg = g.createRadialGradient(x, y, 0, x, y, glow);
        rg.addColorStop(0, 'rgba(243,217,154,' + a.toFixed(3) + ')');
        rg.addColorStop(0.4, 'rgba(214,176,106,' + (a * 0.4).toFixed(3) + ')');
        rg.addColorStop(1, 'rgba(214,176,106,0)');
        g.fillStyle = rg;
        g.beginPath();
        g.arc(x, y, glow, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,248,224,' + Math.min(0.95, a + 0.15).toFixed(3) + ')';
        g.beginPath();
        g.arc(x, y, pk.size * 0.55, 0, Math.PI * 2);
        g.fill();
      }
      if (!alive) packets = [];
    }

    raf = requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  if (reduce) {
    draw(performance.now());
    cancelAnimationFrame(raf);
  } else {
    raf = requestAnimationFrame(draw);
  }

  return function cleanup() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    try { delete (canvas as unknown as { __routeMargin?: () => void }).__routeMargin; } catch (e) { /* ignore */ }
    ctx!.clearRect(0, 0, W, H);
  };
}