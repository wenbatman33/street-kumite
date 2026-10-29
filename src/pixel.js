// 像素畫風：中位切割減色、低解析畫布、像素化圖片／角色影格快取
// 畫面先畫在 1/size 的低解析畫布（3 倍 = 427×240，接近 90 年代街機的原生解析度），再用最近鄰硬邊放大
import { VIEW_W, VIEW_H, LAYOUT } from './config.js';

const PX = () => LAYOUT.pixel;
export const pixelOn = () => PX().size > 1;

// ---------- 減色 ----------
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const key15 = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
const ch = (k, c) => (k >> (10 - c * 5)) & 31;
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

// 中位切割：統計 15-bit 色彩直方圖，反覆把「範圍 × 數量」最大的盒子沿最長的色彩軸對半切
export function medianCut(datas, n) {
  const hist = new Uint32Array(32768);
  for (const d of datas) for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128) hist[key15(d[i], d[i + 1], d[i + 2])]++;
  const keys = [];
  for (let k = 0; k < 32768; k++) if (hist[k]) keys.push(k);
  if (!keys.length) return [[0, 0, 0]];
  const box = (ks) => {
    const lo = [31, 31, 31], hi = [0, 0, 0];
    let cnt = 0;
    for (const k of ks) {
      cnt += hist[k];
      for (let c = 0; c < 3; c++) { const v = ch(k, c); if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    }
    // 綠色對人眼最敏感，範圍加權
    const r = [(hi[0] - lo[0]) * 1.0, (hi[1] - lo[1]) * 1.2, (hi[2] - lo[2]) * 0.8];
    const axis = r[1] >= r[0] && r[1] >= r[2] ? 1 : r[0] >= r[2] ? 0 : 2;
    return { ks, cnt, axis, range: r[axis] };
  };
  const boxes = [box(keys)];
  while (boxes.length < n) {
    let bi = -1, best = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.ks.length < 2 || !b.range) continue;
      const s = b.range * Math.sqrt(b.cnt);
      if (s > best) { best = s; bi = i; }
    }
    if (bi < 0) break;
    const b = boxes[bi];
    b.ks.sort((x, y) => ch(x, b.axis) - ch(y, b.axis));
    let acc = 0, cut = 1;
    for (let i = 0; i < b.ks.length; i++) {
      acc += hist[b.ks[i]];
      if (acc >= b.cnt / 2) { cut = Math.max(1, Math.min(b.ks.length - 1, i + 1)); break; }
    }
    boxes.splice(bi, 1, box(b.ks.slice(0, cut)), box(b.ks.slice(cut)));
  }
  const pal = boxes.map((b) => {
    let r = 0, g = 0, bl = 0;
    for (const k of b.ks) { const w = hist[k]; r += (ch(k, 0) * 8 + 4) * w; g += (ch(k, 1) * 8 + 4) * w; bl += (ch(k, 2) * 8 + 4) * w; }
    return [Math.round(r / b.cnt), Math.round(g / b.cnt), Math.round(bl / b.cnt)];
  });
  pal.lut = new Int16Array(32768).fill(-1);   // 15-bit 色 → 調色盤索引（用到才算）
  return pal;
}

function nearest(pal, r, g, b) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const p = pal[i];
    const dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
    const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// 彩度／對比微調（AI 圖普遍偏灰、泛光，減色前先拉一點）
export function adjust(d, sat = 1, contrast = 1) {
  if (sat === 1 && contrast === 1) return;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const l = r * 0.299 + g * 0.587 + b * 0.114;
    r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    d[i] = clamp8((r - 128) * contrast + 128);
    d[i + 1] = clamp8((g - 128) * contrast + 128);
    d[i + 2] = clamp8((b - 128) * contrast + 128);
  }
}

