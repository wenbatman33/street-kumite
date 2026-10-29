// 各國舞台的動態元素（像素風，畫在低解析層）：天氣、環境、觀眾反應
// back = 畫在背景之後、角色之前；front = 畫在角色前面
// 錨在背景圖上的元素（蒸氣、香煙、天燈…）用圖片比例座標 [x, y]，跟著背景視差移動
import { VIEW_W, VIEW_H, LAYOUT, STAGES } from './config.js';
import { stageGeom } from './render.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const PX = 3;                                    // 1 個低解析像素 = 3 世界單位
const px = (v) => Math.round(v / PX) * PX;

// 每個舞台的設定：強度可在 DEV 工具調整（0 = 關閉）
export const STAGE_FX = {
  market:  { on: 1, rain: 90, steam: [[0.12, 0.5], [0.87, 0.5]], flashBand: [0.44, 0.58], flash: 0.6 },
  beach:   { on: 1, gulls: 3, glint: [0.3, 0.72, 0.37, 0.43], confetti: 1, flashBand: [0.5, 0.63], flash: 0 },
  steppe:  { on: 1, seeds: 26, eagle: 1, cloud: 1, confetti: 1 },
  harbor:  { on: 1, snow: 80, aurora: 1 },
  rooftop: { on: 1, petals: 42, lanterns: [[0.035, 0.6], [0.955, 0.59]] },
  temple:  { on: 1, incense: [[0.115, 0.62], [0.895, 0.6]], mist: 1, leaves: 8 },
  gym:     { on: 1, spots: [0.3, 0.5, 0.7], flashBand: [0.5, 0.66], flash: 1, haze: 1 },
  stadium: { on: 1, lanterns3: 14, flashBand: [0.42, 0.56], flash: 1, confetti: 1 },
  // 拳帖四天王
  ruins:   { on: 1, seeds: 22, lightning: 1 },
  pyramid: { on: 1, sand: 60 },
  volcano: { on: 1, embers: 46, aurora: 1 },
  summit:  { on: 1, rain: 120, lightning: 1 },
};

export class StageFX {
  constructor(stageId) {
    this.id = stageId;
    this.D = STAGE_FX[stageId] || { on: 0 };
    this.t = 0;
    this.camX = 0;
    this.excite = 0;           // 觀眾興奮度（重擊、K.O. 時上升）
    this.drops = []; this.flakes = []; this.petals = []; this.seeds = []; this.leaves = [];
    this.puffs = []; this.flashes = []; this.splash = []; this.confetti = []; this.lamps = [];
    const D = this.D;
    const span = () => rnd(-100, VIEW_W + 100);
    for (let i = 0; i < (D.rain || 0); i++) this.drops.push({ x: span(), y: rnd(-40, VIEW_H), v: rnd(15, 20), l: rnd(18, 33) });
    for (let i = 0; i < (D.snow || 0); i++) this.flakes.push({ x: span(), y: rnd(0, VIEW_H), v: rnd(0.8, 2.2), s: Math.random() < 0.3 ? 2 : 1, ph: rnd(0, 6) });
    for (let i = 0; i < (D.petals || 0); i++) this.petals.push({ x: span(), y: rnd(0, VIEW_H), v: rnd(1, 2.2), vx: rnd(-2.2, -0.8), ph: rnd(0, 6) });
    for (let i = 0; i < (D.seeds || 0); i++) this.seeds.push({ x: span(), y: rnd(200, 640), v: rnd(1.2, 3), ph: rnd(0, 6) });
    for (let i = 0; i < (D.leaves || 0); i++) this.leaves.push({ x: span(), y: rnd(0, VIEW_H), v: rnd(0.8, 1.6), ph: rnd(0, 6) });
    for (let i = 0; i < (D.lanterns3 || 0); i++) this.lamps.push({ fx: rnd(0, 1), fy: rnd(0.26, 0.5), v: rnd(0.00012, 0.0003), ph: rnd(0, 6) });
    this.sand = []; this.embers = [];
    for (let i = 0; i < (D.sand || 0); i++) this.sand.push({ x: span(), y: rnd(80, 700), v: rnd(6, 12), l: rnd(18, 48) });
    for (let i = 0; i < (D.embers || 0); i++) this.embers.push({ x: span(), y: rnd(0, VIEW_H), v: rnd(0.8, 2.4), ph: rnd(0, 6) });
    this.bolt = null;            // 閃電：{ t, seg }
    this.gulls = [];
    for (let i = 0; i < (D.gulls || 0); i++) this.gulls.push({ x: rnd(0, VIEW_W), y: rnd(70, 200), v: rnd(0.6, 1.2) * (Math.random() < 0.5 ? 1 : -1), ph: rnd(0, 6) });
  }

