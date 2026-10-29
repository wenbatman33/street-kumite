// 繪製：舞台、角色、飛行道具、特效、HUD、判定框、訓練資訊
import { VIEW_W, VIEW_H, LAYOUT, STAGES, FX } from './config.js';
import { ASSETS, altAtlasImages } from './assets.js';
import { pixelOn, pixelize, pixelFrame, pixelArt, pixelGen, lowLayer, presentLow, snap, tinted } from './pixel.js';

export const view = { showBoxes: false, hudRects: [], devHud: false, renderScale: 1, alpha: 1 };

// 對戰鏡頭倍率（drawBattle 設定；選單等其他畫面為 1）
const CAM = { z: 1 };
const charPix = () => pixelOn() && LAYOUT.pixel.charSize > 1;
// 把世界座標對齊到角色層的像素格（鏡頭以地面為軸放大 Z 倍）
function snapW(x, y) {
  const P = LAYOUT.pixel.charSize, Z = CAM.z, gy = LAYOUT.groundY;
  return [Math.round((x * Z) / P) * P / Z, gy + (Math.round((gy + (y - gy) * Z) / P) * P - gy) / Z];
}

// 舞台背景快取：先依目前畫布解析度縮放好一次，之後每幀 1:1 貼圖（縮放大圖是每幀最貴的操作）
// 像素畫風：縮到低解析後再減色，色塊分明、去掉 AI 圖的柔焦泛光
const stageCache = new Map();
function stageLayer(stageId, img, s, rs) {
  const needW = VIEW_W + (LAYOUT.stageW - VIEW_W) * s.parallax;
  const sc = Math.max(needW / img.width, (VIEW_H * 1.05) / img.height) * s.scale;
  const w = img.width * sc, h = img.height * sc;
  const P = LAYOUT.pixel;
  const pix = pixelOn();
  const key = `${rs.toFixed(4)}|${w.toFixed(1)}|${h.toFixed(1)}|${pix ? `${pixelGen()}|${P.stageColors}|${P.dither}|${P.sat}|${P.contrast}` : ''}`;
  let L = stageCache.get(stageId);
  if (!L || L.key !== key) {
    let c;
    if (pix) c = pixelize(img, 0, 0, img.width, img.height, Math.round(w * rs), Math.round(h * rs), P.stageColors);
    else {
      c = document.createElement('canvas');
      c.width = Math.ceil(w * rs);
      c.height = Math.ceil(h * rs);
      const cg = c.getContext('2d', { alpha: false });
      cg.imageSmoothingQuality = 'high';
      cg.drawImage(img, 0, 0, c.width, c.height);
    }
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

// 背景圖目前在畫面上的位置與大小（舞台動態元素用圖片比例座標定位）
export function stageGeom(stageId, camX, vw = VIEW_W) {
  const s = STAGES[stageId], img = ASSETS.stages[stageId];
  if (!s || !img) return null;
  const needW = VIEW_W + (LAYOUT.stageW - VIEW_W) * s.parallax;
  const sc = Math.max(needW / img.width, (VIEW_H * 1.05) / img.height) * s.scale;
  const w = img.width * sc, h = img.height * sc;
  const mid = (LAYOUT.stageW - vw) / 2;
  return { x: vw / 2 - (camX - mid) * s.parallax - w / 2, y: LAYOUT.groundY - s.y * h, w, h };
}

// ---------- 舞台 ----------
// 背景整張用舞台視差捲動；地板（floor 以下）逐列捲動：越靠近鏡頭越快，角色腳下那一列與角色同速，
// 遠處與背景同速 → 腳不會在地板上滑，地板有透視縱深（90 年代街機的 line scroll 手法）
export function drawStage(g, stageId, camX, t = 0, vw = VIEW_W) {
  const s = STAGES[stageId];
  const img = ASSETS.stages[stageId];
  const gy = LAYOUT.groundY;
  if (img) {
    const m = g.getTransform();
    const rs = Math.abs(m.a) || 1;                    // 每世界單位的實際像素
    const L = stageLayer(stageId, img, s, rs);
    const mid = (LAYOUT.stageW - vw) / 2;            // 鏡頭置中時的 camX（vw = 畫面看得到的世界寬度）
    const par = s.parallax;
    const xAt = (p, w) => vw / 2 - (camX - mid) * p - w / 2;   // 某捲動速度下，寬 w 的圖片左緣
    const y = gy - s.y * L.h;
    const C = L.canvas;
    const floor = LAYOUT.pixel.floorScroll && s.floor && s.floor < s.y ? s.floor : 1;
    const fRow = Math.min(C.height, Math.round(floor * C.height));
    if (!m.b && !m.c) {
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      const top = Math.round(m.f + y * rs);
      g.drawImage(C, 0, 0, C.width, fRow, Math.round(m.e + xAt(par, L.w) * rs), top, C.width, fRow);
      if (fRow < C.height) {
        const floorY = y + floor * L.h;            // 地板起點（世界座標）
        const span = Math.max(1, gy - floorY);
        const maxRow = Math.min(C.height, Math.ceil(g.canvas.height - top));
        g.imageSmoothingEnabled = !pixelOn();
        for (let r = fRow; r < maxRow; r++) {
          const wy = y + r / rs;                       // 這一列的世界 y
          const p = par + (1 - par) * (wy - floorY) / span;
          const k = p / par;                           // 越近越寬（透視）
          g.drawImage(C, 0, r, C.width, 1, Math.round(m.e + xAt(p, L.w * k) * rs), top + r, Math.ceil(C.width * k), 1);
        }
      }
      g.restore();
    } else {
      g.drawImage(C, xAt(par, L.w), y, L.w, L.h);
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
  if (f.invisible) return;
  const fi = f.frameInfo();
  const fr = f.sprite(fi);
  let sx = f.rx - camX;
  if (f.hitstop > 0 && (f.state === 'hitstun' || f.state === 'blockstun' || f.state === 'airHit')) sx += (f.hitstop % 2 ? 1 : -1) * (f.hitShake ?? 3);
  if (f.state === 'dizzy') sx += Math.sin(t * 0.15) * 4;
  if (fr) {
    const atlas = ASSETS.chars[f.def.id];
    const imgs = f.alt ? altAtlasImages(f.def.id) || atlas.images : atlas.images;
    const x = f.spriteXform(fi, fr, f.ry);
    g.save();
    if (charPix()) {
      // 像素畫風：影格先縮到角色層的解析度並減色，錨點對齊像素格（1 影格像素 = 1 角色層像素）
      const P = LAYOUT.pixel.charSize, Z = CAM.z;
      const c = pixelFrame(imgs, fr, x.k * Z, P);
      g.translate(...snapW(sx + f.facing * x.dx, LAYOUT.groundY - x.baseY));
      if (f.rot) g.rotate((f.rot * Math.PI) / 180);
      g.scale((f.facing * P) / Z, P / Z);
      const ox = -Math.round(x.ax * c.kx) - c.pad, oy = -Math.round(x.ay * c.ky) - c.pad;
      g.drawImage(c, ox, oy);
      if (f.flash > 0) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.55;
        g.drawImage(c, ox, oy);
      }
      g.restore();
      if (f.state === 'dizzy') drawDizzy(g, sx, LAYOUT.groundY - LAYOUT.charH - 20, t);
      return;
    }
    g.translate(sx + f.facing * x.dx, LAYOUT.groundY - x.baseY);
    if (f.rot) g.rotate((f.rot * Math.PI) / 180);   // 被投演出中的空中翻轉（以錨點為軸）
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

// 殘影：突進、升龍、招牌跳躍技留下角色色的半透明剪影
function drawTrail(g, f, camX) {
  if (!f.trail || !f.trail.length || !charPix()) return;
  const atlas = ASSETS.chars[f.def.id];
  if (!atlas) return;
  const imgs = f.alt ? altAtlasImages(f.def.id) || atlas.images : atlas.images;
  const P = LAYOUT.pixel.charSize, Z = CAM.z;
  f.trail.forEach((s, i) => {
    const adj = f.def.spriteAdj[s.fi.anim] || {};
    const k = f.k * (adj.s || 1);
    const c = tinted(pixelFrame(imgs, s.fr, k * Z, P), f.alt ? '#8a7cff' : f.def.color);
    const ax = s.fi.mass ? s.fr.cx : s.fr.fx, ay = s.fi.mass ? s.fr.cy : s.fr.fy;
    const baseY = s.y + (s.fi.mass ? f.massY() : 0) + (adj.dy || 0);
    g.save();
    g.globalAlpha = 0.12 + 0.1 * i * (s.life / 8);
    g.translate(...snapW(s.x - camX + s.facing * (adj.dx || 0), LAYOUT.groundY - baseY));
    g.scale((s.facing * P) / Z, P / Z);
    g.drawImage(c, -Math.round(ax * c.kx) - c.pad, -Math.round(ay * c.ky) - c.pad);
    g.restore();
  });
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

// ---------- 影子 ----------
// 角色剪影快取：縮小 + 模糊後塗黑（放大畫回去時邊緣自然柔和）
const SIL_S = 0.25;
const silCache = new Map();
function silhouette(id, img, fr, blur) {
  const key = `${id}:${fr.p}:${fr.x}:${fr.y}:${blur}`;
  let c = silCache.get(key);
  if (c) return c;
  const pad = 6;
  c = document.createElement('canvas');
  c.width = Math.ceil(fr.w * SIL_S) + pad * 2;
  c.height = Math.ceil(fr.h * SIL_S) + pad * 2;
  const cg = c.getContext('2d');
  if (blur) cg.filter = `blur(${blur * SIL_S * 2}px)`;
  cg.drawImage(img, fr.x, fr.y, fr.w, fr.h, pad, pad, fr.w * SIL_S, fr.h * SIL_S);
  cg.filter = 'none';
  cg.globalCompositeOperation = 'source-in';
  cg.fillStyle = '#000';
  cg.fillRect(0, 0, c.width, c.height);
  c.pad = pad;
  silCache.set(key, c);
  return c;
}

const LYING = new Set(['knockdown', 'ko', 'getup']);

function drawShadow(g, f, camX) {
  if (f.invisible) return;
  const L = LAYOUT.shadow;
  const sx = f.rx - camX, gy = LAYOUT.groundY;
  const h = Math.max(0, f.ry);
  const fade = Math.max(0, 1 - h / L.fade);          // 離地越高越淡
  if (fade <= 0) return;
  // 1) 投射陰影：目前影格的剪影「站在地上」的姿勢，壓扁 + 斜切貼在地面
  const fi = f.frameInfo();
  const fr = f.sprite(fi);
  if (fr && L.cast > 0) {
    const sil = silhouette(f.def.id, ASSETS.chars[f.def.id].images[fr.p], fr, L.blur);
    const x = f.spriteXform(fi, fr, 0);
    const k = x.k * (0.75 + 0.25 * fade);           // 跳高時影子縮小
    const lt = (STAGES[f.battle.stage] || {}).light;
    const squash = lt ? lt[0] : L.squash, skew = lt ? lt[1] : L.skew;
    const base = x.baseY;                            // 以 y = 0（貼地）計算的錨點高度
    g.save();
    g.globalAlpha = L.cast * fade;
    // 局部座標 (u,v) = 影格像素相對錨點；高度 Y = base - v*k → 地面上的位置 x += skew*Y、y = gy - squash*Y
    g.transform(f.facing * k, 0, -skew * k, squash * k, sx + f.facing * x.dx + skew * base, gy - squash * base);
    const p = sil.pad / SIL_S;
    g.drawImage(sil, -x.ax - p, -x.ay - p, sil.width / SIL_S, sil.height / SIL_S);
    g.restore();
  }
  // 2) 接觸陰影：腳底柔和的暗區（躺地時拉長）
  if (L.contact > 0) {
    const w = (LYING.has(f.state) ? 125 : f.crouching ? 80 : 62) * L.contactW * (f.def.size || 1) * (1 - (1 - fade) * 0.5);
    const hh = 14 * (1 - (1 - fade) * 0.4);
    g.save();
    g.translate(sx, gy + 2);
    g.scale(w / hh, 1);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, hh);
    grd.addColorStop(0, `rgba(0,0,0,${L.contact * fade})`);
    grd.addColorStop(0.6, `rgba(0,0,0,${L.contact * fade * 0.55})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, hh, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
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
    // once：依存在時間只播一次（地面冰柱）；否則循環
    const fr = p.spec.once ? valid[Math.min(valid.length - 1, Math.floor(p.t / p.spec.once))] : valid[Math.floor(t / 4) % valid.length];
    const k = p.owner.k * p.scale;
    const foot = p.spec.anchor === 'foot';
    const ax = foot ? fr.fx : fr.cx, ay = foot ? fr.fy : fr.cy;
    if (p.spec.once && p.t > p.life - 8) g.globalAlpha = Math.max(0, (p.life - p.t) / 8);
    if (charPix()) {
      const P = LAYOUT.pixel.charSize, Z = CAM.z;
      const c = pixelFrame(atlas.images, fr, k * Z, P);
      g.translate(...snapW(sx, sy));
      if (p.vy) g.rotate(Math.atan2(-p.vy, Math.abs(p.vx)) * p.facing);
      g.scale((p.facing * P) / Z, P / Z);
      const ox = -Math.round(ax * c.kx) - c.pad, oy = -Math.round(ay * c.ky) - c.pad;
      g.drawImage(c, ox, oy);
      if (p.spec.super) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.drawImage(c, ox, oy); }
      g.restore();
      return;
    }
    g.translate(sx, sy);
    if (p.vy) g.rotate(Math.atan2(-p.vy, Math.abs(p.vx)) * p.facing);
    g.scale(p.facing * k, k);
    g.drawImage(atlas.images[fr.p], fr.x, fr.y, fr.w, fr.h, -ax, -ay, fr.w, fr.h);
    if (p.spec.super) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35;
      g.drawImage(atlas.images[fr.p], fr.x, fr.y, fr.w, fr.h, -ax, -ay, fr.w, fr.h);
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
    if (e.type === 'hit' || e.type === 'block') drawSpark(g, e, x, y);
    else if (e.type === 'streak') {
      // 重擊速度線：從打擊點往後拉出（跳入攻擊往後上方）
      const a = e.jump ? (e.dir > 0 ? Math.PI + 0.6 : -0.6) : (e.dir > 0 ? Math.PI : 0);
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.globalAlpha = 1 - p;
      g.fillStyle = '#fff6d8';
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * 16 * e.size;
        const len = (70 + ((i * 37) % 60)) * e.size * (0.6 + p);
        g.fillRect(30 + p * 40, off - 2, len, i === 2 ? 6 : 3);
      }
      g.restore();
    } else if (e.type === 'drop') {
      // 血沫：空中是方塊，落地變成扁平血跡，最後 40 tick 淡出
      g.globalAlpha = Math.min(1, (e.life - e.t) / 40);
      g.fillStyle = e.color;
      if (e.landed) g.fillRect(x - e.s, y - 3, e.s * 2 + 3, 3);
      else g.fillRect(x - e.s / 2, y - e.s / 2, e.s, e.s);
      g.globalAlpha = 1;
    } else if (e.type === 'bit') {
      g.globalAlpha = 1 - p;
      g.fillStyle = e.color;
      g.fillRect(x - 3, y - 3, 6, 6);
      g.globalAlpha = 1;
    } else if (e.type === 'dust') {
      g.globalAlpha = 0.45 * (1 - p);
      g.fillStyle = e.color || '#d8ccb8';
      g.beginPath(); g.arc(x, y, e.r * (0.6 + p), 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    } else if (e.type === 'ring') {
      g.globalAlpha = 1 - p;
      g.strokeStyle = e.color;
      g.lineWidth = 6;
      g.beginPath(); g.arc(x, y, (20 + p * 60) * e.size, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
  }
}

// 打擊火花（像素風）：扁平色塊的鋸齒星形，兩 tick 一格跳動；前 2 tick 白光、中段星形、尾段剩放射線
function starPath(g, n, r0, r1, rot) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r1 : r0;
    const a = rot + (i * Math.PI) / n;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
}

function drawSpark(g, e, x, y) {
  const block = e.type === 'block';
  const R = (block ? 46 : 60) * e.size;
  const t = e.t - (e.t % 2);                       // 兩 tick 一格
  const p = t / e.life;
  const outer = block ? '#5fc8ff' : e.tint || (e.heavy ? '#ff7a1a' : '#ffc62e');
  const mid = block ? '#c8f0ff' : '#fff3a0';
  const n = e.rays.length;
  const rot = e.rays[0].a;
  g.save();
  g.translate(x, y);
  if (t < 2) {
    // 第一格：白色閃光
    g.fillStyle = '#ffffff';
    starPath(g, n, R * 0.75, R * 0.3, rot);
    g.fill();
  } else if (p < 0.6) {
    const q = Math.min(1, p / 0.35);
    const r = R * (0.75 + 0.45 * q);
    g.fillStyle = outer;
    starPath(g, n, r, r * 0.42, rot);
    g.fill();
    g.fillStyle = mid;
    starPath(g, n, r * 0.62, r * 0.26, rot + Math.PI / n);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(0, 0, r * 0.2 * (1 - q * 0.5), 0, Math.PI * 2); g.fill();
    if (block) {
      // 防禦：外圈方框感的護盾線
      g.strokeStyle = '#e8fbff';
      g.lineWidth = 4;
      g.beginPath(); g.arc(0, 0, r * 1.05, 0, Math.PI * 2); g.stroke();
    }
  } else {
    // 尾段：放射線往外散
    const q = (p - 0.6) / 0.4;
    g.fillStyle = outer;
    for (const r of e.rays) {
      const l0 = R * (0.8 + q * 0.6) * r.len, w = Math.max(3, 9 * e.size * (1 - q));
      g.save();
      g.rotate(r.a);
      g.fillRect(l0, -w / 2, R * 0.5 * (1 - q) + 6, w);
      g.restore();
    }
  }
  g.restore();
}

// 彈出文字（COUNTER 等）畫在高解析層，低解析下小字會糊掉
function drawFxText(g, fx, camX) {
  const gy = LAYOUT.groundY;
  for (const e of fx.list) {
    if (e.type !== 'text') continue;
    const p = e.t / e.life;
    g.globalAlpha = Math.min(1, (1 - p) * 2);
    text(g, e.txt, e.x - camX, gy - e.y, { size: e.size, color: e.color });
    g.globalAlpha = 1;
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
// 世界（舞台、角色、特效）畫在低解析層再放大；判定框、彈出文字、HUD 畫在高解析主畫布
export function drawBattle(g0, b, t) {
  const [ox, oy] = b.fx.offset();
  const P = LAYOUT.pixel, gy = LAYOUT.groundY;
  const Z = (CAM.z = LAYOUT.camZoom || 1);
  const vw = VIEW_W / Z;                          // 畫面看得到的世界寬度
  const zp = [b.fx.zoomNow(), b.fx.zx, b.fx.zy];
  // 進入世界座標：震動 + 以地面為軸的鏡頭倍率
  const world = (g) => { g.save(); g.translate(ox, oy + gy); g.scale(Z, Z); g.translate(0, -gy); return g; };
  interp(b);
  // 1) 舞台層（3 倍像素）：背景、舞台元素、超必殺暗場、影子
  let g = world(lowLayer(g0, P.size, 'base'));
  drawStage(g, b.stage, b.rcamX, t, vw);
  if (b.stagefx) b.stagefx.drawBack(g, b.rcamX, vw);
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
  g.restore();
  presentLow(g0, ...zp, 'base');
  // 2) 角色層（2 倍像素，保留細節）：殘影、角色、飛行道具
  g = world(lowLayer(g0, P.charSize, 'char', true));
  const order = b.fighters.slice().sort((a, c) => (a.state === 'move' ? 1 : 0) - (c.state === 'move' ? 1 : 0));   // 出招中的角色畫在上層
  for (const f of order) drawTrail(g, f, b.rcamX);
  for (const f of order) drawFighter(g, f, b.rcamX, t);
  for (const p of b.projectiles) drawProjectile(g, p, b.rcamX, t);
  g.restore();
  presentLow(g0, ...zp, 'char');
  // 3) 特效層（3 倍像素）：前景物件、火花、前景天氣
  g = world(lowLayer(g0, P.size, 'fx', true));
  drawProps(g, b.stage, b.rcamX, ox, oy);
  drawEffects(g, b.fx, b.rcamX);
  if (b.stagefx) b.stagefx.drawFront(g);
  g.restore();
  presentLow(g0, ...zp, 'fx');
  // 高解析：判定框、彈出文字
  world(g0);
  if (view.showBoxes || (b.training && b.training.boxes)) drawBoxes(g0, b);
  drawFxText(g0, b.fx, b.rcamX);
  g0.restore();
  CAM.z = 1;
  if (b.superT > 0) drawCutIn(g0, b, t);
  if (b.fx.flashT > 0) { g0.fillStyle = `rgba(255,255,255,${b.fx.flashT / 8})`; g0.fillRect(0, 0, VIEW_W, VIEW_H); }
  drawHUD(g0, b, t);
}

// 前景物件：用畫面座標擺放（貼齊上緣或下緣），水平依 p 倍速捲動，從鏡頭前滑過
export function drawProps(g, stageId, camX, ox = 0, oy = 0) {
  const s = STAGES[stageId];
  if (!s || !s.fg) return;
  const Z = LAYOUT.camZoom || 1, vw = VIEW_W / Z, P = LAYOUT.pixel.size;
  g.save();
  const base = pixelOn() ? 1 / P : view.renderScale || 1;          // 回到畫面座標（低解析層或主畫布的縮放）
  g.setTransform(base, 0, 0, base, 0, 0);
  g.translate(ox, oy);
  for (const f of s.fg) {
    const img = ASSETS.props[f.id];
    if (!img) continue;
    const h = f.h, w = (img.width / img.height) * h;
    const sx = (f.x - camX - vw / 2) * f.p * Z + VIEW_W / 2 - w / 2;
    if (sx > VIEW_W || sx + w < 0) continue;
    const y = f.at === 'top' ? f.dy : VIEW_H - h + f.dy;
    if (pixelOn()) g.drawImage(pixelArt(img, w, h, P), snap(sx, P), snap(y, P), w, h);
    else g.drawImage(img, sx, y, w, h);
  }
  g.restore();
}

// 頭像（像素畫風時用像素化版本，硬邊放大）
export function drawArt(g, img, x, y, w, h, flip = false) {
  const P = LAYOUT.pixel.artSize;
  if (pixelOn() && P > 1) {
    const c = pixelArt(img, w, h, P);
    g.save();
    g.imageSmoothingEnabled = false;
    if (flip) { g.translate(snap(x + w, P), snap(y, P)); g.scale(-1, 1); g.drawImage(c, 0, 0, w, h); }
    else g.drawImage(c, snap(x, P), snap(y, P), w, h);
    g.restore();
    return;
  }
  if (flip) { g.save(); g.translate(x + w, y); g.scale(-1, 1); g.drawImage(img, 0, 0, w, h); g.restore(); }
  else g.drawImage(img, x, y, w, h);
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
    drawArt(g, img, x, bandY - 30, w, h, !left);
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
      drawArt(g, img, px + ps / 2 - iw * 0.5, H.portrait.y - ih * 0.05, iw, ih, flip);
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
