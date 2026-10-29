// 世界地圖：選角畫面背景、街機模式每戰之間的移動路線；國旗用程式繪製（像素風）
import { VIEW_W, LAYOUT } from './config.js';
import { ASSETS } from './assets.js';
import { drawArt, text } from './render.js';

// 各舞台所在地：經緯度 → 等距圓柱投影；flag = 國旗代碼；off = 國旗相對地點的位移（擠在一起的國家錯開，畫引線）
export const LOCS = {
  market:  { lat: 25.0, lon: 121.5, flag: 'tw', en: 'TAIWAN', off: [44, 30] },
  beach:   { lat: -22.9, lon: -43.2, flag: 'br', en: 'BRAZIL' },
  steppe:  { lat: 47.9, lon: 106.9, flag: 'mn', en: 'MONGOLIA' },
  harbor:  { lat: 69.6, lon: 18.9, flag: 'no', en: 'NORWAY', off: [46, 16] },
  rooftop: { lat: 34.8, lon: 134.7, flag: 'jp', en: 'JAPAN', off: [50, -18] },
  temple:  { lat: 30.1, lon: 118.2, flag: 'cn', en: 'CHINA', off: [-52, -14] },
  gym:     { lat: 51.5, lon: -0.1, flag: 'gb', en: 'U.K.', off: [-48, -6] },
  stadium: { lat: 13.7, lon: 100.5, flag: 'th', en: 'THAILAND', off: [-46, 26] },
  ruins:   { lat: 37.9, lon: 23.7, flag: 'gr', en: 'GREECE', off: [-34, -30] },
  pyramid: { lat: 29.9, lon: 31.1, flag: 'eg', en: 'EGYPT', off: [38, 26] },
  volcano: { lat: 64.1, lon: -16, flag: 'is', en: 'ICELAND' },
  summit:  { lat: 5, lon: 165, flag: null, en: '???' },
};

// 地圖在畫面上的位置（DEV 可調）：x/y/w = 地圖圖片左上角與寬度
export const MAP = LAYOUT.map || (LAYOUT.map = { x: -5, y: -90, w: 1100 });

// 經緯度 → 地圖圖片上的比例位置（依倫敦、日本、開普敦、合恩角對照生成的地圖擬合，不是標準投影）
const PROJ = { ax: 4.49 / 1536, bx: 695 / 1536, ay: -5.064 / 1024, by: 561 / 1024 };
export function pinPos(id) {
  const L = LOCS[id];
  if (!L) return [VIEW_W / 2, 200];
  const h = MAP.w / 1.5;
  return [MAP.x + (PROJ.ax * L.lon + PROJ.bx) * MAP.w, MAP.y + (PROJ.ay * L.lat + PROJ.by) * h];
}

// ---------- 國旗（w×h，左上角 x,y）----------
function rect(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function star(g, cx, cy, r, c) {
  g.fillStyle = c;
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.fill();
}
function nordic(g, x, y, w, h, bg, edge, cross) {
  rect(g, bg, x, y, w, h);
  const cx = x + w * 0.36, t = h * 0.28, t2 = h * 0.14;
  rect(g, edge, cx - t / 2, y, t, h); rect(g, edge, x, y + h / 2 - t / 2, w, t);
  rect(g, cross, cx - t2 / 2, y, t2, h); rect(g, cross, x, y + h / 2 - t2 / 2, w, t2);
}
export function drawFlag(g, code, x, y, w = 36, h = 24) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  switch (code) {
    case 'jp': rect(g, '#fff', x, y, w, h); g.fillStyle = '#d4002a'; g.beginPath(); g.arc(x + w / 2, y + h / 2, h * 0.3, 0, Math.PI * 2); g.fill(); break;
    case 'tw':
      rect(g, '#d4002a', x, y, w, h); rect(g, '#1a2f8f', x, y, w / 2, h / 2);
      star(g, x + w / 4, y + h / 4, h * 0.17, '#fff'); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + w / 4, y + h / 4, h * 0.08, 0, Math.PI * 2); g.fill();
      break;
    case 'br':
      rect(g, '#1e9b3a', x, y, w, h);
      g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(x + w / 2, y + 2); g.lineTo(x + w - 3, y + h / 2); g.lineTo(x + w / 2, y + h - 2); g.lineTo(x + 3, y + h / 2); g.fill();
      g.fillStyle = '#1a2f8f'; g.beginPath(); g.arc(x + w / 2, y + h / 2, h * 0.23, 0, Math.PI * 2); g.fill();
      break;
    case 'mn': rect(g, '#c4272f', x, y, w, h); rect(g, '#015197', x + w / 3, y, w / 3, h); rect(g, '#f9cf02', x + w / 6 - 2, y + h * 0.2, 4, h * 0.6); break;
    case 'no': nordic(g, x, y, w, h, '#ba0c2f', '#fff', '#00205b'); break;
    case 'is': nordic(g, x, y, w, h, '#02529c', '#fff', '#dc1e35'); break;
    case 'cn': rect(g, '#de2910', x, y, w, h); star(g, x + w * 0.2, y + h * 0.3, h * 0.2, '#ffde00'); for (const [a, b] of [[0.38, 0.12], [0.45, 0.25], [0.45, 0.42], [0.38, 0.55]]) star(g, x + w * a, y + h * b, h * 0.07, '#ffde00'); break;
    case 'gb': {
      rect(g, '#012169', x, y, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = h * 0.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + h); g.moveTo(x + w, y); g.lineTo(x, y + h); g.stroke();
      g.strokeStyle = '#c8102e'; g.lineWidth = h * 0.08; g.stroke();
      rect(g, '#fff', x + w / 2 - h * 0.17, y, h * 0.34, h); rect(g, '#fff', x, y + h / 2 - h * 0.17, w, h * 0.34);
      rect(g, '#c8102e', x + w / 2 - h * 0.1, y, h * 0.2, h); rect(g, '#c8102e', x, y + h / 2 - h * 0.1, w, h * 0.2);
      break;
    }
    case 'th': rect(g, '#a51931', x, y, w, h); rect(g, '#f4f5f8', x, y + h / 6, w, h * 2 / 3); rect(g, '#2d2a4a', x, y + h / 3, w, h / 3); break;
    case 'gr': for (let i = 0; i < 9; i++) rect(g, i % 2 ? '#fff' : '#0d5eaf', x, y + (i * h) / 9, w, h / 9 + 0.5); rect(g, '#0d5eaf', x, y, w * 0.38, h * 5 / 9); rect(g, '#fff', x + w * 0.15, y, w * 0.08, h * 5 / 9); rect(g, '#fff', x, y + h * 2 / 9, w * 0.38, h / 9); break;
    case 'eg': rect(g, '#ce1126', x, y, w, h / 3); rect(g, '#fff', x, y + h / 3, w, h / 3); rect(g, '#000', x, y + (2 * h) / 3, w, h / 3); rect(g, '#c09300', x + w / 2 - 3, y + h / 2 - 3, 6, 6); break;
    default: rect(g, '#222', x, y, w, h); text(g, '?', x + w / 2, y + h / 2 + 1, { size: h * 0.8, color: '#ff5a3c', outline: null, shadow: false });
  }
  g.restore();
  g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
}