  // 觀眾反應：強度 0～1（K.O. = 1）
  cheer(amt) {
    this.excite = Math.min(1.5, this.excite + amt);
    if (amt >= 1 && this.D.confetti) this.burstConfetti();
  }

  burstConfetti() {
    const cols = ['#ff4a4a', '#ffd84a', '#4ad8ff', '#7dff6b', '#ff8ae0', '#ffffff'];
    for (let i = 0; i < 90; i++) this.confetti.push({ x: rnd(0, VIEW_W), y: rnd(-120, 60), vx: rnd(-1, 1), vy: rnd(1.5, 3.2), c: cols[i % cols.length], ph: rnd(0, 6), life: 400 });
  }

  // 固定 60Hz 推進（選單背景用 advanceTo 依畫面時間補足）
  update(camX = this.camX) {
    const dcam = camX - this.camX;
    this.camX = camX;
    this.t++;
    const D = this.D;
    if (!D.on) return;
    this.excite = Math.max(0, this.excite * 0.985 - 0.001);
    const wrapX = (p) => { p.x -= dcam; if (p.x < -120) p.x += VIEW_W + 240; else if (p.x > VIEW_W + 120) p.x -= VIEW_W + 240; };
    const gy = LAYOUT.groundY;
    for (const d of this.drops) {
      d.y += d.v; d.x -= d.v * 0.18; wrapX(d);
      if (d.y > gy + d.l * 1.5 + (d.x % 60)) {
        if (Math.random() < 0.5) this.splash.push({ x: d.x, y: d.y - d.l, t: 0 });
        d.y = rnd(-60, -10); d.x = rnd(-100, VIEW_W + 100);
      }
    }
    for (const s of this.splash) s.t++;
    this.splash = this.splash.filter((s) => s.t < 8);
    for (const f of this.flakes) {
      f.y += f.v; f.x += Math.sin(this.t * 0.02 + f.ph) * 0.6 - 0.3; wrapX(f);
      if (f.y > VIEW_H + 10) { f.y = -10; f.x = rnd(-100, VIEW_W + 100); }
    }
    for (const p of this.petals) {
      p.y += p.v; p.x += p.vx + Math.sin(this.t * 0.05 + p.ph) * 0.8; wrapX(p);
      if (p.y > VIEW_H + 10) { p.y = -10; p.x = rnd(0, VIEW_W + 200); }
    }
    for (const s of this.seeds) {
      s.x += s.v; s.y += Math.sin(this.t * 0.04 + s.ph) * 0.5; wrapX(s);
    }
    for (const l of this.leaves) {
      l.y += l.v; l.x += Math.sin(this.t * 0.03 + l.ph) * 1.2; wrapX(l);
      if (l.y > VIEW_H + 10) { l.y = -10; l.x = rnd(-100, VIEW_W + 100); }
    }
    for (const s of this.sand) { s.x += s.v; s.y += Math.sin(this.t * 0.05 + s.x * 0.01) * 0.4; wrapX(s); }
    for (const e of this.embers) {
      e.y -= e.v; e.x += Math.sin(this.t * 0.04 + e.ph) * 0.7; wrapX(e);
      if (e.y < -10) { e.y = VIEW_H + 10; e.x = rnd(-100, VIEW_W + 100); }
    }
    // 閃電：隨機落雷（觀眾興奮時更頻繁）
    if (D.lightning) {
      if (this.bolt) { this.bolt.t++; if (this.bolt.t > 14) this.bolt = null; }
      else if (Math.random() < 0.004 + this.excite * 0.01) {
        const seg = [];
        let x = rnd(100, VIEW_W - 100), y = -10;
        while (y < 300) { seg.push([x, y]); x += rnd(-40, 40); y += rnd(25, 50); }
        this.bolt = { t: 0, seg };
      }
    }
    for (const gl of this.gulls) {
      gl.x += gl.v; gl.y += Math.sin(this.t * 0.02 + gl.ph) * 0.3;
      if (gl.x > VIEW_W + 60) gl.x = -60; else if (gl.x < -60) gl.x = VIEW_W + 60;
    }
    for (const l of this.lamps) { l.fy -= l.v; l.fx += Math.sin(this.t * 0.01 + l.ph) * 0.00008; if (l.fy < 0.24) { l.fy = 0.5; l.fx = rnd(0, 1); } }
    // 蒸氣／香煙
    for (const [fx, fy] of D.steam || D.incense || []) {
      if (this.t % (D.incense ? 9 : 6) === 0) this.puffs.push({ fx, fy, dx: 0, dy: 0, r: rnd(6, 10), t: 0, life: D.incense ? 150 : 70, ph: rnd(0, 6), smoke: !!D.incense });
    }
    for (const p of this.puffs) { p.t++; p.dy -= p.smoke ? 0.55 : 0.9; p.dx = Math.sin(p.t * 0.05 + p.ph) * (p.smoke ? 10 : 6); p.r += p.smoke ? 0.08 : 0.25; }
    this.puffs = this.puffs.filter((p) => p.t < p.life);
    // 觀眾閃光燈
    if (D.flashBand) {
      const rate = (D.flash || 0) * 0.02 + this.excite * 0.35;
      if (Math.random() < rate) this.flashes.push({ fx: rnd(0, 1), fy: rnd(D.flashBand[0], D.flashBand[1]), t: 0 });
    }
    for (const f of this.flashes) f.t++;
    this.flashes = this.flashes.filter((f) => f.t < 5);
    for (const c of this.confetti) { c.y += c.vy; c.x += c.vx + Math.sin(this.t * 0.1 + c.ph) * 1.2; c.life--; }
    this.confetti = this.confetti.filter((c) => c.life > 0 && c.y < VIEW_H + 20);
  }

