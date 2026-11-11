// Canvas renderer for the animated parts of the sky: stars, moon, clouds, fog,
// rain/drizzle/snow/hail and lightning. Driven by a scene from src/scene.js.
// The sky gradient and the sun are plain CSS (see <Sky>), underneath this canvas.

const TAU = Math.PI * 2;
const DPR_CAP = 1.5;

// Small seeded PRNG so stars and cloud shapes stay put across re-renders.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const between = (r, a, b) => a + (b - a) * r();

function mixHex(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (n, sh) => Math.round(((n >> sh) & 255) * (1 - t) + ((B >> sh) & 255) * t);
  return "#" + [16, 8, 0].map(sh => ch(A, sh).toString(16).padStart(2, "0")).join("");
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

const DENSITY = { rain: 420, drizzle: 380, snow: 260 }; // particles per megapixel at intensity 1

export class SkyEngine {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext?.("2d") ?? null;
    this.reducedMotion = reducedMotion;
    this.scene = null;
    this.w = 0; this.h = 0;
    this.stars = [];
    this.clouds = [];
    this.drops = [];
    this.hail = [];
    this.fogBands = [];
    this.flash = 0;
    this.nextFlash = 3 + Math.random() * 5;
    this.t = 0;
    this.raf = 0;
    this.last = 0;
    this.spriteKey = "";
    this.tick = this.tick.bind(this);
  }

  get ok() { return !!this.ctx; }

  resize(w, h) {
    if (!this.ok) return;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.makeStars();
    this.makeFog();
    if (this.scene) this.setScene(this.scene, true);
    if (this.reducedMotion) this.draw();
  }

  setScene(scene, force = false) {
    if (!this.ok) return;
    const prev = this.scene;
    this.scene = scene;
    const c = scene.clouds;
    if (force || !prev || Math.abs(prev.clouds.cover - c.cover) > 0.05) this.makeClouds();
    const key = `${c.light}|${c.shade}`;
    if (key !== this.spriteKey) { this.spriteKey = key; this.clouds.forEach(cl => (cl.sprite = this.cloudSprite(cl))); }
    this.syncPrecip();
    if (this.reducedMotion) this.draw();
  }

  start() {
    if (!this.ok || this.reducedMotion || this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  tick(now) {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.step(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  }

  // ---------------------------------------------------------------- setup

  makeStars() {
    const r = rng(7);
    const n = Math.round((this.w * this.h) / 1e6 * 260);
    this.stars = Array.from({ length: n }, () => ({
      x: r() * this.w, y: Math.pow(r(), 1.4) * this.h * 0.85,
      size: r() < 0.08 ? between(r, 1.2, 1.8) : between(r, 0.5, 1.1),
      base: between(r, 0.35, 1), twinkle: between(r, 0.6, 2.2), phase: r() * TAU,
    }));
  }

  makeClouds() {
    const { cover } = this.scene.clouds;
    const r = rng(11);
    const stratus = cover > 0.75 || this.scene.clouds.storm > 0.3;
    const n = cover < 0.03 ? 0 : Math.round((stratus ? 4 + cover * 6 : 2 + cover * 14) * Math.max(this.w, 600) / 1280);
    this.clouds = Array.from({ length: n }, (_, i) => {
      const depth = r(); // 0 far .. 1 near
      const isStratus = stratus && r() < 0.75;
      const size = (70 + depth * 120) * between(r, 0.8, 1.25) * (0.8 + cover * 0.4) * (isStratus ? 1.6 : 1);
      return {
        seed: 1000 + i * 37,
        depth, size, stratus: isStratus,
        x: between(r, -0.2, 1.1) * this.w,
        y: (0.0 + Math.pow(r(), 1.3) * (0.3 + cover * 0.3)) * this.h,
        alpha: (0.55 + depth * 0.35) * (0.65 + 0.35 * Math.min(1, cover * 1.6)),
        sprite: null,
      };
    }).sort((a, b) => a.depth - b.depth);
    this.clouds.forEach(cl => (cl.sprite = this.cloudSprite(cl)));
  }

  // Cumulus: a flat, softly faded base with billowing puffs on top, shaded underneath
  // and lit from above. Stratus (overcast/rain): long, low, flat and low-contrast.
  cloudSprite(cl) {
    const { light, shade } = this.scene.clouds;
    const W = cl.size * (cl.stratus ? 4.2 : 2.6), H = cl.size * (cl.stratus ? 0.75 : 1.25);
    const pad = cl.size * 0.4;
    const c = document.createElement("canvas");
    c.width = Math.ceil(W + pad * 2); c.height = Math.ceil(H + pad * 2);
    const g = c.getContext("2d");
    if (!g) return null;
    const r = rng(cl.seed);
    const baseY = pad + H * (cl.stratus ? 0.7 : 0.78);
    const puffs = [];
    const row = (n, x0, x1, rMin, rMax, lift) => {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const x = pad + W * (x0 + (x1 - x0) * t + between(r, -0.04, 0.04));
        const centre = 1 - Math.abs(t - 0.5) * 1.2; // bigger towards the middle
        const rad = H * between(r, rMin, rMax) * (0.75 + 0.35 * centre);
        puffs.push({ x, y: baseY - rad * lift - H * between(r, 0, 0.05) * centre, rad });
      }
    };
    if (cl.stratus) {
      row(10 + Math.floor(r() * 5), 0.04, 0.96, 0.22, 0.34, 0.55);
      row(5 + Math.floor(r() * 3), 0.15, 0.85, 0.2, 0.3, 0.95);
    } else {
      row(7 + Math.floor(r() * 3), 0.08, 0.92, 0.17, 0.25, 0.65);  // base
      row(3 + Math.floor(r() * 3), 0.25, 0.75, 0.27, 0.38, 1.05);  // towers
    }
    // Puffs are opaque inside the sprite so overlaps don't add up into visible circles;
    // transparency is applied once when the sprite is drawn.
    const lit = cl.stratus ? mixHex(light, shade, 0.45) : light;
    const squash = cl.stratus ? 0.55 : 1;
    if ("filter" in g) g.filter = `blur(${Math.max(1, cl.size * 0.035).toFixed(1)}px)`;
    const blob = (x, y, rad, color, a0, a1) => {
      g.save();
      g.translate(x, y); g.scale(1, squash);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad);
      gr.addColorStop(0, rgba(color, a0)); gr.addColorStop(0.72, rgba(color, a1)); gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rad, 0, TAU); g.fill();
      g.restore();
    };
    for (const p of puffs) blob(p.x, p.y + p.rad * 0.3 * squash, p.rad * 1.05, shade, 1, 1);
    for (const p of puffs) blob(p.x, p.y - p.rad * 0.25 * squash, p.rad * 0.9, lit, 1, 1);
    g.filter = "none";
    // Flatten and soften the base.
    g.globalCompositeOperation = "destination-out";
    const fade = g.createLinearGradient(0, baseY - H * 0.06, 0, baseY + H * 0.12);
    fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = fade; g.fillRect(0, baseY - H * 0.06, c.width, c.height);
    g.globalCompositeOperation = "source-over";
    return c;
  }

  makeFog() {
    const r = rng(23);
    this.fogBands = Array.from({ length: 5 }, () => ({
      x: r() * this.w, y: between(r, 0.35, 0.95) * this.h,
      rx: between(r, 0.5, 0.9) * this.w, ry: between(r, 0.06, 0.14) * this.h,
      speed: between(r, 4, 10), alpha: between(r, 0.25, 0.45),
    }));
  }

  syncPrecip() {
    const { type, intensity, hail } = this.scene.precip;
    const target = type === "none" ? 0 : Math.round(DENSITY[type] * intensity * (this.w * this.h) / 1e6);
    const r = Math.random;
    while (this.drops.length > target) this.drops.pop();
    while (this.drops.length < target) this.drops.push(this.newDrop(type, r() * this.h));
    this.drops.forEach(d => { if (d.type !== type) Object.assign(d, this.newDrop(type, d.y)); });
    const hailTarget = hail ? Math.round(60 * (this.w * this.h) / 1e6) : 0;
    this.hail.length = Math.min(this.hail.length, hailTarget);
    while (this.hail.length < hailTarget) this.hail.push({ x: r() * this.w, y: r() * this.h, v: between(r, 650, 900), s: between(r, 1.4, 2.6) });
  }

  newDrop(type, y = -20) {
    const r = Math.random;
    if (type === "snow") {
      return { type, x: r() * this.w, y, v: between(r, 35, 95), s: between(r, 1, 3.2), sway: between(r, 10, 28), f: between(r, 0.4, 1.2), ph: r() * TAU };
    }
    const drizzle = type === "drizzle";
    return { type, x: r() * this.w, y, v: drizzle ? between(r, 420, 560) : between(r, 900, 1300), len: drizzle ? between(r, 5, 9) : between(r, 14, 26), a: between(r, 0.5, 1) };
  }

  // ---------------------------------------------------------------- animation

  step(dt) {
    const s = this.scene;
    if (!s) return;
    this.t += dt;
    const W = this.w, H = this.h;
    const vx = s.wind.vx;
    const drift = Math.sign(vx || 1) * (5 + Math.min(Math.abs(vx), 60) * 1.1);

    for (const cl of this.clouds) {
      cl.x += drift * (0.35 + cl.depth * 0.9) * dt;
      const sw = cl.sprite?.width ?? cl.size * 3;
      if (drift > 0 && cl.x > W + 20) cl.x = -sw - 20;
      if (drift < 0 && cl.x < -sw - 20) cl.x = W + 20;
    }
    for (const b of this.fogBands) {
      b.x += Math.sign(drift) * b.speed * dt;
      if (b.x - b.rx > W) b.x = -b.rx;
      if (b.x + b.rx < 0) b.x = W + b.rx;
    }

    const slant = Math.max(-0.45, Math.min(0.45, vx / 90));
    for (const d of this.drops) {
      if (d.type === "snow") {
        d.y += d.v * dt;
        d.x += (slant * 60 + Math.sin(this.t * d.f + d.ph) * d.sway) * dt;
      } else {
        d.y += d.v * dt;
        d.x += d.v * slant * dt;
      }
      if (d.y > H + 30) { Object.assign(d, this.newDrop(d.type)); }
      if (d.x > W + 30) d.x -= W + 60;
      if (d.x < -30) d.x += W + 60;
    }
    for (const h of this.hail) {
      h.y += h.v * dt; h.x += h.v * slant * dt;
      if (h.y > H + 10) { h.y = -10; h.x = Math.random() * W; }
    }

    if (s.lightning) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        // Two quick pulses; at most one strike every ~5 s, so well under 3 flashes per second.
        this.flashAt = this.t;
        this.nextFlash = 5 + Math.random() * 9;
      }
      const e = this.t - (this.flashAt ?? -99);
      this.flash = e < 0.08 ? 0.26 : e < 0.16 ? 0.05 : e < 0.24 ? 0.18 : Math.max(0, 0.18 - (e - 0.24) * 0.6);
    } else {
      this.flash = 0;
    }
  }

  draw() {
    const g = this.ctx, s = this.scene;
    if (!g || !s) return;
    const W = this.w, H = this.h;
    g.clearRect(0, 0, W, H);

    if (s.stars > 0.01) {
      for (const st of this.stars) {
        const tw = this.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(this.t * st.twinkle + st.phase);
        g.fillStyle = `rgba(255,255,255,${(st.base * tw * s.stars).toFixed(3)})`;
        g.fillRect(st.x, st.y, st.size, st.size);
      }
    }

    if (s.moon.opacity > 0.01) this.drawMoon(s.moon);

    const { cover } = s.clouds;
    if (cover > 0.55) {
      // Overcast deck: a soft, even layer behind the individual clouds.
      const deck = Math.min(1, (cover - 0.55) / 0.45);
      const gr = g.createLinearGradient(0, 0, 0, H * 0.9);
      gr.addColorStop(0, rgba(s.clouds.shade, 0.75 * deck));
      gr.addColorStop(0.6, rgba(s.clouds.light, 0.35 * deck));
      gr.addColorStop(1, rgba(s.clouds.light, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
    const cloudAlpha = (0.55 + 0.45 * s.day) * (1 - 0.6 * s.fog);
    for (const cl of this.clouds) {
      if (!cl.sprite) continue;
      g.globalAlpha = cl.alpha * cloudAlpha;
      g.drawImage(cl.sprite, cl.x, cl.y);
    }
    g.globalAlpha = 1;

    if (s.fog > 0) {
      // Even haze, thickest near the ground, then drifting banks on top.
      const haze = g.createLinearGradient(0, 0, 0, H);
      haze.addColorStop(0, rgba(s.fogColor, 0.25 * s.fog));
      haze.addColorStop(0.6, rgba(s.fogColor, 0.5 * s.fog));
      haze.addColorStop(1, rgba(s.fogColor, 0.75 * s.fog));
      g.fillStyle = haze;
      g.fillRect(0, 0, W, H);
      for (const b of this.fogBands) {
        g.save();
        g.translate(b.x, b.y);
        g.scale(1, b.ry / b.rx);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, b.rx);
        gr.addColorStop(0, rgba(s.fogColor, b.alpha * s.fog));
        gr.addColorStop(1, rgba(s.fogColor, 0));
        g.fillStyle = gr;
        g.fillRect(-b.rx, -b.rx, b.rx * 2, b.rx * 2);
        g.restore();
      }
    }

    this.drawPrecip(s);

    if (this.flash > 0.001) {
      g.fillStyle = `rgba(235,240,255,${this.flash.toFixed(3)})`;
      g.fillRect(0, 0, W, H);
    }
  }

  drawMoon(m) {
    const g = this.ctx;
    const r = Math.max(16, Math.min(30, Math.min(this.w, this.h) * 0.032));
    const x = m.x * this.w, y = m.y * this.h;
    g.save();
    g.globalAlpha = m.opacity;
    const glow = g.createRadialGradient(x, y, r * 0.8, x, y, r * (3 + 3 * m.fraction));
    glow.addColorStop(0, `rgba(220,228,255,${0.18 * m.fraction})`);
    glow.addColorStop(1, "rgba(220,228,255,0)");
    g.fillStyle = glow;
    g.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
    g.translate(x, y);
    // Lit limb faces the sun: right when waxing (northern hemisphere), mirrored otherwise.
    if (!m.waxing !== m.southern) g.scale(-1, 1);
    g.fillStyle = "rgba(190,200,225,0.08)"; // earthshine on the dark side
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    const k = Math.cos(2 * Math.PI * m.phase); // 1 new .. -1 full
    g.beginPath();
    g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    g.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
    g.closePath();
    g.fillStyle = "#f3efe2";
    g.fill();
    g.clip();
    g.fillStyle = "rgba(120,120,130,0.16)"; // maria
    for (const [mx, my, mr] of [[-0.25, -0.3, 0.28], [0.2, -0.1, 0.22], [-0.05, 0.3, 0.18], [0.35, 0.35, 0.12]]) {
      g.beginPath(); g.arc(mx * r, my * r, mr * r, 0, TAU); g.fill();
    }
    g.restore();
  }

  drawPrecip(s) {
    const g = this.ctx;
    if (!this.drops.length && !this.hail.length) return;
    const dark = s.day < 0.5;
    const slant = Math.max(-0.45, Math.min(0.45, s.wind.vx / 90));
    const type = s.precip.type;
    if (type === "snow") {
      g.fillStyle = dark ? "rgba(230,236,248,0.8)" : "rgba(255,255,255,0.92)";
      g.beginPath();
      for (const d of this.drops) { g.moveTo(d.x + d.s, d.y); g.arc(d.x, d.y, d.s, 0, TAU); }
      g.fill();
    } else if (this.drops.length) {
      g.strokeStyle = dark ? "rgba(170,190,220,0.38)" : "rgba(225,235,248,0.5)";
      g.lineWidth = type === "drizzle" ? 0.8 : 1.1;
      g.lineCap = "round";
      g.beginPath();
      for (const d of this.drops) { g.moveTo(d.x, d.y); g.lineTo(d.x - slant * d.len, d.y - d.len); }
      g.stroke();
    }
    if (this.hail.length) {
      g.fillStyle = "rgba(240,245,255,0.85)";
      g.beginPath();
      for (const h of this.hail) { g.moveTo(h.x + h.s, h.y); g.arc(h.x, h.y, h.s, 0, TAU); }
      g.fill();
    }
  }
}
