// 繪製：舞台、角色、飛行道具、特效、HUD、判定框、訓練資訊
import { VIEW_W, VIEW_H, LAYOUT, STAGES, FX } from './config.js';
import { ASSETS, altAtlasImages } from './assets.js';

export const view = { showBoxes: false, hudRects: [], devHud: false, renderScale: 1, alpha: 1 };

// 舞台背景快取：先依目前畫布解析度縮放好一次，之後每幀 1:1 貼圖（縮放大圖是每幀最貴的操作）
const stageCache = new Map();
function stageLayer(stageId, img, s, rs) {
  const needW = VIEW_W + (LAYOUT.stageW - VIEW_W) * s.parallax;
  const sc = Math.max(needW / img.width, (VIEW_H * 1.05) / img.height) * s.scale;
  const w = img.width * sc, h = img.height * sc;
  const key = `${rs}|${w.toFixed(1)}|${h.toFixed(1)}`;
  let L = stageCache.get(stageId);
  if (!L || L.key !== key) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * rs);
    c.height = Math.ceil(h * rs);
    const cg = c.getContext('2d', { alpha: false });
    cg.imageSmoothingQuality = 'high';
    cg.drawImage(img, 0, 0, c.width, c.height);
    L = { key, canvas: c, w, h, needW };
    stageCache.set(stageId, L);
  }
  return L;
}

const FONT = '"Bungee", "Noto Sans TC", Impact, sans-serif';
const FONT_TC = '"Noto Sans TC", "PingFang TC", sans-serif';