  advanceTo(t, camX) {
    if (t < this.t || t - this.t > 120) this.t = t - 1;
    while (this.t < t) this.update(camX);
  }

  // ---------- 繪製 ----------
  drawBack(g, camX, vw = VIEW_W) {
    const D = this.D;
    if (!D.on) return;
    const G = stageGeom(this.id, camX, vw);
    if (!G) return;
    const at = (fx, fy) => [G.x + fx * G.w, G.y + fy * G.h];
    const t = this.t;
    g.save();
    // 極光：天空上方流動的綠色光帶
    if (D.aurora) {
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        g.fillStyle = k === 1 ? 'rgba(80,255,200,0.07)' : 'rgba(60,220,140,0.06)';
        for (let x = 0; x < VIEW_W; x += PX * 2) {
          const y = 60 + k * 34 + Math.sin(x * 0.006 + t * 0.012 + k) * 26 + Math.sin(x * 0.017 - t * 0.02) * 10;
          const h = 60 + Math.sin(x * 0.01 + t * 0.03 + k * 2) * 30;
          g.fillRect(x, px(y), PX * 2, px(h));
        }
      }
      g.globalCompositeOperation = 'source-over';
    }
    // 聚光燈：天花板左右擺動的光錐
    if (D.spots) {
      g.globalCompositeOperation = 'lighter';
      D.spots.forEach((fx, i) => {
        const [x0] = at(fx, 0);
        const a = Math.sin(t * 0.012 + i * 2.1) * 0.35 + (this.excite > 0.6 ? Math.sin(t * 0.08 + i) * 0.2 : 0);
        g.save();
        g.translate(x0, -20);
        g.rotate(a);
        g.fillStyle = `rgba(255,236,190,${0.07 + this.excite * 0.05})`;
        g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 0); g.lineTo(150, 720); g.lineTo(-150, 720); g.fill();
        g.restore();
      });
      g.globalCompositeOperation = 'source-over';
    }
    // 閃電：前 3 tick 天空閃白，雷電折線
    if (this.bolt) {
      const b = this.bolt;
      if (b.t < 3) { g.fillStyle = 'rgba(220,230,255,0.35)'; g.fillRect(0, 0, VIEW_W, VIEW_H); }
      if (b.t < 8) {
        g.fillStyle = '#f4f8ff';
        for (let i = 1; i < b.seg.length; i++) {
          const [x0, y0] = b.seg[i - 1], [x1, y1] = b.seg[i];
          for (let k = 0; k <= 6; k++) g.fillRect(px(x0 + ((x1 - x0) * k) / 6), px(y0 + ((y1 - y0) * k) / 6), PX * 2, PX * 2);
        }
      }
    }
    // 海鷗
    for (const gl of this.gulls) {
      const flap = Math.floor((t + gl.ph * 10) / 10) % 2;
      g.fillStyle = '#2a2030';
      const x = px(gl.x), y = px(gl.y);
      if (flap) { g.fillRect(x - 9, y, 6, 3); g.fillRect(x - 3, y + 3, 6, 3); g.fillRect(x + 3, y, 6, 3); }
      else { g.fillRect(x - 9, y + 3, 18, 3); }
    }
    // 老鷹：草原上空大圈盤旋
    if (D.eagle) {
      const a = t * 0.006;
      const x = px(VIEW_W / 2 + Math.cos(a) * 380 - (camX - 310) * 0.3), y = px(110 + Math.sin(a) * 40);
      const flap = Math.floor(t / 14) % 3 === 0;
      g.fillStyle = '#3a2a22';
      g.fillRect(x - 3, y, 9, 6);
      if (flap) { g.fillRect(x - 21, y - 6, 18, 3); g.fillRect(x + 6, y - 6, 18, 3); }
      else { g.fillRect(x - 24, y + 3, 21, 3); g.fillRect(x + 6, y + 3, 21, 3); }
    }
    // 天燈：夜空緩緩上升的橘色燈
    for (const l of this.lamps) {
      const [x, y] = at(l.fx, l.fy);
      const fl = 0.8 + Math.sin(t * 0.2 + l.ph) * 0.2;
      g.fillStyle = `rgba(255,170,60,${0.25 * fl})`;
      g.fillRect(px(x) - 6, px(y) - 6, 15, 18);
      g.fillStyle = '#ffcf6a';
      g.fillRect(px(x) - 3, px(y) - 3, 9, 9);
      g.fillStyle = '#ff8a2a';
      g.fillRect(px(x) - 3, px(y) + 6, 9, 3);
    }
    // 海面波光
    if (D.glint) {
      const [x0, x1, y0, y1] = D.glint;
      g.fillStyle = '#fff6c8';
      for (let i = 0; i < 26; i++) {
        const seed = i * 97.13;
        if ((Math.floor(t / 8) + i) % 5) continue;
        const [x, y] = at(x0 + ((seed * 0.618) % 1) * (x1 - x0), y0 + ((seed * 0.377) % 1) * (y1 - y0));
        g.fillRect(px(x), px(y), (i % 3 ? 3 : 6), 3);
      }
    }
    // 燈籠閃爍
    for (const [fx, fy] of D.lanterns || []) {
      const [x, y] = at(fx, fy);
      const f = 0.12 + Math.abs(Math.sin(t * 0.07 + fx * 9)) * 0.1 + (Math.random() < 0.04 ? 0.08 : 0);
      g.fillStyle = `rgba(255,190,90,${f})`;
      g.beginPath(); g.arc(x, y, 40, 0, Math.PI * 2); g.fill();
    }
    // 蒸氣／香煙
    for (const p of this.puffs) {
      const [x, y] = at(p.fx, p.fy);
      const a = (p.smoke ? 0.3 : 0.18) * Math.min(1, p.t / 10) * (1 - p.t / p.life);
      g.fillStyle = p.smoke ? `rgba(220,215,235,${a})` : `rgba(255,255,255,${a})`;
      const r = px(p.r);
      g.fillRect(px(x + p.dx) - r, px(y + p.dy) - r, r * 2, r * 2);
    }
    // 山嵐：寺院底部緩慢飄過的雲霧
    if (D.mist) {
      for (let i = 0; i < 4; i++) {
        const x = ((t * (0.25 + i * 0.1) + i * 420) % (VIEW_W + 600)) - 300;
        const [, y] = at(0, 0.6 + i * 0.025);
        g.fillStyle = 'rgba(235,235,245,0.13)';
        g.fillRect(px(x), px(y), 360, 24);
        g.fillRect(px(x) + 60, px(y) - 12, 240, 12);
      }
    }
    // 雲影：草原地面上滑過的大片陰影
    if (D.cloud) {
      const x = ((t * 0.5) % (VIEW_W + 900)) - 450 - (camX - 310) * 0.2;
      g.fillStyle = 'rgba(20,30,10,0.12)';
      g.beginPath(); g.ellipse(x, LAYOUT.groundY + 10, 320, 46, 0, 0, Math.PI * 2); g.fill();
    }
    // 觀眾閃光燈
    for (const f of this.flashes) {
      const [x, y] = at(f.fx, f.fy);
      g.fillStyle = f.t < 2 ? '#ffffff' : 'rgba(255,255,255,0.5)';
      const s = f.t < 2 ? 6 : 3;
      g.fillRect(px(x) - s, px(y) - s, s * 2 + 3, s * 2 + 3);
      if (f.t < 2) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(px(x) - 15, px(y), 33, 3); g.fillRect(px(x), px(y) - 15, 3, 33); }
    }
    // 雨滴落地的水花
    g.fillStyle = 'rgba(200,220,255,0.55)';
    for (const s of this.splash) {
      const w = 3 + s.t * 2;
      g.fillRect(px(s.x - w), px(s.y), 3, 3);
      g.fillRect(px(s.x + w), px(s.y), 3, 3);
      if (s.t < 3) g.fillRect(px(s.x), px(s.y - 6), 3, 3);
    }
    g.restore();
  }

  drawFront(g) {
    const D = this.D;
    if (!D.on) return;
    g.save();
    if (this.drops.length) {
      g.fillStyle = 'rgba(170,200,255,0.42)';
      for (const d of this.drops) {
        const x = px(d.x), y = px(d.y);
        for (let k = 0; k < d.l; k += PX * 2) g.fillRect(x + Math.round(k * 0.18 / PX) * PX, y - k, PX, PX * 2);
      }
    }
    for (const f of this.flakes) {
      g.fillStyle = f.s > 1 ? '#ffffff' : 'rgba(235,245,255,0.8)';
      g.fillRect(px(f.x), px(f.y), PX * f.s, PX * f.s);
    }
    for (const p of this.petals) {
      const flip = Math.sin(this.t * 0.15 + p.ph) > 0;
      g.fillStyle = flip ? '#ffb7d5' : '#ffe0ee';
      g.fillRect(px(p.x), px(p.y), flip ? PX * 2 : PX, PX);
    }
    for (const s of this.seeds) {
      g.fillStyle = 'rgba(255,250,220,0.8)';
      g.fillRect(px(s.x), px(s.y), PX, PX);
    }
    for (const l of this.leaves) {
      g.fillStyle = Math.sin(this.t * 0.1 + l.ph) > 0 ? '#e0a040' : '#b06a20';
      g.fillRect(px(l.x), px(l.y), PX * 2, PX);
    }
    for (const e of this.embers) {
      g.fillStyle = Math.sin(this.t * 0.2 + e.ph) > 0 ? '#ffb347' : '#ff5a1e';
      g.fillRect(px(e.x), px(e.y), PX, PX);
    }
    if (this.sand.length) {
      g.fillStyle = 'rgba(230,200,140,0.45)';
      for (const s of this.sand) g.fillRect(px(s.x), px(s.y), px(s.l), PX);
    }
    for (const c of this.confetti) {
      g.fillStyle = c.c;
      g.fillRect(px(c.x), px(c.y), Math.sin(this.t * 0.3 + c.ph) > 0 ? PX * 2 : PX, PX);
    }
    // 地下拳場的煙霧
    if (D.haze) {
      for (let i = 0; i < 3; i++) {
        const x = ((this.t * (0.3 + i * 0.15) + i * 500) % (VIEW_W + 800)) - 400;
        g.fillStyle = 'rgba(200,190,180,0.05)';
        g.fillRect(px(x), px(260 + i * 90), 420, 60);
      }
    }
    g.restore();
  }
}

// 選單／劇情背景用：每個舞台共用一份
const shared = new Map();
export function backdropFX(stageId) {
  let f = shared.get(stageId);
  if (!f) { f = new StageFX(stageId); shared.set(stageId, f); }
  return f;
}

export const STAGE_FX_IDS = Object.keys(STAGES);