// 銳化（減色前做，縮小後的臉部、衣紋細節才不會糊成一片）；只看不透明的鄰居，避免邊緣出現光暈
function sharpen(im, amt) {
  if (!amt) return;
  const { width: w, height: h, data: d } = im;
  const src = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] < 128) continue;
      for (let c = 0; c < 3; c++) {
        let sum = 0, n = 0;
        for (const o of [i - 4, i + 4, i - w * 4, i + w * 4]) if (src[o + 3] >= 128) { sum += src[o + c]; n++; }
        if (n) d[i + c] = clamp8(src[i + c] + amt * (src[i + c] - sum / n));
      }
    }
  }
}

// 換成調色盤顏色（就地修改）；alphaCut > 0 時透明度二值化（硬邊）
export function remap(img, pal, { dither = 0, alphaCut = 0 } = {}) {
  const d = img.data, w = img.width;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (alphaCut) {
      if (d[i + 3] < alphaCut) { d[i + 3] = 0; continue; }
      d[i + 3] = 255;
    } else if (!d[i + 3]) continue;
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (dither) {
      const t = (BAYER4[(((p / w) | 0) & 3) * 4 + ((p % w) & 3)] - 7.5) * dither;
      r = clamp8(r + t); g = clamp8(g + t); b = clamp8(b + t);
    }
    const k = key15(r, g, b);
    let c = pal.lut[k];
    if (c < 0) { c = nearest(pal, (ch(k, 0) << 3) + 4, (ch(k, 1) << 3) + 4, (ch(k, 2) << 3) + 4); pal.lut[k] = c; }
    const q = pal[c];
    d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2];
  }
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// 縮小 + 調色 + 減色；colors：色數或現成調色盤
export function pixelize(src, sx, sy, sw, sh, w, h, colors, { alphaCut = 0, pad = 0, sharp = 0 } = {}) {
  const c = makeCanvas(w + pad * 2, h + pad * 2);
  const cg = c.getContext('2d', { willReadFrequently: true });
  cg.imageSmoothingEnabled = true;
  cg.imageSmoothingQuality = 'high';
  cg.drawImage(src, sx, sy, sw, sh, pad, pad, w, h);
  const im = cg.getImageData(0, 0, c.width, c.height);
  const P = PX();
  adjust(im.data, P.sat, P.contrast);
  sharpen(im, sharp);
  const pal = Array.isArray(colors) ? colors : medianCut([im.data], colors);
  remap(im, pal, { dither: P.dither, alphaCut });
  cg.putImageData(im, 0, 0);
  return c;
}

// ---------- 低解析畫布 ----------
// 可同時有多層（key）：舞台層 3 倍像素、角色層 2 倍像素（透明底）、特效層 3 倍像素，依序畫完一層就貼回主畫布
const layers = {};

// 取得低解析畫布的 context（座標仍是 1280×720 的邏輯座標）；size ≤ 1 時直接回傳主畫布
export function lowLayer(g, size = PX().size, key = 'base', transparent = false) {
  if (size <= 1 || !pixelOn()) { layers[key] = { direct: true }; return g; }
  const w = Math.ceil(VIEW_W / size), h = Math.ceil(VIEW_H / size);
  let L = layers[key];
  if (!L || !L.canvas || L.canvas.width !== w || L.canvas.height !== h) {
    const c = makeCanvas(w, h);
    L = layers[key] = { canvas: c, g: c.getContext('2d', { alpha: transparent }) };
  }
  L.direct = false;
  L.size = size;
  const lg = L.g;
  lg.setTransform(1, 0, 0, 1, 0, 0);
  if (transparent) lg.clearRect(0, 0, w, h);
  else { lg.fillStyle = '#000'; lg.fillRect(0, 0, w, h); }
  lg.setTransform(1 / size, 0, 0, 1 / size, 0, 0);
  lg.imageSmoothingEnabled = false;
  return lg;
}