export function text(g, str, x, y, { size = 24, color = '#fff', align = 'center', outline = '#14080c', lw = 0, font = FONT, base = 'middle', shadow = true } = {}) {
  g.font = `${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = base;
  if (shadow) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillText(str, x + size * 0.06, y + size * 0.08); }
  if (outline) {
    g.lineJoin = 'round';
    g.strokeStyle = outline;
    g.lineWidth = lw || Math.max(3, size * 0.16);
    g.strokeText(str, x, y);
  }
  g.fillStyle = color;
  g.fillText(str, x, y);
}

// ---------- 舞台 ----------
export function drawStage(g, stageId, camX, t = 0) {
  const s = STAGES[stageId];
  const img = ASSETS.stages[stageId];
  const gy = LAYOUT.groundY;
  if (img) {
    const rs = view.renderScale || 1;
    const L = stageLayer(stageId, img, s, rs);
    const x = -camX * s.parallax - Math.max(0, (L.w - L.needW) / 2);
    const y = gy - s.y * L.h;
    const m = g.getTransform();
    if (Math.abs(m.a - rs) < 1e-3 && Math.abs(m.d - rs) < 1e-3 && !m.b && !m.c) {
      g.save();
      g.setTransform(1, 0, 0, 1, Math.round(m.e + x * rs), Math.round(m.f + y * rs));
      g.drawImage(L.canvas, 0, 0);
      g.restore();
    } else {
      g.drawImage(L.canvas, x, y, L.w, L.h);
    }
    if (s.tint) { g.fillStyle = s.tint; g.fillRect(0, 0, VIEW_W, VIEW_H); }
  } else {
    const grd = g.createLinearGradient(0, 0, 0, VIEW_H);
    grd.addColorStop(0, '#1b1036');
    grd.addColorStop(0.6, '#4a1f4f');
    grd.addColorStop(1, '#120a18');
    g.fillStyle = grd;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.fillStyle = '#2a1a2e';
    g.fillRect(0, gy, VIEW_W, VIEW_H - gy);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let x = -((camX * 1) % 120); x < VIEW_W; x += 120) { g.beginPath(); g.moveTo(x, gy); g.lineTo(x - 200, VIEW_H); g.stroke(); }
  }
}

// ---------- 角色 ----------
function drawFighter(g, f, camX, t) {
  const fi = f.frameInfo();
  const fr = f.sprite(fi);
  let sx = f.rx - camX;
  if (f.hitstop > 0 && (f.state === 'hitstun' || f.state === 'blockstun' || f.state === 'airHit')) sx += (f.hitstop % 2 ? 3 : -3);
  if (f.state === 'dizzy') sx += Math.sin(t * 0.15) * 4;
  if (fr) {
    const atlas = ASSETS.chars[f.def.id];
    const imgs = f.alt ? altAtlasImages(f.def.id) || atlas.images : atlas.images;
    const x = f.spriteXform(fi, fr, f.ry);
    g.save();
    g.translate(sx + f.facing * x.dx, LAYOUT.groundY - x.baseY);
    g.scale(f.facing * x.k, x.k);
    g.drawImage(imgs[fr.p], fr.x, fr.y, fr.w, fr.h, -x.ax, -x.ay, fr.w, fr.h);
    if (f.flash > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55;
      g.drawImage(imgs[fr.p], fr.x, fr.y, fr.w, fr.h, -x.ax, -x.ay, fr.w, fr.h);
    }
    g.restore();
  } else {
    drawPuppet(g, f, sx);
  }
  if (f.state === 'dizzy') drawDizzy(g, sx, LAYOUT.groundY - LAYOUT.charH - 20, t);
}

// 高刷新率螢幕：位置在上一個與目前 tick 之間插值（瞬移時直接用目前位置）
function interp(b) {
  const a = view.alpha ?? 1;
  const lerp = (p, c) => (p === undefined || Math.abs(c - p) > 160 ? c : p + (c - p) * a);
  b.rcamX = lerp(b.pcamX, b.camX);
  for (const f of b.fighters) { f.rx = lerp(f.px, f.x); f.ry = Math.max(0, lerp(f.py, f.y)); }
  for (const p of b.projectiles) p.rx = lerp(p.px, p.x);
}

// 沒有 sprite 時的替代人偶（判定框形狀）
function drawPuppet(g, f, sx) {
  const gy = LAYOUT.groundY;
  const hurts = f.hurtboxes();
  const body = hurts[0] || f.rel([-40, 0, 80, f.crouching ? 170 : 280]);
  const camX = f.rx - sx;
  g.fillStyle = f.alt ? '#7a6cff' : f.def.color;
  g.strokeStyle = '#000';
  g.lineWidth = 3;
  const x0 = body.x0 - camX, w = body.x1 - body.x0, y1 = gy - body.y1, h = body.y1 - body.y0;
  g.fillRect(x0, y1 + 40, w, h - 40);
  g.strokeRect(x0, y1 + 40, w, h - 40);
  g.beginPath();
  g.arc(x0 + w / 2 + f.facing * 6, y1 + 22, 22, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  for (const [, h2] of f.activeHits()) {
    const r = f.hitRect(h2);
    g.fillRect(r.x0 - camX, gy - r.y1, r.x1 - r.x0, r.y1 - r.y0);
    g.strokeRect(r.x0 - camX, gy - r.y1, r.x1 - r.x0, r.y1 - r.y0);
  }
  text(g, f.state === 'move' ? f.moveName : f.state, x0 + w / 2, y1, { size: 14 });
}

function drawDizzy(g, x, y, t) {
  for (let i = 0; i < 3; i++) {
    const a = t * 0.12 + (i * Math.PI * 2) / 3;
    const px = x + Math.cos(a) * 46, py = y + Math.sin(a) * 12;
    g.fillStyle = i % 2 ? '#ffe14a' : '#ffffff';
    star(g, px, py, 10);
  }
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function drawShadow(g, f, camX) {
  const h = Math.min(1, f.ry / 300);
  const w = (f.state === 'knockdown' || f.state === 'ko' ? 110 : 70) * (1 - h * 0.5);
  g.fillStyle = `rgba(0,0,0,${LAYOUT.shadowAlpha * (1 - h * 0.6)})`;
  g.beginPath();
  g.ellipse(f.rx - camX, LAYOUT.groundY + 2, w, 12 * (1 - h * 0.4), 0, 0, Math.PI * 2);
  g.fill();
}

// ---------- 飛行道具 ----------
function drawProjectile(g, p, camX, t) {
  const atlas = ASSETS.chars[p.owner.def.id];
  const frames = atlas && atlas.anims[p.kind];
  const sx = p.rx - camX, sy = LAYOUT.groundY - p.y;
  g.save();
  if (p.spec.super) {
    // 外圈光暈與電弧
    const r = 90 * p.scale * 0.6;
    const grd = g.createRadialGradient(sx, sy, 10, sx, sy, r * 1.6);
    grd.addColorStop(0, 'rgba(255,255,220,0.9)');
    grd.addColorStop(0.4, 'rgba(120,190,255,0.5)');
    grd.addColorStop(1, 'rgba(60,80,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(sx, sy, r * 1.6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(200,230,255,0.9)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      let a = Math.random() * Math.PI * 2, rr = r * 0.4;
      g.moveTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
      for (let k = 0; k < 4; k++) { rr += r * 0.3; a += (Math.random() - 0.5) * 0.9; g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
      g.stroke();
    }
  }
  if (frames && frames.length) {
    const valid = frames.filter(Boolean);
    const fr = valid[Math.floor(t / 4) % valid.length];
    const k = p.owner.k * p.scale;
    g.translate(sx, sy);
    g.scale(p.facing * k, k);
    g.drawImage(atlas.images[fr.p], fr.x, fr.y, fr.w, fr.h, -fr.cx, -fr.cy, fr.w, fr.h);
    if (p.spec.super) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35;
      g.drawImage(atlas.images[fr.p], fr.x, fr.y, fr.w, fr.h, -fr.cx, -fr.cy, fr.w, fr.h);
    }
  } else {
    const r = 40 * p.scale;
    const grd = g.createRadialGradient(sx, sy, 4, sx, sy, r);
    grd.addColorStop(0, '#fff');
    grd.addColorStop(0.4, '#ffb347');
    grd.addColorStop(1, 'rgba(60,120,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------- 特效 ----------
function drawEffects(g, fx, camX) {
  const gy = LAYOUT.groundY;
  for (const e of fx.list) {
    const x = e.x - camX, y = gy - e.y;
    const p = e.t / e.life;
    if (e.type === 'hit' || e.type === 'block') {
      const R = (e.type === 'block' ? 46 : 62) * e.size;
      g.save();
      g.translate(x, y);
      g.globalAlpha = 1 - p * 0.9;
      // 中心光
      const grd = g.createRadialGradient(0, 0, 2, 0, 0, R * (0.5 + p * 0.6));
      if (e.type === 'block') { grd.addColorStop(0, 'rgba(230,250,255,1)'); grd.addColorStop(0.5, 'rgba(90,200,255,0.7)'); grd.addColorStop(1, 'rgba(40,120,255,0)'); }
      else { grd.addColorStop(0, 'rgba(255,255,240,1)'); grd.addColorStop(0.45, 'rgba(255,190,60,0.85)'); grd.addColorStop(1, 'rgba(255,60,20,0)'); }
      g.fillStyle = grd;
      g.beginPath(); g.arc(0, 0, R * (0.5 + p * 0.6), 0, Math.PI * 2); g.fill();
      // 放射線
      g.strokeStyle = e.type === 'block' ? '#dff6ff' : '#fff6c8';
      g.lineCap = 'round';
      for (const r of e.rays) {
        const l0 = R * (0.2 + p * 0.9) * r.len, l1 = R * (0.6 + p * 1.2) * r.len;
        g.lineWidth = Math.max(1, 6 * e.size * (1 - p));
        g.beginPath();
        g.moveTo(Math.cos(r.a) * l0, Math.sin(r.a) * l0);
        g.lineTo(Math.cos(r.a) * l1, Math.sin(r.a) * l1);
        g.stroke();
      }
      g.restore();
    } else if (e.type === 'bit') {
      g.globalAlpha = 1 - p;
      g.fillStyle = e.color;
      g.fillRect(x - 2, y - 2, 4, 4);
      g.globalAlpha = 1;
    } else if (e.type === 'dust') {
      g.globalAlpha = 0.45 * (1 - p);
      g.fillStyle = '#d8ccb8';
      g.beginPath(); g.arc(x, y, e.r * (0.6 + p), 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    } else if (e.type === 'ring') {
      g.globalAlpha = 1 - p;
      g.strokeStyle = e.color;
      g.lineWidth = 4;
      g.beginPath(); g.arc(x, y, (20 + p * 60) * e.size, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    } else if (e.type === 'text') {
      g.globalAlpha = Math.min(1, (1 - p) * 2);
      text(g, e.txt, x, y - 0, { size: e.size, color: e.color });
      g.globalAlpha = 1;
    }
  }
}

function drawBoxes(g, b) {
  const camX = b.rcamX, gy = LAYOUT.groundY;
  const rect = (r, fill, stroke) => {
    g.fillStyle = fill; g.strokeStyle = stroke; g.lineWidth = 2;
    g.fillRect(r.x0 - camX, gy - r.y1, r.x1 - r.x0, r.y1 - r.y0);
    g.strokeRect(r.x0 - camX, gy - r.y1, r.x1 - r.x0, r.y1 - r.y0);
  };
  for (const f of b.fighters) {
    rect(f.pushbox(), 'rgba(255,230,0,0.06)', 'rgba(255,230,0,0.7)');
    for (const h of f.hurtboxes()) rect(h, 'rgba(60,140,255,0.22)', 'rgba(80,170,255,0.9)');
    for (const [, h] of f.activeHits()) rect(f.hitRect(h), 'rgba(255,40,40,0.35)', 'rgba(255,60,60,1)');
    // 錨點
    g.fillStyle = '#fff';
    g.fillRect(f.x - camX - 1, gy - f.y - 6, 2, 12);
  }
  for (const p of b.projectiles) rect(b.projRect(p), 'rgba(255,40,40,0.3)', 'rgba(255,80,80,1)');
}

// ---------- 主繪製 ----------
export function drawBattle(g, b, t) {
  const [ox, oy] = b.fx.offset();
  g.save();
  g.translate(ox, oy);
  interp(b);
  drawStage(g, b.stage, b.rcamX, t);
  if (b.superT > 0) {
    // 超必殺暗場
    const o = b.superOwner;
    const p = 1 - b.superT / FX.superFlash;
    g.fillStyle = `rgba(5,0,15,${Math.min(0.78, p * 4)})`;
    g.fillRect(-20, -20, VIEW_W + 40, VIEW_H + 40);
    const cx = o.rx - b.rcamX, cy = LAYOUT.groundY - 170;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = o.def.color;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + t * 0.02;
      g.globalAlpha = 0.25;
      g.lineWidth = 3 + (i % 3) * 3;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
      g.lineTo(cx + Math.cos(a) * 900, cy + Math.sin(a) * 900);
      g.stroke();
    }
    g.restore();
  }
  for (const f of b.fighters) drawShadow(g, f, b.rcamX);
  // 出招中的角色畫在上層
  const order = b.fighters.slice().sort((a, c) => (a.state === 'move' ? 1 : 0) - (c.state === 'move' ? 1 : 0));
  for (const f of order) drawFighter(g, f, b.rcamX, t);
  for (const p of b.projectiles) drawProjectile(g, p, b.rcamX, t);
  drawEffects(g, b.fx, b.rcamX);
  if (view.showBoxes || (b.training && b.training.boxes)) drawBoxes(g, b);
  g.restore();
  if (b.superT > 0) drawCutIn(g, b, t);
  if (b.fx.flashT > 0) { g.fillStyle = `rgba(255,255,255,${b.fx.flashT / 8})`; g.fillRect(0, 0, VIEW_W, VIEW_H); }
  drawHUD(g, b, t);
}

// 超必殺頭像切入
function drawCutIn(g, b, t) {
  const o = b.superOwner;
  const p = 1 - b.superT / FX.superFlash;
  const img = ASSETS.portraits[o.def.id];
  const left = o.side === 0;
  const slide = p < 0.2 ? p / 0.2 : p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
  const bandY = 230, bandH = 190;
  g.save();
  g.globalAlpha = slide;
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(0, bandY, VIEW_W, bandH);
  g.fillStyle = o.def.color;
  g.fillRect(0, bandY, VIEW_W, 4);
  g.fillRect(0, bandY + bandH - 4, VIEW_W, 4);
  if (img) {
    const h = bandH + 60, w = (img.width / img.height) * h;
    const x = left ? -w + slide * (w + 80) : VIEW_W + w - slide * (w + 80) - w;
    g.save();
    g.beginPath(); g.rect(0, bandY + 4, VIEW_W, bandH - 8); g.clip();
    if (!left) { g.translate(x + w, 0); g.scale(-1, 1); g.drawImage(img, 0, bandY - 30, w, h); }
    else g.drawImage(img, x, bandY - 30, w, h);
    g.restore();
  }
  const name = o.def.moveNames.super.zh.replace('超必殺・', '');
  text(g, name, left ? VIEW_W - 60 : 60, bandY + bandH / 2 - 14, { size: 54, align: left ? 'right' : 'left', color: '#fff', font: FONT_TC, outline: o.def.color, lw: 8 });
  text(g, 'SUPER ART', left ? VIEW_W - 60 : 60, bandY + bandH / 2 + 46, { size: 24, align: left ? 'right' : 'left', color: o.def.color });
  g.restore();
}

// ---------- HUD ----------
function reg(key, x, y, w, h) { view.hudRects.push({ key, x, y, w, h }); }

function bar(g, x, y, w, h, skew, ratio, trail, colors, flip) {
  const path = (x0, x1) => {
    g.beginPath();
    g.moveTo(x0 + skew, y); g.lineTo(x1 + skew, y); g.lineTo(x1, y + h); g.lineTo(x0, y + h); g.closePath();
  };
  // 外框
  path(x - 4, x + w + 4);
  g.fillStyle = '#0c0608';
  g.save(); g.translate(0, -3); g.scale(1, 1); g.fill(); g.restore();
  path(x, x + w);
  g.fillStyle = colors.barBg; g.fill();
  const seg = (r) => (flip ? [x + w * (1 - r), x + w] : [x, x + w * r]);
  if (trail > ratio) { const [a, c] = seg(trail); path(a, c); g.fillStyle = colors.trail; g.fill(); }
  const [a, c] = seg(Math.max(0, ratio));
  path(a, c);
  const grd = g.createLinearGradient(0, y, 0, y + h);
  const col = ratio < 0.25 ? colors.hpLow : colors.hp;
  grd.addColorStop(0, '#fff8d0'); grd.addColorStop(0.25, col); grd.addColorStop(1, shade(col));
  g.fillStyle = grd; g.fill();
  path(x, x + w);
  g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke();
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  return `rgb(${r * 0.55 | 0},${gg * 0.55 | 0},${b * 0.55 | 0})`;
}

export function drawHUD(g, b, t) {
  const H = LAYOUT.hud, C = LAYOUT.colors;
  view.hudRects = [];
  const [p1, p2] = b.fighters;
  for (const f of [p1, p2]) {
    const flip = f.side === 1;
    const mx = (x, w = 0) => (flip ? VIEW_W - x - w : x);
    // 血條
    const bx = mx(H.bar.x, H.bar.w);
    bar(g, bx, H.bar.y, H.bar.w, H.bar.h, flip ? -H.bar.skew : H.bar.skew, f.hp / f.def.hp, f.hpTrail / f.def.hp, C, !flip ? false : true);
    if (!flip) reg('bar', bx, H.bar.y, H.bar.w, H.bar.h);
    // 暈眩條
    const sw = H.stun.w * Math.min(1, f.stun / f.def.stunMax);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(mx(H.stun.x, H.stun.w), H.stun.y, H.stun.w, H.stun.h);
    g.fillStyle = f.pendingDizzy || f.state === 'dizzy' ? '#ff4040' : '#ffffff';
    g.fillRect(flip ? VIEW_W - H.stun.x - sw : H.stun.x, H.stun.y, sw, H.stun.h);
    if (!flip) reg('stun', H.stun.x, H.stun.y, H.stun.w, H.stun.h);
    // 頭像
    const img = ASSETS.portraits[f.def.id];
    const ps = H.portrait.size;
    const px = mx(H.portrait.x, ps);
    g.fillStyle = '#0c0608';
    g.fillRect(px - 2, H.portrait.y - 2, ps + 4, ps + 4);
    g.fillStyle = f.def.color;
    g.fillRect(px, H.portrait.y, ps, ps);
    if (img) {
      g.save();
      g.beginPath(); g.rect(px, H.portrait.y, ps, ps); g.clip();
      const s = ps * 1.25 / Math.max(img.width, img.height) * 1.6;
      const iw = img.width * s, ih = img.height * s;
      if (flip) { g.translate(px + ps, 0); g.scale(-1, 1); g.drawImage(img, ps / 2 - iw * 0.5, H.portrait.y - ih * 0.05, iw, ih); }
      else g.drawImage(img, px + ps / 2 - iw * 0.5, H.portrait.y - ih * 0.05, iw, ih);
      g.restore();
    }
    if (!flip) reg('portrait', px, H.portrait.y, ps, ps);
    // 名字
    text(g, f.def.name, flip ? VIEW_W - H.name.x : H.name.x, H.name.y, { size: H.name.size, align: flip ? 'right' : 'left', color: C.text });
    if (!flip) reg('name', H.name.x, H.name.y - H.name.size / 2, 160, H.name.size);
    // 回合勝利標記
    for (let i = 0; i < GAME_ROUNDS(); i++) {
      const cx = flip ? VIEW_W - H.wins.x + i * H.wins.gap : H.wins.x - i * H.wins.gap;
      g.beginPath(); g.arc(cx, H.wins.y, H.wins.r, 0, Math.PI * 2);
      g.fillStyle = i < f.wins ? '#ffd23a' : 'rgba(0,0,0,0.55)';
      g.fill(); g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke();
      if (i < f.wins) { g.fillStyle = '#fff6c0'; star(g, cx, H.wins.y, H.wins.r * 0.7); }
    }
    if (!flip) reg('wins', H.wins.x - H.wins.gap * 2, H.wins.y - H.wins.r, H.wins.gap * 2 + H.wins.r, H.wins.r * 2);
    // 超必殺量表
    const m = H.meter, full = f.meter >= 100;
    const mxm = mx(m.x, m.w);
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(mxm - 3, m.y - 3, m.w + 6, m.h + 6);
    const mw = m.w * (f.meter / 100);
    g.fillStyle = full ? (t % 20 < 10 ? C.meterFull : '#ffffff') : C.meter;
    g.fillRect(flip ? VIEW_W - m.x - mw : m.x, m.y, mw, m.h);
    text(g, full ? 'SUPER OK!' : 'SUPER', flip ? VIEW_W - m.x : m.x, m.y - 14, { size: 16, align: flip ? 'right' : 'left', color: full ? C.meterFull : '#bfe9ff' });
    if (!flip) reg('meter', m.x, m.y - 24, m.w, m.h + 24);
    // 連段數
    const cs = b.comboShow[f.side];
    if (cs && cs.hits >= 2) {
      const a = 1 - (cs.fade || 0) / 30;
      g.globalAlpha = Math.max(0, a);
      const pop = cs.t < 6 ? 1 + (6 - cs.t) * 0.06 : 1;
      const cx = flip ? VIEW_W - H.combo.x : H.combo.x;
      text(g, `${cs.hits}`, cx, H.combo.y, { size: H.combo.size * 1.4 * pop, align: flip ? 'right' : 'left', color: C.combo });
      text(g, 'HITS', cx + (flip ? -1 : 1) * (String(cs.hits).length * H.combo.size * 0.95 + 8), H.combo.y + 6, { size: H.combo.size * 0.6, align: flip ? 'right' : 'left', color: '#fff' });
      text(g, `${cs.dmg} DMG`, cx, H.combo.y + H.combo.size * 0.95, { size: H.combo.size * 0.38, align: flip ? 'right' : 'left', color: '#ffd9a8' });
      g.globalAlpha = 1;
    }
    if (!flip) reg('combo', H.combo.x, H.combo.y - H.combo.size, 200, H.combo.size * 2);
  }
  // 計時器
  const tm = b.isTraining ? '∞' : GAME_TIME() >= 100 ? '∞' : String(b.timer).padStart(2, '0');
  g.fillStyle = 'rgba(10,4,8,0.75)';
  g.fillRect(H.timer.x - H.timer.size * 0.8, H.timer.y - H.timer.size * 0.62, H.timer.size * 1.6, H.timer.size * 1.24);
  text(g, tm, H.timer.x, H.timer.y + 2, { size: H.timer.size, color: b.timer <= 10 && !b.isTraining && t % 30 < 15 ? '#ff4a2a' : C.timer });
  reg('timer', H.timer.x - H.timer.size * 0.8, H.timer.y - H.timer.size * 0.62, H.timer.size * 1.6, H.timer.size * 1.24);
  // 中央訊息
  for (const m of b.msgs) {
    const p = m.t / m.life;
    const sc = m.t < 8 ? 1.6 - (m.t / 8) * 0.6 : 1;
    g.globalAlpha = p > 0.85 ? (1 - p) / 0.15 : 1;
    text(g, m.text, VIEW_W / 2, H.msg.y, { size: H.msg.size * sc, color: m.color, lw: 10 });
    if (m.sub) text(g, m.sub, VIEW_W / 2, H.sub.y, { size: H.sub.size, color: '#ffd84a' });
    g.globalAlpha = 1;
  }
  reg('msg', VIEW_W / 2 - 300, H.msg.y - H.msg.size / 2, 600, H.msg.size);
  if (b.training) drawTrainingHUD(g, b, t);
  if (view.devHud) {
    g.strokeStyle = 'rgba(0,255,200,0.8)';
    g.setLineDash([6, 4]);
    g.lineWidth = 1;
    for (const r of view.hudRects) { g.strokeRect(r.x, r.y, r.w, r.h); text(g, r.key, r.x + 4, r.y + 8, { size: 11, align: 'left', color: '#0fc', shadow: false, outline: '#000', lw: 3 }); }
    g.setLineDash([]);
  }
}

let GAME_ROUNDS = () => 2, GAME_TIME = () => 99;
export function bindGame(game) { GAME_ROUNDS = () => game.roundsToWin; GAME_TIME = () => game.time; }

// ---------- 訓練模式資訊 ----------
const ARROW = { 1: '↙', 2: '↓', 3: '↘', 4: '←', 5: '•', 6: '→', 7: '↖', 8: '↑', 9: '↗' };
const BTN_COL = { LP: '#7fd0ff', MP: '#4f9dff', HP: '#2f5bff', LK: '#ffb36b', MK: '#ff8a3a', HK: '#ff5a2a' };

function drawTrainingHUD(g, b, t) {
  const H = LAYOUT.hud;
  const T = b.training;
  if (T.frameData) {
    const fd = b.frameData[0];
    const d = b.fighters[1];
    const x = H.frameData.x, y = H.frameData.y, s = H.frameData.size;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x - 300, y - 14, 600, 54);
    if (fd) {
      const adv = fd.adv === null || fd.adv === undefined ? '—' : (fd.adv > 0 ? '+' : '') + fd.adv;
      const line = `${fd.name}   發生 ${fd.startup || '-'}F   持續 ${fd.active || '-'}F   硬直 ${fd.recovery}F   ${fd.res === 'block' ? '防禦' : '命中'}後 ${adv}`;
      text(g, line, x, y, { size: s, color: '#fff', font: FONT_TC, outline: null, shadow: false });
    }
    text(g, `傷害 ${d.lastDmg || 0}   連段 ${d.combo || 0} HIT / ${d.comboDmg || 0}   暈眩 ${Math.round(d.stun)}/${d.def.stunMax}`, x, y + 22, { size: s, color: '#ffd9a8', font: FONT_TC, outline: null, shadow: false });
    reg('frameData', x - 300, y - 14, 600, 54);
  }
  if (T.inputLog) {
    const log = b.fighters[0].input.log;
    const r = H.inputLog;
    const rows = log.slice(-r.rows).reverse();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(r.x - 6, r.y - 14, 150, r.rows * (r.size + 4) + 10);
    rows.forEach((e, i) => {
      const y = r.y + i * (r.size + 4);
      g.globalAlpha = 1 - i / (r.rows + 4);
      text(g, String(Math.min(99, e.n)).padStart(2, ' '), r.x, y, { size: r.size * 0.7, align: 'left', color: '#aaa', font: 'monospace', outline: null, shadow: false });
      text(g, ARROW[e.d], r.x + 30, y, { size: r.size, align: 'left', color: '#fff', font: FONT_TC, outline: null, shadow: false });
      e.b.forEach((bt, k) => {
        g.fillStyle = BTN_COL[bt];
        g.beginPath(); g.arc(r.x + 66 + k * 26, y, r.size * 0.55, 0, Math.PI * 2); g.fill();
        text(g, bt, r.x + 66 + k * 26, y + 1, { size: r.size * 0.42, color: '#fff', font: 'monospace', outline: null, shadow: false });
      });
      g.globalAlpha = 1;
    });
    reg('inputLog', r.x - 6, r.y - 14, 150, r.rows * (r.size + 4) + 10);
  }
}
