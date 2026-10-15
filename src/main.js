// 進入點：畫布縮放、固定 60Hz 邏輯迴圈、場景切換、DEV 工具
import { VIEW_W, VIEW_H, TICK, GAME } from './config.js';
import { loadAll, precomputeAltColors } from './assets.js';
import { CHAR_IDS } from './chars/index.js';
import { TitleScene, menuEvents } from './scenes.js';
import { takeKeyPresses } from './input.js';
import { DevTools, applyOverrides } from './devtools.js';
import { audio } from './audio.js';
import { bindGame, text, view } from './render.js';
import { TouchLayer } from './touch.js';

// 設定存檔（要在 resize 之前讀，畫質設定會影響畫布解析度）
const SETTINGS_KEY = 'streetkumite-settings';
try { Object.assign(GAME, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* 無痕模式 */ }

const canvas = document.getElementById('game');
const g = canvas.getContext('2d', { alpha: false });
let scale = 1, cssScale = 1;

// 畫布實際像素寬度上限：全螢幕 Retina 不限制會到 3840 寬，每幀繪製超過 16ms 造成掉幀
const QUALITY_MAX_W = { low: 1280, normal: 1920, high: 2560 };

function resize() {
  const dpr = window.devicePixelRatio || 1;
  cssScale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = `${Math.floor(VIEW_W * cssScale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * cssScale)}px`;
  const maxW = QUALITY_MAX_W[GAME.quality] || QUALITY_MAX_W.normal;
  scale = Math.min(cssScale * dpr, maxW / VIEW_W);
  canvas.width = Math.round(VIEW_W * scale);
  canvas.height = Math.round(VIEW_H * scale);
  view.renderScale = scale;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'medium';
}
window.addEventListener('resize', resize);
resize();
bindGame(GAME);
applyOverrides();

const app = {
  scene: null,
  battle: null,
  training: null,
  dev: null,
  go(s) { this.scene = s; if (!s.battle) this.battle = null; },
  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(GAME)); } catch { /* 無痕模式 */ } },
  resize,
};
window.app = app;   // 方便除錯
// 除錯用：同步推進 n 個 tick 並重畫（背景分頁 rAF 被節流時測試用）
app.advance = (n = 60) => {
  for (let i = 0; i < n; i++) { const codes = takeKeyPresses(); app.scene.update(menuEvents(codes), codes); }
  g.setTransform(scale, 0, 0, scale, 0, 0);
  app.scene.draw(g, frame += n);
};
app.dev = new DevTools(app);

// 第一次互動時啟用音訊（瀏覽器自動播放限制；行動版要 touchend 才算使用者操作）
const unlock = () => audio.unlock();
window.addEventListener('keydown', unlock);
window.addEventListener('pointerdown', unlock);
window.addEventListener('touchend', unlock);

// 滑鼠：DEV 拖曳優先，否則交給場景
const toLogical = (e) => {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * VIEW_W, ((e.clientY - r.top) / r.height) * VIEW_H];
};
// tap = 觸控點擊：場景有 tap() 就用（觸控專用的點選行為），否則跟滑鼠一樣呼叫 click()
function screenDown(e, tap) {
  const [x, y] = toLogical(e);
  if (app.dev.pointerDown(x, y)) return true;
  const s = app.scene;
  if (s && tap && s.tap) s.tap(x, y);
  else if (s && s.click) s.click(x, y);
  return false;
}
canvas.addEventListener('pointerdown', (e) => {
  if (screenDown(e, e.pointerType === 'touch')) canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => { const [x, y] = toLogical(e); app.dev.pointerMove(x, y); });
canvas.addEventListener('pointerup', () => app.dev.pointerUp());

// 觸控虛擬按鍵層（只在觸控裝置顯示）；沒按到按鍵的點擊轉給畫面
app.touch = new TouchLayer(app, {
  down: (e) => screenDown(e, true),
  move: (e) => { const [x, y] = toLogical(e); app.dev.pointerMove(x, y); },
  up: () => app.dev.pointerUp(),
});

// ---------- 載入 ----------
let progress = 0;
let loaded = false;
loadAll(CHAR_IDS, (p) => { progress = p; }).then(() => {
  loaded = true;
  app.go(new TitleScene(app));
  // 閒置時預先算好同角色對戰的替代配色，避免開打第一幀卡住
  precomputeAltColors(CHAR_IDS);
});

// ---------- 主迴圈 ----------
// 固定 60Hz 邏輯。螢幕刷新抖動時把幀間隔吸附到 1/60、1/120 秒，避免某幀跑 0 tick、下一幀跑 2 tick 的頓挫；
// 高刷新率螢幕（>75Hz）在兩個 tick 之間做位置插值，畫面才會滑順
let last = performance.now();
let acc = 0;
let frame = 0;
let avgDt = TICK;
let lastW = 0, lastH = 0;
function loop(now) {
  // 視窗大小改變但沒觸發 resize 事件（iframe、模擬器）時也要更新
  if (window.innerWidth !== lastW || window.innerHeight !== lastH) { lastW = window.innerWidth; lastH = window.innerHeight; resize(); }
  let dt = now - last;
  last = now;
  if (dt > 100) dt = TICK;                       // 切分頁回來，不要快轉
  avgDt += (dt - avgDt) * 0.05;
  if (Math.abs(dt - TICK) < 1.6) dt = TICK;
  else if (Math.abs(dt - TICK / 2) < 0.9) dt = TICK / 2;
  acc += dt;
  if (acc > TICK * 4) acc = TICK;
  while (acc >= TICK - 0.01) {
    acc -= TICK;
    frame++;
    if (loaded && app.scene) {
      const codes = takeKeyPresses();
      app.scene.update(menuEvents(codes), codes);
    }
  }
  if (acc < 0) acc = 0;
  view.alpha = avgDt < 13 ? Math.min(1, acc / TICK) : 1;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  if (!loaded) {
    g.fillStyle = '#0a0410';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    text(g, 'LOADING', VIEW_W / 2, VIEW_H / 2 - 20, { size: 40, color: '#ffd84a' });
    g.fillStyle = '#331a40';
    g.fillRect(VIEW_W / 2 - 200, VIEW_H / 2 + 30, 400, 10);
    g.fillStyle = '#ff8a1e';
    g.fillRect(VIEW_W / 2 - 200, VIEW_H / 2 + 30, 400 * progress, 10);
  } else if (app.scene) {
    app.dev.applyPreview();
    app.scene.draw(g, frame);
  }
  app.touch.frame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