// 把低解析畫布硬邊放大貼回主畫布；zoom > 0 時以 (cx, cy) 為中心放大（重擊鏡頭衝擊）
export function presentLow(g, zoom = 0, cx = VIEW_W / 2, cy = VIEW_H / 2, key = 'base') {
  const L = layers[key];
  if (!L || L.direct || !L.canvas) return;
  const low = L.canvas, P = L.size;
  g.save();
  g.imageSmoothingEnabled = false;
  if (zoom > 0) {
    const z = 1 + zoom;
    g.translate(cx, cy);
    g.scale(z, z);
    g.translate(-cx, -cy);
  }
  g.drawImage(low, 0, 0, low.width * P, low.height * P);
  g.restore();
}

// 單色剪影版本（殘影用），快取在影格畫布上
export function tinted(c, color) {
  const m = c.tints || (c.tints = {});
  if (m[color]) return m[color];
  const t = makeCanvas(c.width, c.height);
  const tg = t.getContext('2d');
  tg.drawImage(c, 0, 0);
  tg.globalCompositeOperation = 'source-atop';
  tg.fillStyle = color;
  tg.fillRect(0, 0, t.width, t.height);
  m[color] = t;
  return t;
}

// 對齊低解析像素格（畫面座標）
export const snap = (v, P = PX().size) => (P > 1 ? Math.round(v / P) * P : v);

// ---------- 快取 ----------
// 設定改變（DEV 調色數、像素倍率）時清除
let gen = 0;
export function clearPixelCaches() { gen++; }
export const pixelGen = () => gen;

// 任意圖片（頭像等）→ 畫面上 w×h 大小的像素化版本（低解析像素 1:1）
const artCache = new WeakMap();
export function pixelArt(img, w, h, P = PX().artSize) {
  const lw = Math.max(1, Math.round(w / P)), lh = Math.max(1, Math.round(h / P));
  let m = artCache.get(img);
  if (!m || m.gen !== gen) { m = new Map(); m.gen = gen; artCache.set(img, m); }
  const key = `${lw}x${lh}`;
  let c = m.get(key);
  if (!c) {
    c = pixelize(img, 0, 0, img.width, img.height, lw, lh, PX().artColors, { alphaCut: 96, sharp: PX().sharpen });
    m.set(key, c);
  }
  return c;
}

// 角色影格：同一套 atlas 頁面共用一組調色盤，每個影格縮到「1 atlas 像素 = p 個低解析像素」再減色
const palCache = new WeakMap();
const frameCache = new WeakMap();
function charPalette(imgs, p) {
  let pal = palCache.get(imgs[0]);
  if (pal && pal.gen === gen) return pal;
  // 用第一頁（站姿、走路等最常見的影格）縮小後統計
  const src = imgs[0];
  const c = makeCanvas(src.width * p, src.height * p);
  const cg = c.getContext('2d', { willReadFrequently: true });
  cg.imageSmoothingQuality = 'high';
  cg.drawImage(src, 0, 0, c.width, c.height);
  const im = cg.getImageData(0, 0, c.width, c.height);
  adjust(im.data, PX().sat, PX().contrast);
  sharpen(im, PX().sharpen);
  pal = medianCut([im.data], PX().charColors);
  pal.gen = gen;
  palCache.set(imgs[0], pal);
  return pal;
}

// fr：atlas 影格；k：畫面單位 / atlas 像素；P：像素倍率。回傳畫布，kx/ky = 實際縮放、pad = 外圈留白
export function pixelFrame(imgs, fr, k, P = PX().charSize) {
  const p = k / P;
  const page = imgs[fr.p];
  let m = frameCache.get(page);
  if (!m || m.gen !== gen) { m = new Map(); m.gen = gen; frameCache.set(page, m); }
  const key = `${fr.x},${fr.y},${Math.round(p * 2000)}`;
  let c = m.get(key);
  if (!c) {
    const w = Math.max(1, Math.round(fr.w * p)), h = Math.max(1, Math.round(fr.h * p));
    c = pixelize(page, fr.x, fr.y, fr.w, fr.h, w, h, charPalette(imgs, p), { alphaCut: 110, pad: 1, sharp: PX().sharpen });
    c.kx = w / fr.w;
    c.ky = h / fr.h;
    c.pad = 1;
    m.set(key, c);
  }
  return c;
}
