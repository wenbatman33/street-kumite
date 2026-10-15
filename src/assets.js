// 素材載入：角色 atlas、頭像、舞台背景。缺檔時回傳 null，遊戲改用程式繪製的替代圖
import { STAGES } from './config.js';

export const ASSETS = { chars: {}, portraits: {}, stages: {}, alt: {} };

function loadImage(src) {
  return new Promise((ok) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = src;
  });
}

async function loadJSON(src) {
  try {
    const r = await fetch(src, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function loadCharAtlas(id) {
  const atlas = await loadJSON(`assets/sprites/${id}/atlas.json`);
  if (!atlas) return null;
  atlas.images = await Promise.all(atlas.pages.map((p) => loadImage(`assets/sprites/${id}/${p}?v=${atlas.pages.length}`)));
  if (atlas.images.some((x) => !x)) return null;
  return atlas;
}

export async function loadAll(charIds, onProgress) {
  const jobs = [];
  let done = 0;
  const total = charIds.length * 2 + Object.keys(STAGES).length;
  const tick = () => onProgress && onProgress(++done / total);
  for (const id of charIds) {
    jobs.push(loadCharAtlas(id).then((a) => { ASSETS.chars[id] = a; tick(); }));
    jobs.push(loadImage(`assets/ui/portrait_${id}.webp`).then((im) => { ASSETS.portraits[id] = im; tick(); }));
  }
  for (const [sid, s] of Object.entries(STAGES)) {
    jobs.push(loadImage(s.img).then((im) => { ASSETS.stages[sid] = im; tick(); }));
  }
  await Promise.all(jobs);
}

// 同角色對戰時 P2 用的替代配色：只換服裝色相（膚色不動），結果快取
const ALT_RULES = {
  tora: { from: [200, 265], to: 352, sat: 1.1 },   // 藏青道服 → 深紅
  vera: { from: [95, 175], to: 275, sat: 1.0 },    // 綠色上衣 → 紫
};

const altPages = {};   // 角色 → 已算好的頁面（閒置時逐頁計算）

function altPage(id, i) {
  const atlas = ASSETS.chars[id];
  const list = altPages[id] || (altPages[id] = []);
  if (!list[i]) {
    const rule = ALT_RULES[id];
    list[i] = rule ? recolorRange(atlas.images[i], rule) : recolor(atlas.images[i], 180);
  }
  return list[i];
}

export function altAtlasImages(id) {
  if (ASSETS.alt[id]) return ASSETS.alt[id];
  const atlas = ASSETS.chars[id];
  if (!atlas) return null;
  ASSETS.alt[id] = atlas.images.map((_, i) => altPage(id, i));
  return ASSETS.alt[id];
}

// 載入後在閒置時間一頁一頁算替代配色（每頁約 70ms，分散在選單畫面中，不影響對戰）
export function precomputeAltColors(ids) {
  const jobs = [];
  for (const id of ids) {
    const atlas = ASSETS.chars[id];
    if (atlas) atlas.images.forEach((_, i) => jobs.push([id, i]));
  }
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 120));
  const next = () => {
    const j = jobs.shift();
    if (!j) return;
    altPage(j[0], j[1]);
    idle(next);
  };
  idle(next);
}

function recolorRange(im, { from, to, sat }) {
  const c = document.createElement('canvas');
  c.width = im.width;
  c.height = im.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  const [h0, h1] = from;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] < 8) continue;
    const r = a[i] / 255, gg = a[i + 1] / 255, b = a[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const dl = mx - mn;
    if (dl < 0.08) continue;                     // 灰階不動
    let h;
    if (mx === r) h = ((gg - b) / dl) % 6;
    else if (mx === gg) h = (b - r) / dl + 2;
    else h = (r - gg) / dl + 4;
    h *= 60;
    if (h < 0) h += 360;
    if (h < h0 || h > h1) continue;
    const l = (mx + mn) / 2;
    let s = dl / (1 - Math.abs(2 * l - 1));
    s = Math.min(1, s * sat);
    // HSL → RGB
    const C = (1 - Math.abs(2 * l - 1)) * s;
    const X = C * (1 - Math.abs(((to / 60) % 2) - 1));
    const m = l - C / 2;
    const k = Math.floor(to / 60) % 6;
    const [rr, g2, bb] = [[C, X, 0], [X, C, 0], [0, C, X], [0, X, C], [X, 0, C], [C, 0, X]][k];
    a[i] = (rr + m) * 255;
    a[i + 1] = (g2 + m) * 255;
    a[i + 2] = (bb + m) * 255;
  }
  g.putImageData(d, 0, 0);
  return c;
}

function recolor(im, hue) {
  const c = document.createElement('canvas');
  c.width = im.width;
  c.height = im.height;
  const g = c.getContext('2d');
  if ('filter' in g) {
    g.filter = `hue-rotate(${hue}deg) saturate(1.15)`;
    g.drawImage(im, 0, 0);
    g.filter = 'none';
    // 有些瀏覽器有 filter 屬性但不生效 → 抽樣檢查，失敗就退回逐像素
    if (filterWorked(g, im)) return c;
    g.clearRect(0, 0, c.width, c.height);
  }
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  const rad = (hue * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  // 色相旋轉矩陣（同 CSS hue-rotate）
  const m = [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.140, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
  ];
  for (let i = 0; i < a.length; i += 4) {
    if (!a[i + 3]) continue;
    const r = a[i], gg = a[i + 1], b = a[i + 2];
    a[i] = m[0] * r + m[1] * gg + m[2] * b;
    a[i + 1] = m[3] * r + m[4] * gg + m[5] * b;
    a[i + 2] = m[6] * r + m[7] * gg + m[8] * b;
  }
  g.putImageData(d, 0, 0);
  return c;
}

function filterWorked(g, im) {
  try {
    const t = document.createElement('canvas');
    t.width = t.height = 8;
    const tg = t.getContext('2d');
    tg.filter = 'hue-rotate(90deg)';
    tg.fillStyle = '#ff0000';
    tg.fillRect(0, 0, 8, 8);
    const p = tg.getImageData(4, 4, 1, 1).data;
    return !(p[0] > 240 && p[1] < 10 && p[2] < 10);
  } catch {
    return false;
  }
}