// ---------- 地圖 ----------
const OCEAN = '#022174';   // 地圖圖片的海洋色（圖片外的區域也填這個色）
// 背景地圖（沒有圖片時畫成純海洋色）
export function drawMap(g) {
  g.fillStyle = OCEAN;
  g.fillRect(0, 0, VIEW_W, 720);
  const img = ASSETS.worldmap;
  if (!img) return;
  // 地圖左右相連（東西經 180 度接起來），畫面兩側不留空
  const h = MAP.w * (img.height / img.width);
  for (const dx of [-MAP.w, 0, MAP.w]) if (MAP.x + dx < VIEW_W && MAP.x + dx + MAP.w > 0) drawArt(g, img, MAP.x + dx, MAP.y, MAP.w, h);
}

// 地點標記：flag 旗子 + 國名；hl = 高亮顏色（選中的角色家鄉）
export function drawPin(g, id, t, hl = null, label = true) {
  const L = LOCS[id];
  if (!L) return;
  const [x, y] = pinPos(id);
  const pulse = hl ? 1 + Math.sin(t * 0.2) * 0.25 : 1;
  g.fillStyle = hl || '#fff';
  g.fillRect(Math.round(x) - 4 * pulse, Math.round(y) - 4 * pulse, 8 * pulse, 8 * pulse);
  if (hl) { g.strokeStyle = hl; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 12 + (t % 30) * 0.6, 0, Math.PI * 2); g.globalAlpha = 1 - (t % 30) / 30; g.stroke(); g.globalAlpha = 1; }
  if (!label) return;
  const fw = hl ? 44 : 34, fh = hl ? 30 : 22;
  const [ox, oy] = L.off || [0, -(fh / 2 + 12)];
  const fx = x + ox, fy = y + oy;                       // 國旗中心
  if (L.off) { g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(fx, fy); g.stroke(); }
  drawFlag(g, L.flag, fx - fw / 2, fy - fh / 2, fw, fh);
  text(g, L.en, fx, fy + fh / 2 + 10, { size: hl ? 18 : 13, color: hl || '#ffe9a8', lw: 4 });
}

// 兩地之間的路線（p = 0～1 畫到多遠），弧線往上拱
export function drawRoute(g, from, to, p, t) {
  const [x0, y0] = pinPos(from), [x1, y1] = pinPos(to);
  const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - Math.abs(x1 - x0) * 0.25 - 30;
  const pt = (u) => [(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * y1];
  g.fillStyle = '#ff3b2f';
  const n = 40;
  for (let i = 0; i <= n * p; i++) {
    if ((i + Math.floor(t / 4)) % 3 === 0) continue;       // 虛線往前流動
    const [x, y] = pt(i / n);
    g.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
  }
  const [hx, hy] = pt(Math.min(1, p));
  g.fillStyle = '#ffd84a';
  g.fillRect(Math.round(hx) - 6, Math.round(hy) - 6, 12, 12);
}
