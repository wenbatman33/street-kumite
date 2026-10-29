// 場景：標題（閒置輪播序章與 Demo）→ 模式選單 → 選角 → 序章 → VS → 對戰 → 結算 → CONTINUE → 結局 → 製作名單
// 另有格鬥家檔案、暫停、操作說明、設定
import { VIEW_W, VIEW_H, GAME, KEYMAPS, STAGES, LAYOUT } from './config.js';
import { CHARS, PLAYABLE_IDS, BOSS_IDS } from './chars/index.js';
import { ASSETS, altAtlasImages } from './assets.js';
import { MenuInput, readPad, readTouch, touchState } from './input.js';
import { Battle } from './battle.js';
import { HumanController, AIController, DummyController, NullController, dirToRaw, easyMap } from './controllers.js';
import { drawBattle, drawStage, drawArt, text, view } from './render.js';
import { lowLayer, presentLow } from './pixel.js';
import { audio } from './audio.js';
import { STORY, BOSS_STORY, PROLOGUE, STAGE_INFO, CREDITS, winQuote } from './story.js';
import { backdropFX } from './stagefx.js';
import { drawMap, drawPin, drawRoute, LOCS } from './worldmap.js';

const FONT_TC = '"Noto Sans TC", "PingFang TC", sans-serif';
const STAGE_IDS = Object.keys(STAGES);
const SC = () => LAYOUT.screens;

// ---------- 選單輸入 ----------
const KEYS = {
  any: { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], ok: ['Enter', 'Space', 'KeyU', 'KeyJ', 'KeyT', 'KeyG', 'NumpadEnter'], back: ['Escape', 'Backspace', 'KeyI', 'KeyY'] },
  p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], ok: ['KeyT', 'KeyG', 'Space', 'KeyU', 'KeyJ'], back: ['KeyY', 'KeyH', 'Escape'] },
  p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], ok: ['KeyI', 'KeyK', 'Enter', 'Numpad4', 'Numpad1', 'NumpadEnter'], back: ['KeyO', 'KeyL', 'Numpad5', 'Backspace'] },
};
const padMenus = [new MenuInput(), new MenuInput()];
const touchMenu = new MenuInput();   // 觸控：搖桿上下左右選、LP/LK 確定、MP/MK 返回

export function menuEvents(codes) {
  const mk = (map) => {
    const ev = { up: false, down: false, left: false, right: false, ok: false, back: false };
    for (const c of codes) for (const k in map) if (map[k].includes(c)) ev[k] = true;
    return ev;
  };
  const out = { any: mk(KEYS.any), p1: mk(KEYS.p1), p2: mk(KEYS.p2) };
  for (let i = 0; i < 2; i++) {
    const raw = readPad(i);
    if (!raw) continue;
    const pe = padMenus[i].update(raw);
    for (const k of ['up', 'down', 'left', 'right', 'ok', 'back']) {
      if (pe[k]) { out.any[k] = true; out[i === 0 ? 'p1' : 'p2'][k] = true; }
    }
  }
  const tr = readTouch();
  if (tr) {
    const te = touchMenu.update(tr);
    for (const k of ['up', 'down', 'left', 'right', 'ok', 'back']) if (te[k]) { out.any[k] = true; out.p1[k] = true; }
  }
  return out;
}

// 觸控點選：點到第 i 列（列中心 y0 + i * gap、半寬 hw）就回傳 i
function rowAt(x, y, cx, y0, gap, n, hw = 260) {
  if (Math.abs(x - cx) > hw) return -1;
  const i = Math.round((y - y0) / gap);
  return i >= 0 && i < n && Math.abs(y - (y0 + i * gap)) < Math.min(26, gap / 2) ? i : -1;
}

// ---------- 通關紀錄 ----------
const CLEAR_KEY = 'streetkumite-cleared';
function cleared() { try { return new Set(JSON.parse(localStorage.getItem(CLEAR_KEY) || '[]')); } catch { return new Set(); } }
function markCleared(id) { const s = cleared(); s.add(id); try { localStorage.setItem(CLEAR_KEY, JSON.stringify([...s])); } catch { /* 無痕模式 */ } }

// ---------- 共用繪製 ----------
// cam：舞台鏡頭位置（省略時緩慢左右搖）
function backdrop(g, t, stage = 'market', dim = 0.62, cam = null) {
  const lg = lowLayer(g);   // 舞台畫在低解析層（像素畫風）
  const id = ASSETS.stages[stage] ? stage : readyStages()[0] || stage;
  const cx = cam ?? 300 + Math.sin(t * 0.003) * 200;
  drawStage(lg, id, cx, t);
  const fx = backdropFX(id);   // 舞台動態元素
  fx.advanceTo(t, cx);
  fx.drawBack(lg, cx);
  fx.drawFront(lg);
  presentLow(g);
  g.fillStyle = `rgba(8,4,16,${dim})`;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
}

function logo(g, x, y, s = 1) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.font = '92px "Bungee", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  for (const [line, yy] of [['STREET', -58], ['KUMITE', 40]]) {
    g.strokeStyle = '#000';
    g.lineWidth = 22;
    g.strokeText(line, 0, yy);
    g.strokeStyle = '#7a1206';
    g.lineWidth = 12;
    g.strokeText(line, 0, yy);
    const grd = g.createLinearGradient(0, yy - 45, 0, yy + 45);
    grd.addColorStop(0, '#fff7c2');
    grd.addColorStop(0.45, '#ffb21e');
    grd.addColorStop(0.55, '#ff6a00');
    grd.addColorStop(1, '#c41a00');
    g.fillStyle = grd;
    g.fillText(line, 0, yy);
  }
  text(g, '街 頭 拳 鬥', 0, 112, { size: 30, color: '#fff', font: FONT_TC, lw: 6 });
  g.restore();
}

// hurt：落敗版頭像（鼻青臉腫）
function portrait(g, id, x, y, h, flip = false, alpha = 1, hurt = false) {
  const img = (hurt && ASSETS.hurt[id]) || ASSETS.portraits[id];
  if (!img) {
    g.fillStyle = CHARS[id].color;
    g.globalAlpha = alpha * 0.6;
    g.fillRect(x - h * 0.4, y, h * 0.8, h);
    g.globalAlpha = 1;
    text(g, CHARS[id].name, x, y + h / 2, { size: 40 });
    return;
  }
  const w = (img.width / img.height) * h;
  g.save();
  g.globalAlpha = alpha;
  drawArt(g, img, x - w / 2, y, w, h, flip);
  g.restore();
}

// 街機風對話框：半透明黑底 + 金色雙框
function panel(g, x, y, w, h, color = '#ffd84a', alpha = 0.78) {
  g.fillStyle = `rgba(6,3,14,${alpha})`;
  g.fillRect(x, y, w, h);
  g.strokeStyle = '#000';
  g.lineWidth = 6;
  g.strokeRect(x, y, w, h);
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.strokeRect(x + 4, y + 4, w - 8, h - 8);
}

// 中文自動換行（依實際字寬）
function wrap(g, str, maxW, size) {
  g.font = `${size}px ${FONT_TC}`;
  const out = [];
  let line = '';
  for (const ch of str) {
    if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ''; }
    line += ch;
  }
  if (line) out.push(line);
  return out;
}

// 打字機效果：把多行文字依「已顯示字數」截斷
const TYPE_SPEED = 1.1;   // 每 tick 幾個字
function typed(lines, n) {
  const out = [];
  for (const l of lines) {
    if (n <= 0) break;
    out.push(l.slice(0, Math.max(0, Math.floor(n))));
    n -= l.length;
  }
  return out;
}
const charCount = (lines) => lines.reduce((s, l) => s + l.length, 0);

function menuList(g, items, sel, x, y, gap = 58, t = 0) {
  items.forEach((it, i) => {
    const on = i === sel;
    const label = typeof it === 'string' ? it : it.label;
    if (on) {
      g.fillStyle = 'rgba(255,140,30,0.25)';
      g.fillRect(x - 260, y + i * gap - 24, 520, 48);
      g.fillStyle = '#ff8a1e';
      g.fillRect(x - 260, y + i * gap - 24, 6, 48);
      if (t % 30 < 20) text(g, '▶', x - 236, y + i * gap, { size: 20, color: '#ffd84a', outline: null });
    }
    const hasVal = it.value !== undefined;
    text(g, label, hasVal ? x - 40 : x, y + i * gap, { size: on ? 32 : 28, color: on ? '#ffe9a8' : '#c9c2d8', font: FONT_TC, lw: 6 });
    if (hasVal) text(g, `◀ ${it.value} ▶`, x + 220, y + i * gap, { size: 22, color: on ? '#fff' : '#9a92aa', font: FONT_TC, align: 'center' });
  });
}

// 火星粒子（標題、結局用）
class Embers {
  constructor(n = 40) { this.list = []; for (let i = 0; i < n; i++) this.list.push(this.spawn(true)); }
  spawn(any) { return { x: Math.random() * VIEW_W, y: any ? Math.random() * VIEW_H : VIEW_H + 10, vy: 0.6 + Math.random() * 1.6, vx: (Math.random() - 0.5) * 0.6, s: 3 + Math.floor(Math.random() * 3) * 3, ph: Math.random() * 6 }; }
  draw(g, t, color = '#ffb347') {
    for (const e of this.list) {
      e.y -= e.vy; e.x += e.vx + Math.sin(t * 0.03 + e.ph) * 0.4;
      if (e.y < -10) Object.assign(e, this.spawn(false));
      g.globalAlpha = Math.min(1, e.y / VIEW_H + 0.2);
      g.fillStyle = color;
      g.fillRect(Math.round(e.x / 3) * 3, Math.round(e.y / 3) * 3, e.s, e.s);
    }
    g.globalAlpha = 1;
  }
}

// ---------- 標題 ----------
// 開場：logo 從大縮小砸下 → 白閃 → 兩位角色左右滑入；閒置 14 秒進入輪播（大會序章 → Demo 對戰）
export class TitleScene {
  constructor(app, opts = {}) {
    this.app = app;
    this.t = opts.quick ? 60 : 0;
    this.idle = 0;
    this.embers = new Embers(46);
    this.ids = readyChars().sort(() => Math.random() - 0.5);
    this.k = 0;
    audio.stopMusic();
  }
  get pair() { const n = this.ids.length || 1; return [this.ids[this.k % n] || 'tora', this.ids[(this.k + 1) % n] || 'vera']; }
  update(ev) {
    this.t++;
    this.idle++;
    if (this.t % 420 === 0) this.k += 2;   // 每 7 秒換一組角色
    if (ev.any.ok || ev.any.back) {
      if (this.t < 40) { this.t = 40; return; }   // 開場動畫中按鍵 → 直接跳到完成
      audio.sfx('ok');
      this.app.go(new MenuScene(this.app));
      return;
    }
    if (this.idle > 60 * 14) this.app.go(attract(this.app));
  }
  tap() { this.update({ any: { ok: true } }); }
  draw(g) {
    const t = this.t, L = SC().title;
    const [a, b] = this.pair;
    backdrop(g, t, HOME[b] || 'market', 0.45);
    // 放射光束
    if (t > 30) {
      g.save();
      g.translate(VIEW_W / 2, L.logoY);
      g.rotate(t * 0.004);
      g.globalAlpha = Math.min(0.22, (t - 30) / 60);
      g.fillStyle = '#ffb347';
      for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(0, 0); g.lineTo(900, -70); g.lineTo(900, 70); g.fill(); }
      g.restore();
    }
    // 角色滑入（換組時先滑出再滑入）
    const ph = t % 420;
    const e = (v) => 1 - Math.pow(1 - Math.max(0, Math.min(1, v)), 3);
    const inP = t < 420 ? (t - 34) / 30 : ph / 30;      // 第一組在開場 logo 之後滑入，之後每組從 0 開始
    const off = ph > 400 ? e((ph - 400) / 20) * 520 : (1 - e(inP)) * 520;
    portrait(g, a, L.portraitX - off, L.portraitY, L.portraitH, false, 0.96);
    portrait(g, b, VIEW_W - L.portraitX + off, L.portraitY, L.portraitH, true, 0.96);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    this.embers.draw(g, t);
    // logo：從 2.6 倍砸到 1 倍
    if (t >= 14) {
      const p = Math.min(1, (t - 14) / 14);
      const s = t < 28 ? 2.6 - 1.6 * p * p : 1 + Math.max(0, Math.sin((t - 28) * 0.5)) * 0.04 * Math.max(0, 1 - (t - 28) / 20);
      g.globalAlpha = Math.min(1, p * 2);
      logo(g, VIEW_W / 2, L.logoY, s * L.logoS);
      g.globalAlpha = 1;
    }
    if (t >= 28 && t < 38) { g.fillStyle = `rgba(255,255,255,${(38 - t) / 10})`; g.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (t > 50) {
      if (t % 60 < 40) text(g, 'PRESS START', VIEW_W / 2, L.startY, { size: 36, color: '#fff', lw: 8 });
    }
    text(g, '© 2026 STREET KUMITE', VIEW_W / 2, 696, { size: 16, color: '#c9c2d8', outline: null });
  }
}

// 閒置輪播：大會序章（自動翻頁）→ CPU 對 CPU 的 Demo 對戰 → 回標題
function attract(app) {
  const pages = [{ stage: 'market', title: 'STREET KUMITE', lines: PROLOGUE.slice(0, 2) }, { stage: 'temple', title: 'STREET KUMITE', lines: PROLOGUE.slice(2) }];
  return new StoryScene(app, pages, () => demoBattle(app), { attract: true, auto: 150 });
}

function demoBattle(app) {
  const ids = readyChars().sort(() => Math.random() - 0.5);
  const a = ids[0] || 'tora', b = ids[1] || a;
  const st = readyStages();
  return new BattleScene(app, { mode: 'demo', chars: [a, b], stage: st.includes(HOME[b]) ? HOME[b] : st[0] });
}

// ---------- 模式選單 ----------
export class MenuScene {
  constructor(app) {
    this.app = app; this.t = 0; this.sel = 0;
    this.items = [
      { label: '街機模式', go: () => new SelectScene(app, 'ladder') },
      { label: '對戰 CPU', go: () => new SelectScene(app, 'arcade') },
      { label: '雙人對戰', go: () => new SelectScene(app, 'versus') },
      { label: '訓練模式', go: () => new SelectScene(app, 'training') },
      { label: '格鬥家', go: () => new ProfileScene(app, this) },
      { label: '招式表', go: () => new ControlsScene(app, this) },
      { label: '設定', go: () => new OptionsScene(app, this) },
    ];
  }
  update(ev) {
    this.t++;
    const e = ev.any;
    if (e.up) { this.sel = (this.sel + this.items.length - 1) % this.items.length; audio.sfx('move'); }
    if (e.down) { this.sel = (this.sel + 1) % this.items.length; audio.sfx('move'); }
    if (e.ok) { audio.sfx('ok'); this.app.go(this.items[this.sel].go()); }
    if (e.back) { audio.sfx('back'); this.app.go(new TitleScene(this.app, { quick: true })); }
  }
  click(x, y) {
    const i = rowAt(x, y, VIEW_W / 2, 300, 56, this.items.length);
    if (i >= 0) { this.sel = i; this.update({ any: { ok: true } }); }
  }
  draw(g) {
    backdrop(g, this.t, 'beach', 0.66);
    logo(g, VIEW_W / 2, 120, 0.56);
    menuList(g, this.items, this.sel, VIEW_W / 2, 300, 56, this.t);
  }
}

// ---------- 選角 ----------
// 只列出素材已就緒的角色／舞台（新角色做完一位就會出現）
const readyChars = () => PLAYABLE_IDS.filter((id) => ASSETS.chars[id]);
const readyBosses = () => BOSS_IDS.filter((id) => ASSETS.chars[id]);   // 素材做好的四天王才會出場
const readyStages = () => STAGE_IDS.filter((id) => ASSETS.stages[id]);
const HOME = { tora: 'market', vera: 'beach', baatar: 'steppe', skye: 'harbor', kagero: 'rooftop', shen: 'temple', drake: 'gym', kanya: 'stadium', atlas: 'ruins', seth: 'pyramid', volkan: 'volcano', tesshin: 'summit' };

export class SelectScene {
  constructor(app, mode, prev) {
    this.app = app; this.mode = mode; this.t = 0;
    this.ids = readyChars();
    this.stages = readyStages();
    const idx = (id, d) => { const i = this.ids.indexOf(id); return i >= 0 ? i : d; };
    this.cur = [prev ? idx(prev.chars[0], 0) : 0, prev ? idx(prev.chars[1], 1) : Math.min(1, this.ids.length - 1)];
    this.done = [false, false];
    this.flash = [0, 0];      // 確定時頭像白閃
    this.stage = prev ? Math.max(0, this.stages.indexOf(prev.stage)) : 0;
    this.phase = 'chars';   // chars → stage
    this.active = 0;        // 1P 模式：先選自己再選對手
    this.clear = cleared();
    if (audio.playing !== 8) audio.playMusic(8);   // 選角：拳帖之歌
  }
  toStage() {
    this.phase = 'stage';
    // 預設對手（或 2P）的主場
    const home = this.stages.indexOf(HOME[this.ids[this.cur[1]]]);
    if (home >= 0) this.stage = home;
  }
  confirm(i) {
    this.done[i] = true;
    this.flash[i] = 12;
    audio.sfx('ok');
    audio.sfx('hitM');
  }
  update(ev) {
    this.t++;
    for (let i = 0; i < 2; i++) if (this.flash[i] > 0) this.flash[i]--;
    const n = this.ids.length;
    if (this.phase === 'chars') {
      const versus = this.mode === 'versus';
      const evs = versus ? [ev.p1, ev.p2] : [ev.any, ev.any];
      for (let i = 0; i < 2; i++) {
        if (!versus && i !== this.active) continue;
        const e = evs[i];
        if (this.done[i]) {
          if (e.back) { this.done[i] = false; audio.sfx('back'); if (!versus && i === 1) this.active = 1; }
          continue;
        }
        const cols = Math.min(n, 4);
        if (e.left) { this.cur[i] = (this.cur[i] + n - 1) % n; audio.sfx('move'); }
        if (e.right) { this.cur[i] = (this.cur[i] + 1) % n; audio.sfx('move'); }
        if (e.up && n > cols) { this.cur[i] = (this.cur[i] + n - cols) % n; audio.sfx('move'); }
        if (e.down && n > cols) { this.cur[i] = (this.cur[i] + cols) % n; audio.sfx('move'); }
        if (e.ok) { this.confirm(i); if (!versus && i === 0) this.active = 1; }
        if (e.back) {
          audio.sfx('back');
          if (!versus && i === 1) { this.active = 0; this.done[0] = false; }
          else { this.app.go(new MenuScene(this.app)); return; }
        }
        if (!versus) break;   // 單人：同一個按鍵只處理目前這一邊（不然一按確定會連對手一起選掉）
      }
      if (this.mode === 'ladder' && this.done[0]) { if (!this.wait) this.wait = 24; }
      if (this.wait && --this.wait === 0) { this.startLadder(); return; }
      if (this.mode !== 'ladder' && this.done[0] && this.done[1]) this.toStage();
      return;
    }
    const e = ev.any;
    const m = this.stages.length;
    if (e.left) { this.stage = (this.stage + m - 1) % m; audio.sfx('move'); }
    if (e.right) { this.stage = (this.stage + 1) % m; audio.sfx('move'); }
    if (e.back) { this.phase = 'chars'; this.done = [false, false]; this.active = 0; audio.sfx('back'); }
    if (e.ok) {
      audio.sfx('ok');
      const setup = { mode: this.mode, chars: [this.ids[this.cur[0]], this.ids[this.cur[1]]], stage: this.stages[this.stage] };
      this.app.go(this.mode === 'training' ? new BattleScene(this.app, setup) : new VSScene(this.app, setup));
    }
  }
  // 街機模式：其他角色隨機排序、宿敵固定排最後；先播大會序章與角色序章
  startLadder() {
    const me = this.ids[this.cur[0]];
    const rival = STORY[me] && STORY[me].rival;
    const ladder = this.ids.filter((id) => id !== me && id !== rival).sort(() => Math.random() - 0.5);
    if (rival && this.ids.includes(rival) && rival !== me) ladder.push(rival);
    ladder.push(...readyBosses());          // 最後依序挑戰拳帖四天王
    if (!ladder.length) ladder.push(me);
    const setup = ladderSetup(me, ladder, 0, this.stages);
    this.app.go(new StoryScene(this.app, ladderPrologue(me), () => new TravelScene(this.app, HOME[me], setup)));
  }
  // 角色格：4 欄，放在畫面下方中間
  slotPos(k) {
    const L = SC().select, size = L.slot, gap = size + 10, cols = 4;
    return { x: VIEW_W / 2 - (cols * gap) / 2 + (k % cols) * gap + gap / 2, y: L.slotY + Math.floor(k / cols) * gap, size };
  }
  // 觸控：選舞台時點左右兩側換舞台、點中間確定；選角跟滑鼠一樣
  tap(x, y) {
    if (this.phase === 'stage' && y > 270 && y < 420 && (x < 400 || x > VIEW_W - 400)) {
      const e = { left: x < 400, right: x >= 400 };
      this.update({ any: e, p1: e, p2: e });
      return;
    }
    this.click(x, y);
  }
  click(x, y) {
    if (this.phase !== 'chars') { this.update({ any: { ok: true }, p1: {}, p2: {} }); return; }
    const i = this.mode === 'versus' ? (x < VIEW_W / 2 ? 0 : 1) : this.active;
    this.ids.forEach((id, k) => {
      const p = this.slotPos(k);
      if (Math.abs(x - p.x) < p.size / 2 && Math.abs(y - p.y) < p.size / 2) {
        this.cur[i] = k; this.confirm(i);
        if (this.mode !== 'versus' && i === 0) this.active = 1;
        if (this.mode !== 'ladder' && this.done[0] && this.done[1]) this.toStage();
      }
    });
  }
  // 上方世界地圖（各國國旗與位置），下方左右頭像、中間角色格
  draw(g) {
    const t = this.t, L = SC().select;
    drawMap(g);
    // 地圖上的各國：1P 選的家鄉紅色、2P／CPU 藍色；選舞台時黃色
    const hl = {};
    if (this.phase === 'stage') hl[this.stages[this.stage]] = '#ffd84a';
    else {
      hl[HOME[this.ids[this.cur[0]]]] = '#ff5a3c';
      if (this.mode !== 'ladder') hl[HOME[this.ids[this.cur[1]]]] = hl[HOME[this.ids[this.cur[1]]]] || '#3cb4ff';
    }
    for (const id of new Set(this.ids.map((c) => HOME[c]))) if (!hl[id]) drawPin(g, id, t);
    for (const [id, c] of Object.entries(hl)) drawPin(g, id, t, c);
    text(g, 'SELECT YOUR FIGHTER', VIEW_W / 2, 30, { size: 30, color: '#ffd84a', lw: 8 });
    // 下方面板
    const grd = g.createLinearGradient(0, L.slotY - 90, 0, L.slotY - 40);
    grd.addColorStop(0, 'rgba(5,3,15,0)');
    grd.addColorStop(1, 'rgba(5,3,15,0.88)');
    g.fillStyle = grd;
    g.fillRect(0, L.slotY - 90, VIEW_W, 400);
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? L.portraitX : VIEW_W - L.portraitX;
      if (this.mode === 'ladder' && i === 1) {
        text(g, '?', x, L.portraitY + L.portraitH / 2, { size: 200, color: 'rgba(255,255,255,0.12)', outline: null, shadow: false });
        continue;
      }
      const id = this.ids[this.cur[i]];
      const c = CHARS[id];
      const shake = this.flash[i] > 6 ? (this.flash[i] % 2 ? 4 : -4) : 0;
      portrait(g, id, x + shake, L.portraitY, L.portraitH, i === 1);
      if (this.flash[i] > 0) { g.fillStyle = `rgba(255,255,255,${this.flash[i] / 16})`; g.fillRect(x - 180, L.portraitY, 360, L.portraitH); }
      text(g, i === 0 ? '1P' : this.mode === 'versus' ? '2P' : 'CPU', x + (i === 0 ? -150 : 150), L.nameY, { size: 22, color: i === 0 ? '#ff5a3c' : '#3cb4ff' });
      text(g, c.name, x, L.nameY, { size: 40, color: '#fff', lw: 8 });
      if (this.done[i]) text(g, 'READY!', x, L.portraitY + L.portraitH * 0.55, { size: 46, color: '#7dff6b', lw: 10 });
    }
    // 角色格
    this.ids.forEach((id, k) => {
      const { x, y, size } = this.slotPos(k);
      const h = size / 2;
      g.fillStyle = '#120a18';
      g.fillRect(x - h, y - h, size, size);
      const img = ASSETS.portraits[id];
      if (img) { g.save(); g.beginPath(); g.rect(x - h + 2, y - h + 2, size - 4, size - 4); g.clip(); drawArt(g, img, x - h * 1.35, y - h * 1.1, size * 1.35, size * 1.35 * img.height / img.width); g.restore(); }
      if (this.clear.has(id)) text(g, '★', x + h - 12, y - h + 12, { size: 18, color: '#ffd84a' });
      for (let i = 0; i < 2; i++) {
        if (this.mode === 'ladder' && i === 1) continue;   // 街機模式沒有對手游標
        if (this.cur[i] === k) {
          g.strokeStyle = i === 0 ? '#ff5a3c' : '#3cb4ff';
          g.lineWidth = 5;
          g.strokeRect(x - h - i * 6, y - h - i * 6, size + i * 12, size + i * 12);
        }
      }
    });
    if (this.phase === 'stage') {
      g.fillStyle = 'rgba(0,0,0,0.72)';
      g.fillRect(0, 290, VIEW_W, 110);
      const id = this.stages[this.stage];
      const s = STAGES[id], info = STAGE_INFO[id];
      text(g, `◀  ${s.nameZh}  ${s.name}  ▶`, VIEW_W / 2, 330, { size: 34, color: '#fff', font: FONT_TC });
      if (info) text(g, info.en, VIEW_W / 2, 372, { size: 18, color: '#ffe9a8' });
    }
  }
}

// 街機模式開場：大會序章 + 角色序章（出身、參賽理由）
function ladderPrologue(id) {
  const S = STORY[id], c = CHARS[id];
  const pages = [{ stage: 'temple', title: 'STREET KUMITE', lines: PROLOGUE }];
  if (S) pages.push({ stage: HOME[id], char: id, title: `${c.name}　${c.nameZh}`, lines: S.bio });
  return pages;
}

// ---------- 劇情 ----------
// pages：[{ stage, char, title, lines }]；next() 回傳下一個場景
// opts.auto：每頁顯示完後自動翻頁的 tick 數；opts.attract：輪播模式（任何按鍵回標題）
export class StoryScene {
  constructor(app, pages, next, opts = {}) {
    this.app = app; this.pages = pages; this.next = next; this.opts = opts;
    this.i = 0; this.t = 0; this.T = 0;
    this.embers = new Embers(18);
    if (opts.music !== undefined) audio.playMusic(opts.music);
  }
  get page() { return this.pages[this.i]; }
  lines() {
    const L = SC().story;
    const key = `${this.i}|${L.boxW}|${L.textSize}`;
    if (this.cacheKey !== key) { this.cacheKey = key; this.cache = this.page.lines.flatMap((l) => wrap(ctx2d(), l, L.boxW - 60, L.textSize)); }
    return this.cache;
  }
  update(ev) {
    this.t++; this.T++;
    const e = ev.any;
    if (this.opts.attract && (e.ok || e.back)) { this.app.go(new TitleScene(this.app, { quick: true })); return; }
    const total = charCount(this.lines());
    const shown = this.t * TYPE_SPEED;
    if (e.back && !this.opts.attract) { audio.sfx('back'); this.finish(); return; }
    if (e.ok) {
      if (shown < total) this.t = Math.ceil(total / TYPE_SPEED);
      else this.turn();
      return;
    }
    if (this.opts.auto && shown >= total + this.opts.auto * TYPE_SPEED) this.turn();
  }
  tap() { this.update({ any: { ok: true } }); }
  turn() {
    this.i++; this.t = 0;
    if (this.i >= this.pages.length) this.finish();
    else audio.sfx('move');
  }
  finish() { if (!this.done) { this.done = true; this.app.go(this.next()); } }
  draw(g) {
    const L = SC().story, pg = this.page;
    if (!pg) return;
    // 每頁鏡頭緩慢橫移
    backdrop(g, this.T, pg.stage || 'market', 0.38, Math.min(600, 120 + this.t * 0.6));
    this.embers.draw(g, this.T, '#ffe9a8');
    if (pg.char) {
      const slide = Math.min(1, this.t / 18);
      portrait(g, pg.char, L.portraitX + (1 - slide) * 300, L.portraitY, L.portraitH, true, slide);
    }
    // 電影黑邊
    g.fillStyle = '#000';
    g.fillRect(0, 0, VIEW_W, 46);
    g.fillRect(0, VIEW_H - 22, VIEW_W, 22);
    if (pg.title) text(g, pg.title, 60, 23, { size: 20, color: '#ffd84a', align: 'left', font: FONT_TC, outline: null });
    panel(g, L.boxX, L.boxY, L.boxW, L.boxH);
    const lines = this.lines();
    const shown = typed(lines, this.t * TYPE_SPEED);
    const lh = L.textSize * 1.45;
    shown.forEach((l, k) => text(g, l, L.boxX + 30, L.boxY + 34 + k * lh, { size: L.textSize, color: '#fff', align: 'left', font: FONT_TC, outline: '#000', lw: 4 }));
    if (this.t * TYPE_SPEED >= charCount(lines) && this.T % 40 < 26) text(g, '▼', L.boxX + L.boxW - 34, L.boxY + L.boxH - 26, { size: 20, color: '#ffd84a', outline: null });
    if (this.opts.attract && this.T % 60 < 40) text(g, 'PRESS START', VIEW_W / 2, 90, { size: 26, color: '#fff' });
  }
}

// 量字寬用的 context（場景沒拿到主畫布時）
let measureCtx = null;
function ctx2d() { return measureCtx || (measureCtx = document.createElement('canvas').getContext('2d')); }

// ---------- VS ----------
// 兩邊頭像滑入 → VS 砸下 → 雙方台詞（宿敵戰是兩句對話）→ 開打
export class VSScene {
  constructor(app, setup) {
    this.app = app; this.setup = setup; this.t = 0;
    const [a, b] = setup.chars;
    const L = setup.ladder;
    this.rival = !!(L && STORY[a] && STORY[a].rival === b);
    // 四天王：開戰台詞（鐵心對虎牙、沈有專屬對話）
    this.boss = BOSS_STORY[b] || null;
    if (this.boss) this.talk = (this.boss.vsTalk && this.boss.vsTalk[a]) || [[b, this.boss.bossLine]];
    else this.talk = this.rival ? STORY[a].rivalTalk : [];
    this.lineT = 80;                          // 每句台詞顯示多久
    this.end = this.talk.length ? 40 + this.talk.length * this.lineT + 50 : 150;
    audio.stopMusic();
  }
  update(ev) {
    this.t++;
    if (this.t === 22) { audio.sfx('hitX'); }
    if (this.t > this.end || (this.t > 30 && ev.any.ok)) this.app.go(new BattleScene(this.app, this.setup));
  }
  tap() { this.update({ any: { ok: true } }); this.t--; }
  draw(g) {
    const t = this.t, L = SC().vs;
    const [a, b] = this.setup.chars;
    const lg = lowLayer(g);
    lg.fillStyle = '#0a0410';
    lg.fillRect(0, 0, VIEW_W, VIEW_H);
    // 斜切的紅藍底，帶捲動斜線
    lg.fillStyle = this.rival ? '#5a0a0a' : '#7a1206';
    lg.beginPath(); lg.moveTo(0, 0); lg.lineTo(VIEW_W * 0.58, 0); lg.lineTo(VIEW_W * 0.42, VIEW_H); lg.lineTo(0, VIEW_H); lg.fill();
    lg.fillStyle = this.rival ? '#1a0a3a' : '#0b2f6b';
    lg.beginPath(); lg.moveTo(VIEW_W * 0.58, 0); lg.lineTo(VIEW_W, 0); lg.lineTo(VIEW_W, VIEW_H); lg.lineTo(VIEW_W * 0.42, VIEW_H); lg.fill();
    lg.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = -10; i < 30; i++) { const x = ((i * 90 + t * 6) % 2700) - 600; lg.beginPath(); lg.moveTo(x, 0); lg.lineTo(x + 40, 0); lg.lineTo(x - 260, VIEW_H); lg.lineTo(x - 300, VIEW_H); lg.fill(); }
    presentLow(g);
    const slide = 1 - Math.pow(1 - Math.min(1, t / 18), 3);
    portrait(g, a, -260 + slide * (L.portraitX + 260), L.portraitY, L.portraitH, false);
    portrait(g, b, VIEW_W + 260 - slide * (L.portraitX + 260), L.portraitY, L.portraitH, true);
    text(g, CHARS[a].name, 260, L.nameY, { size: 56, lw: 10 });
    text(g, CHARS[b].name, VIEW_W - 260, L.nameY, { size: 56, lw: 10 });
    // VS
    const s = t < 22 ? 3 - (t / 22) * 2 : 1 + Math.sin(t * 0.2) * 0.03;
    text(g, 'VS', VIEW_W / 2, VIEW_H / 2 - 30, { size: 130 * s, color: '#ffd84a', lw: 14 });
    if (t >= 22 && t < 30) { g.fillStyle = `rgba(255,255,255,${(30 - t) / 10})`; g.fillRect(0, 0, VIEW_W, VIEW_H); }
    if ((this.rival || this.boss) && t > 24) {
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 120, VIEW_W, 46);
      const label = this.boss ? this.boss.rank : '宿 命 之 戰';
      if (t % 30 < 22) text(g, label, VIEW_W / 2, 143, { size: 30, color: this.boss ? '#ffd84a' : '#ff5a3c', font: FONT_TC, lw: 6 });
    }
    // 台詞：依序打字
    this.talk.forEach(([who, line], k) => {
      const t0 = 40 + k * this.lineT;
      if (t < t0 || !line) return;
      const bx = who === a ? 60 : VIEW_W - 60 - 520;   // 1P 說的放左邊、對手放右邊
      const y = L.quoteY;
      panel(g, bx, y - 26, 520, 52, CHARS[who].color, 0.8);
      text(g, `「${line.slice(0, Math.floor((t - t0) * TYPE_SPEED * 1.4))}」`, bx + 20, y, { size: 19, color: '#fff', align: 'left', font: FONT_TC, outline: '#000', lw: 4 });
    });
  }
}

// ---------- 移動路線（街機模式每戰之間）----------
export class TravelScene {
  constructor(app, from, setup) {
    this.app = app; this.from = from; this.setup = setup; this.to = setup.stage; this.t = 0;
    audio.sfx('move');
  }
  update(ev) {
    this.t++;
    if (this.t === 80) audio.sfx('ok');
    if (this.t > 150 || (this.t > 20 && ev.any.ok)) this.app.go(new VSScene(this.app, this.setup));
  }
  tap() { this.update({ any: { ok: true } }); }
  draw(g) {
    const t = this.t;
    drawMap(g);
    for (const id of Object.keys(LOCS)) if (id !== this.from && id !== this.to && ASSETS.stages[id] && Object.values(HOME).includes(id)) drawPin(g, id, t, null, false);
    drawPin(g, this.from, t, '#ffffff');
    drawRoute(g, this.from, this.to, Math.min(1, t / 80), t);
    if (t > 80) {
      drawPin(g, this.to, t, '#ff3b2f');
      const info = STAGE_INFO[this.to];
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.fillRect(0, 600, VIEW_W, 80);
      text(g, `${STAGES[this.to].nameZh}　${info ? info.en : ''}`, VIEW_W / 2, 640, { size: 30, color: '#fff', font: FONT_TC });
    }
    if (this.setup.ladder) text(g, `STAGE ${this.setup.stageNo + 1}`, VIEW_W / 2, 40, { size: 34, color: '#ffd84a', lw: 8 });
  }
}

// 街機模式下一戰的設定（後段難度自動 +1）
function ladderSetup(me, ladder, n, stages) {
  const opp = ladder[n];
  const home = HOME[opp];
  const all = stages || readyStages();
  return { mode: 'arcade', ladder, stageNo: n, chars: [me, opp], stage: all.includes(home) ? home : all[n % all.length] };
}

// ---------- 通關：角色結局 → 製作名單 ----------
export function endingScene(app, setup) {
  const id = setup.chars[0];
  markCleared(id);
  const S = STORY[id];
  const pages = S ? S.ending.map((p, i) => ({ stage: p.stage, char: i === S.ending.length - 1 || i === 0 ? id : null, title: `ENDING・${CHARS[id].name}`, lines: p.text })) : [];
  return new StoryScene(app, pages, () => new CreditsScene(app, id), { music: 8 });
}

export class CreditsScene {
  constructor(app, id) { this.app = app; this.id = id; this.t = 0; this.embers = new Embers(30); }
  update(ev) {
    this.t++;
    const endT = 60 * 18;
    if (this.t > endT + 60 && (ev.any.ok || ev.any.back)) { audio.stopMusic(); audio.sfx('ok'); this.app.go(new TitleScene(this.app, { quick: true })); }
    else if (this.t > 60 && (ev.any.ok || ev.any.back)) this.t = endT;
  }
  tap() { this.update({ any: { ok: true } }); }
  draw(g) {
    const t = this.t;
    const home = HOME[this.id] || 'market';
    backdrop(g, t, home, 0.72, Math.min(600, 100 + t * 0.4));
    this.embers.draw(g, t, CHARS[this.id].color);
    const endT = 60 * 18;
    if (t < endT) {
      // 製作名單由下往上捲
      const y0 = VIEW_H + 40 - t * 0.9;
      CREDITS.forEach(([role, name], i) => {
        const y = y0 + i * 110;
        if (y < -40 || y > VIEW_H + 40) return;
        if (role) text(g, role, VIEW_W / 2, y, { size: i === 0 ? 48 : 18, color: i === 0 ? '#ffd84a' : '#ff9a5a', font: i === 0 ? undefined : FONT_TC, lw: i === 0 ? 10 : 4 });
        if (name) text(g, name, VIEW_W / 2, y + 36, { size: 24, color: '#fff', font: FONT_TC });
      });
      // 右下角放全員頭像輪流
      const ids = readyChars();
      const id = ids[Math.floor(t / 120) % ids.length];
      portrait(g, id, VIEW_W - 200, 230, 480, true, Math.min(1, (t % 120) / 20, (120 - (t % 120)) / 20));
    } else {
      const a = Math.min(1, (t - endT) / 40);
      g.globalAlpha = a;
      text(g, 'THE END', VIEW_W / 2, 300, { size: 96, color: '#ffd84a', lw: 14 });
      text(g, 'THANK YOU FOR PLAYING', VIEW_W / 2, 400, { size: 30, color: '#fff' });
      text(g, `${CHARS[this.id].name} ★ CLEAR`, VIEW_W / 2, 460, { size: 22, color: CHARS[this.id].color });
      if (t > endT + 60 && t % 60 < 40) text(g, 'PRESS START', VIEW_W / 2, 560, { size: 24, color: '#ffe9a8' });
      g.globalAlpha = 1;
    }
  }
}

// ---------- CONTINUE ----------
export class ContinueScene {
  constructor(app, setup) { this.app = app; this.setup = setup; this.t = 0; this.n = 9; audio.stopMusic(); }
  update(ev) {
    this.t++;
    if (ev.any.ok && this.t > 20) { audio.sfx('ok'); this.app.go(new VSScene(this.app, this.setup)); return; }
    // 按返回鍵加速倒數（街機習慣）
    if (ev.any.back) this.t = (Math.floor(this.t / 60) + 1) * 60;
    if (this.t % 60 === 0) {
      this.n--;
      if (this.n < 0) { this.app.go(new GameOverScene(this.app)); return; }
      audio.sfx('move');
    }
  }
  tap() { this.update({ any: { ok: true } }); }
  draw(g) {
    const t = this.t;
    const id = this.setup.chars[0];
    backdrop(g, t, this.setup.stage, 0.8);
    // 落敗頭像，隨倒數越來越暗
    portrait(g, id, 340, 100, 560, false, 0.35 + (this.n / 9) * 0.65, true);
    text(g, 'CONTINUE?', 860, 220, { size: 70, color: '#ffd84a', lw: 12 });
    const p = (t % 60) / 60;
    text(g, String(Math.max(0, this.n)), 860, 380, { size: 160 * (1.15 - p * 0.15), color: this.n <= 3 ? '#ff4a2a' : '#fff', lw: 14 });
    if (t % 40 < 28) text(g, 'PRESS START', 860, 520, { size: 26, color: '#ffe9a8' });
  }
}

export class GameOverScene {
  constructor(app) { this.app = app; this.t = 0; }
  update(ev) {
    this.t++;
    if (this.t > 200 || (this.t > 40 && (ev.any.ok || ev.any.back))) this.app.go(new TitleScene(this.app, { quick: true }));
  }
  tap() { this.update({ any: { ok: true } }); }
  draw(g) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.globalAlpha = Math.min(1, this.t / 40);
    text(g, 'GAME OVER', VIEW_W / 2, VIEW_H / 2, { size: 96, color: '#ff3b2f', lw: 12 });
    g.globalAlpha = 1;
  }
}

// ---------- 格鬥家檔案 ----------
export class ProfileScene {
  constructor(app, back) { this.app = app; this.back = back; this.t = 0; this.i = 0; this.ids = readyChars(); this.clear = cleared(); }
  update(ev) {
    this.t++;
    const n = this.ids.length;
    if (ev.any.left) { this.i = (this.i + n - 1) % n; this.t = 0; audio.sfx('move'); }
    if (ev.any.right) { this.i = (this.i + 1) % n; this.t = 0; audio.sfx('move'); }
    if (ev.any.back || ev.any.ok) { audio.sfx('back'); this.app.go(this.back); }
  }
  tap(x) {
    const e = { left: x < VIEW_W * 0.2, right: x > VIEW_W * 0.8 };
    if (!e.left && !e.right) e.back = true;
    this.update({ any: e });
  }
  draw(g) {
    const id = this.ids[this.i], c = CHARS[id], S = STORY[id];
    backdrop(g, this.t + this.i * 500, HOME[id], 0.62);
    const slide = 1 - Math.pow(1 - Math.min(1, this.t / 16), 3);
    portrait(g, id, 280 - (1 - slide) * 200, 90, 560, false, slide);
    text(g, c.name, 280, 600, { size: 56, lw: 10 });
    text(g, `${c.nameZh}・${c.title}`, 280, 642, { size: 20, color: c.color, font: FONT_TC });
    if (this.clear.has(id)) text(g, '★ CLEAR', 280, 676, { size: 18, color: '#ffd84a' });
    if (!S) return;
    // 只放基本資料與故事本文
    const x = 560, w = 670;
    panel(g, x, 70, w, 540, c.color, 0.8);
    text(g, S.countryEn, x + 30, 108, { size: 24, color: c.color, align: 'left' });
    Object.entries(S.profile).forEach(([k, v], i) => {
      text(g, `${k}　${v}`, x + 30, 152 + i * 30, { size: 17, color: '#fff', align: 'left', font: FONT_TC, outline: null });
    });
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(x + 30, 252, w - 60, 2);
    const lines = S.bio.flatMap((l) => wrap(g, l, w - 60, 19));
    typed(lines, this.t * 2.2).forEach((l, k) => text(g, l, x + 30, 290 + k * 34, { size: 19, color: '#eee', align: 'left', font: FONT_TC, outline: null, shadow: false }));
    text(g, '◀', 24, 360, { size: 30, color: '#ffffff88', outline: null });
    text(g, '▶', VIEW_W - 24, 360, { size: 30, color: '#ffffff88', outline: null });
  }
}

// ---------- 對戰 ----------
export const TRAINING_DEFAULT = { dummy: 'stand', block: 'none', refill: true, meter: 'infinite', boxes: false, frameData: true, inputLog: true, cpuLevel: 1, recording: null };

export class BattleScene {
  constructor(app, setup) {
    this.app = app;
    this.setup = setup;
    this.t = 0;
    this.pause = null;
    const mode = setup.mode;
    this.demo = mode === 'demo';               // 標題輪播的 CPU 對 CPU
    const p1 = this.demo ? new AIController(2) : mode === 'versus' ? new HumanController([KEYMAPS.p1], [0], true) : new HumanController([KEYMAPS.solo], [0], true);
    this.p1Ctrl = p1;
    let p2;
    this.training = mode === 'training' ? (app.training = app.training || { ...TRAINING_DEFAULT }) : null;
    if (this.demo) p2 = new AIController(2);
    else if (mode === 'versus') p2 = new HumanController([KEYMAPS.p2], [1]);
    else if (mode === 'training') p2 = new DummyController(this.training);
    else {
      // 街機模式後段變強；四天王再加一級，最終王固定最強
      const boss = setup.ladder && CHARS[setup.chars[1]].boss;
      const lv = setup.ladder ? Math.min(3, GAME.difficulty + Math.floor(setup.stageNo / 3) + (boss ? 1 : 0)) : GAME.difficulty;
      p2 = new AIController(boss && CHARS[setup.chars[1]].final ? 3 : lv);
    }
    this.p2Ctrl = p2;
    this.battle = new Battle({ chars: setup.chars.map((id) => CHARS[id]), stage: setup.stage, mode, controllers: [p1, p2], training: this.training });
    if (setup.chars[0] === setup.chars[1]) altAtlasImages(setup.chars[1]);   // 鏡像配色（通常已在閒置時算好）
    app.battle = this.battle;
    audio.playMusic(STAGES[setup.stage].bgm);
  }

  update(ev, codes) {
    this.t++;
    const b = this.battle;
    if (this.demo) {
      // Demo：任何按鍵、打完或 40 秒後回標題
      if (ev.any.ok || ev.any.back || padStart() || b.phase === 'matchEnd' || this.t > 60 * 40) { audio.stopMusic(); this.app.go(new TitleScene(this.app, { quick: true })); return; }
      b.step();
      return;
    }
    if (this.pause) { this.pause.update(ev); return; }
    if (codes.includes('Escape') || codes.includes('Enter') && this.setup.mode !== 'versus' || codes.includes('NumpadEnter') || padStart()) {
      if (b.phase !== 'matchEnd') { this.openPause(); return; }
    }
    // 訓練：重設位置／錄製
    if (this.training) {
      if (codes.includes('Backspace') || codes.includes('KeyR')) {
        if (this.recording) this.stopRecording();
        else {
          const raw = this.p1Ctrl.poll();
          b.resetPositions(raw.left ? 'left' : raw.right ? 'right' : 'center');
        }
      }
    }
    if (this.app.dev && this.app.dev.paused && !this.app.dev.stepOnce) return;
    if (this.app.dev) this.app.dev.stepOnce = false;
    const steps = this.app.dev ? this.app.dev.speedSteps() : 1;
    for (let i = 0; i < steps; i++) b.step();
    if (b.phase === 'matchEnd' && !this.ended) {
      this.ended = true;
      setTimeout(() => this.app.go(new ResultScene(this.app, this.setup, b.result)), 600);
    }
  }

  openPause() {
    audio.sfx('back');
    this.pause = new PauseMenu(this);
  }

  // 觸控點擊：只在暫停選單有作用（對戰中的點擊不做事）；Demo 中點擊回標題
  tap(x, y) {
    if (this.demo) { this.update({ any: { ok: true } }, []); return; }
    if (this.pause) this.pause.tap(x, y);
  }

  // 訓練錄製：1P 的輸入暫時操控假人
  startRecording() {
    const T = this.training;
    const me = this.battle.fighters[1];
    T.recording = [];
    this.recording = true;
    const human = this.p1Ctrl;
    const self = this;
    this.battle.controllers[0] = new NullController();
    this.battle.controllers[1] = {
      poll(b, f) {
        const raw = human.poll();
        if (T.recording.length < 600) {
          const h = (raw.right ? 1 : 0) - (raw.left ? 1 : 0);
          const v = raw.up ? 1 : raw.down ? -1 : 0;
          const abs = 5 + h + v * 3;
          const MIR = { 1: 3, 3: 1, 4: 6, 6: 4, 7: 9, 9: 7 };
          const d = f.facing > 0 ? abs : MIR[abs] || abs;
          T.recording.push({ d, b: ['LP', 'MP', 'HP', 'LK', 'MK', 'HK'].filter((k) => raw[k]) });
        } else self.stopRecording();
        return raw;
      },
    };
    this.battle.say('RECORDING', 60, '#ff5a3c', '操作假人，按 R 結束錄製');
    void me;
  }

  stopRecording() {
    this.recording = false;
    this.battle.controllers[0] = this.p1Ctrl;
    this.battle.controllers[1] = this.p2Ctrl;
    if (this.training.recording && this.training.recording.length) {
      // 去掉開頭空白
      const r = this.training.recording;
      while (r.length && r[0].d === 5 && !r[0].b.length) r.shift();
      this.training.dummy = 'playback';
      this.p2Ctrl.playIdx = 0;
      this.battle.say('PLAYBACK', 50, '#7dff6b', `已錄製 ${(r.length / 60).toFixed(1)} 秒，假人會重複播放`);
    }
  }

  draw(g) {
    const b = this.battle;
    drawBattle(g, b, this.t);
    if (this.demo) {
      text(g, 'DEMO PLAY', VIEW_W / 2, 132, { size: 30, color: '#ffd84a' });
      if (this.t % 60 < 40) text(g, 'PRESS START', VIEW_W / 2, 600, { size: 30, color: '#fff' });
      return;
    }
    if (this.recording) text(g, '● REC', VIEW_W - 90, 120, { size: 22, color: this.t % 40 < 25 ? '#ff3b2f' : '#802020' });
    if (this.training && !this.pause) {
      const hint = touchState.enabled ? 'Ⅱ 選單　⟲ 重設位置（按住搖桿←/→ 到牆角）' : 'Esc 選單　R 重設位置（按住←/→ 到牆角）';
      text(g, hint, VIEW_W / 2, 712, { size: 14, color: '#ffffffaa', font: FONT_TC, outline: null });
    }
    if (this.pause) this.pause.draw(g);
  }
}

let padPrevStart = [false, false];
function padStart() {
  let hit = false;
  for (let i = 0; i < 2; i++) {
    const r = readPad(i);
    const s = !!(r && r.start);
    if (s && !padPrevStart[i]) hit = true;
    padPrevStart[i] = s;
  }
  return hit;
}

// ---------- 暫停選單 ----------
const OPT = {
  dummy: [['stand', '站立'], ['crouch', '蹲下'], ['jump', '連續跳'], ['cpu', 'CPU 操控'], ['playback', '重播錄製']],
  block: [['none', '不防禦'], ['all', '全部防禦'], ['after', '受擊後防禦'], ['random', '隨機防禦']],
  meter: [['normal', '一般'], ['infinite', '無限']],
  onoff: [[true, '開'], [false, '關']],
  level: [[0, 'EASY'], [1, 'NORMAL'], [2, 'HARD'], [3, 'MASTER']],
};

class PauseMenu {
  constructor(scene) {
    this.s = scene;
    this.sel = 0;
    this.build();
  }
  build() {
    const s = this.s, T = s.training;
    const items = [{ label: '繼續', act: () => this.close() }];
    if (T) {
      const opt = (label, key, list) => ({ label, key, list, get value() { const o = list.find((x) => x[0] === T[key]); return o ? o[1] : '-'; } });
      items.push(
        opt('假人動作', 'dummy', OPT.dummy),
        opt('假人防禦', 'block', OPT.block),
        opt('CPU 難度', 'cpuLevel', OPT.level),
        opt('超必殺量表', 'meter', OPT.meter),
        opt('自動回血', 'refill', OPT.onoff),
        opt('顯示判定框', 'boxes', OPT.onoff),
        opt('Frame Data', 'frameData', OPT.onoff),
        opt('輸入紀錄', 'inputLog', OPT.onoff),
        { label: '錄製假人動作', act: () => { this.close(); s.startRecording(); } },
        { label: '重設位置', act: () => { s.battle.resetPositions('center'); this.close(); } },
      );
    } else {
      items.push({ label: '重新開始本局', act: () => { this.s.app.go(new BattleScene(this.s.app, this.s.setup)); } });
    }
    items.push({ label: '操作說明・招式表', act: () => { this.sub = new ControlsScene(this.s.app, null, this.s.setup.chars); } });
    items.push({ label: '重新選角', act: () => { audio.stopMusic(); this.s.app.go(new SelectScene(this.s.app, this.s.setup.mode, this.s.setup)); } });
    items.push({ label: '回主選單', act: () => { audio.stopMusic(); this.s.app.go(new MenuScene(this.s.app)); } });
    this.items = items;
  }
  close() { this.s.pause = null; audio.sfx('ok'); }
  // 觸控：點項目＝選取並執行；有選項值的列：點數值的 ◀ / ▶ 切換，點標籤先選取、再點一次往後切換
  tap(x, y) {
    if (this.sub) { this.sub = null; audio.sfx('back'); return; }
    const gap = this.items.length > 10 ? 40 : 56;
    const cx = VIEW_W / 2 - 60;
    const i = rowAt(x, y, cx, 130, gap, this.items.length, 330);
    if (i < 0) return;
    const it = this.items[i];
    const onValue = x > cx + 140;
    if (it.list && !onValue && this.sel !== i) { this.sel = i; audio.sfx('move'); return; }
    this.sel = i;
    this.update({ any: it.list ? (onValue && x < cx + 220 ? { left: true } : { right: true }) : { ok: true } });
  }
  update(ev) {
    if (this.sub) { this.sub.update({ any: { ...ev.any, back: false, ok: false } }); if (ev.any.back || ev.any.ok) this.sub = null; return; }
    const e = ev.any;
    const it = this.items[this.sel];
    if (e.up) { this.sel = (this.sel + this.items.length - 1) % this.items.length; audio.sfx('move'); }
    if (e.down) { this.sel = (this.sel + 1) % this.items.length; audio.sfx('move'); }
    if ((e.left || e.right) && it.list) {
      const T = this.s.training;
      const i = it.list.findIndex((x) => x[0] === T[it.key]);
      const n = it.list.length;
      T[it.key] = it.list[(i + (e.right ? 1 : n - 1)) % n][0];
      if (it.key === 'dummy' && T.dummy === 'playback' && !(T.recording && T.recording.length)) T.dummy = 'stand';
      audio.sfx('move');
    }
    if (e.ok) {
      if (it.act) it.act();
      else if (it.list) this.update({ any: { right: true } });
    }
    if (e.back) this.close();
  }
  draw(g) {
    if (this.sub) { this.sub.draw(g); return; }
    g.fillStyle = 'rgba(5,2,12,0.78)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    text(g, this.s.training ? 'TRAINING MENU' : 'PAUSE', VIEW_W / 2, 62, { size: 38, color: '#ffd84a' });
    const gap = this.items.length > 10 ? 40 : 56;
    menuList(g, this.items, this.sel, VIEW_W / 2 - 60, 130, gap);
    text(g, '↑↓ 選擇　←→ 切換　Esc 關閉', VIEW_W / 2, 700, { size: 16, color: '#9a92aa', font: FONT_TC, outline: null });
  }
}

// ---------- 結算 ----------
// 勝者頭像 + 勝利台詞（打字）；街機模式：贏了自動進下一戰（打完全員進結局），輸了進 CONTINUE
export class ResultScene {
  constructor(app, setup, result) {
    this.app = app; this.setup = setup; this.result = result; this.t = 0; this.sel = 0;
    const L = setup.ladder;
    this.items = L ? [] : ['再戰一場', '重新選角', '回主選單'];
    const [a, b] = setup.chars;
    this.quote = result === -1 ? '' : result === 0 ? winQuote(a, b) : winQuote(b, a);
    audio.stopMusic();
  }
  update(ev) {
    this.t++;
    const e = ev.any;
    const n = this.items.length;
    if (n && e.up) { this.sel = (this.sel + n - 1) % n; audio.sfx('move'); }
    if (n && e.down) { this.sel = (this.sel + 1) % n; audio.sfx('move'); }
    const L = this.setup.ladder;
    if (L && this.result === 0 && this.t > 300) e.ok = true;   // 街機模式贏了自動進下一戰
    if (e.ok && this.t > 30) {
      // 台詞還沒打完 → 先顯示完
      if (this.t * TYPE_SPEED < this.quote.length + 20) { this.t = Math.ceil((this.quote.length + 20) / TYPE_SPEED); return; }
      audio.sfx('ok');
      if (L) {
        const me = this.setup.chars[0];
        if (this.result === 0) {
          const next = this.setup.stageNo + 1;
          this.app.go(next < L.length ? new TravelScene(this.app, this.setup.stage, ladderSetup(me, L, next)) : endingScene(this.app, this.setup));
        } else this.app.go(new ContinueScene(this.app, this.setup));
        return;
      }
      if (this.sel === 0) this.app.go(new VSScene(this.app, this.setup));
      else if (this.sel === 1) this.app.go(new SelectScene(this.app, this.setup.mode, this.setup));
      else this.app.go(new MenuScene(this.app));
    }
  }
  // 勝者頭像在左、敗者（鼻青臉腫）在右，勝利台詞在下方
  draw(g) {
    const t = this.t, R = SC().result;
    backdrop(g, t, this.setup.stage, 0.72);
    const r = this.result;
    if (r === -1) {
      text(g, 'DRAW GAME', VIEW_W / 2, 200, { size: 80, color: '#ffd84a' });
    } else {
      const win = this.setup.chars[r], lose = this.setup.chars[1 - r];
      const slide = 1 - Math.pow(1 - Math.min(1, t / 16), 3);
      portrait(g, lose, R.loseX + (1 - slide) * 300, R.loseY, R.loseH, true, 0.92, true);
      portrait(g, win, R.winX - (1 - slide) * 300, R.winY, R.winH, false);
      const who = this.setup.mode === 'versus' ? `${r + 1}P WINS` : r === 0 ? 'YOU WIN' : 'YOU LOSE';
      text(g, who, VIEW_W / 2, 64, { size: 72, color: r === 0 || this.setup.mode === 'versus' ? '#ffd84a' : '#ff5a3c', lw: 12 });
      if (this.quote) {
        const lines = wrap(g, `「${this.quote}」`, 900, 26);
        const h = 36 + lines.length * 38;
        panel(g, VIEW_W / 2 - 500, R.quoteY - 30, 1000, h, CHARS[win].color);
        text(g, CHARS[win].name, VIEW_W / 2 - 470, R.quoteY - 30, { size: 22, color: CHARS[win].color, align: 'left' });
        typed(lines, t * TYPE_SPEED).forEach((l, k) => text(g, l, VIEW_W / 2 - 470, R.quoteY + 10 + k * 38, { size: 26, color: '#fff', align: 'left', font: FONT_TC, outline: '#000', lw: 4 }));
      }
    }
    menuList(g, this.items, this.sel, VIEW_W / 2, R.menuY, 60, t);
  }
  tap(x, y) {
    const i = this.items.length ? rowAt(x, y, VIEW_W / 2, SC().result.menuY, 60, this.items.length) : 0;
    if (i < 0) return;
    this.sel = i;
    this.update({ any: { ok: true } });
    this.t--;
  }
}

// ---------- 操作說明 ----------
const SP_ARROW = { 5: ' 單按', 6: '+→', 4: '+←', 2: '+↓', 3: '+↘', 1: '+↙' };

export class ControlsScene {
  constructor(app, back, chars) {
    this.app = app; this.back = back; this.t = 0;
    this.chars = (chars || readyChars()).filter((v, i, a) => a.indexOf(v) === i);
    this.page = 0;
  }
  get pages() { return Math.ceil(this.chars.length / 2); }
  update(ev) {
    this.t++;
    if (ev.any.left) { this.page = (this.page + this.pages - 1) % this.pages; audio.sfx('move'); }
    if (ev.any.right) { this.page = (this.page + 1) % this.pages; audio.sfx('move'); }
    if ((ev.any.back || ev.any.ok) && this.back) { audio.sfx('back'); this.app.go(this.back); }
  }
  tap(x) {
    const e = { left: x < VIEW_W * 0.25, right: x > VIEW_W * 0.75 };
    if (!e.left && !e.right) e.back = true;
    this.update({ any: e });
    this.t--;
  }
  draw(g) {
    g.fillStyle = '#0d0716';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    text(g, '操作說明', VIEW_W / 2, 40, { size: 32, color: '#ffd84a', font: FONT_TC });
    const rows = [
      ['', '單人／訓練', '2P 左側', '2P 右側', '手把'],
      ['移動', 'WASD 或 方向鍵', 'W A S D', '方向鍵', '十字鍵／左搖桿'],
      ['輕／中／重 拳', 'U  I  O', 'T  Y  U', 'I  O  P（或 Num 4 5 6）', 'X  Y  RB'],
      ['輕／中／重 腳', 'J  K  L', 'G  H  J', 'K  L  ;（或 Num 1 2 3）', 'A  B  RT'],
      ['投技', '輕拳+輕腳 或 前/後+重拳', '', '', ''],
      ['防禦', '按住「後」（蹲防：後下）', '', '', ''],
      ['暫停', 'Esc', 'Esc', 'Enter', 'START'],
    ];
    const cols = [110, 330, 560, 800, 1060];
    rows.forEach((r, i) => r.forEach((c, k) => text(g, c, cols[k], 100 + i * 34, { size: i === 0 ? 17 : 16, color: i === 0 ? '#ffb347' : k === 0 ? '#ffd84a' : '#fff', font: FONT_TC, outline: null, shadow: false })));
    let y = 360;
    for (const id of this.chars.slice(this.page * 2, this.page * 2 + 2)) {
      const c = CHARS[id];
      text(g, `${c.name}  ${c.nameZh}・${c.style}`, 120, y, { size: 22, color: c.color, align: 'left', font: FONT_TC });
      text(g, c.blurb, 120, y + 30, { size: 15, color: '#c9c2d8', align: 'left', font: FONT_TC, outline: null, shadow: false });
      // 觸控開啟簡易必殺時，指令後面加上 SP 對應方向
      const spDir = {};
      if (touchState.enabled && GAME.easySpecial) for (const [d, sp] of Object.entries(easyMap(c))) spDir[sp.move] = SP_ARROW[d];
      Object.entries(c.moveNames).forEach(([key, m], k) => {
        text(g, m.zh, 140 + (k % 2) * 560, y + 64 + Math.floor(k / 2) * 30, { size: 17, color: '#fff', align: 'left', font: FONT_TC, outline: null, shadow: false });
        text(g, spDir[key] ? `${m.cmd}　SP${spDir[key]}` : m.cmd, 400 + (k % 2) * 560, y + 64 + Math.floor(k / 2) * 30, { size: 16, color: '#ffe9a8', align: 'left', font: FONT_TC, outline: null, shadow: false });
      });
      y += 160;
    }
    if (this.pages > 1) text(g, `◀ ${this.page + 1} / ${this.pages} ▶　（←→ 換頁）`, VIEW_W / 2, 665, { size: 16, color: '#ffd84a', font: FONT_TC, outline: null });
    text(g, '指令以角色面向右方為準（面向左時左右相反）。普通技命中／被防時可取消成必殺技；必殺技可再取消成超必殺。', VIEW_W / 2, 695, { size: 14, color: '#9a92aa', font: FONT_TC, outline: null, shadow: false });
  }
}

// ---------- 設定 ----------
export class OptionsScene {
  constructor(app, back) {
    this.app = app; this.back = back; this.t = 0; this.sel = 0;
    const L = ['EASY', 'NORMAL', 'HARD', 'MASTER'];
    this.items = [
      { label: 'CPU 難度', get value() { return L[GAME.difficulty]; }, change: (d) => { GAME.difficulty = (GAME.difficulty + d + 4) % 4; } },
      { label: '勝利局數', get value() { return `${GAME.roundsToWin} 局`; }, change: (d) => { GAME.roundsToWin = ((GAME.roundsToWin - 1 + d + 3) % 3) + 1; } },
      { label: '回合時間', get value() { return GAME.time >= 100 ? '無限' : `${GAME.time} 秒`; }, change: (d) => { const o = [60, 99, 999]; GAME.time = o[(o.indexOf(GAME.time) + d + 3) % 3]; } },
      { label: '背景音樂', get value() { return GAME.bgm ? '開' : '關'; }, change: () => { GAME.bgm = !GAME.bgm; } },
      { label: '音效', get value() { return GAME.sfx ? '開' : '關'; }, change: () => { GAME.sfx = !GAME.sfx; } },
      { label: '回合語音', get value() { return GAME.voice ? '開' : '關'; }, change: () => { GAME.voice = !GAME.voice; } },
      { label: '音量', get value() { return `${Math.round(GAME.volume * 10)}`; }, change: (d) => { GAME.volume = Math.max(0, Math.min(1, Math.round((GAME.volume + d * 0.1) * 10) / 10)); audio.setVolume(GAME.volume); } },
      { label: '畫質', get value() { return { low: '效能', normal: '標準', high: '高' }[GAME.quality] || '標準'; }, change: (d) => { const o = ['low', 'normal', 'high']; GAME.quality = o[(o.indexOf(GAME.quality) + d + 3) % 3]; this.app.resize(); } },
      { label: '返回', act: () => this.app.go(this.back) },
    ];
    // 觸控裝置才出現：SP 鍵 + 方向直接出必殺技
    if (touchState.enabled) {
      this.items.splice(this.items.length - 1, 0, { label: '簡易必殺（SP 鍵）', get value() { return GAME.easySpecial ? '開' : '關'; }, change: () => { GAME.easySpecial = !GAME.easySpecial; } });
    }
  }
  // 觸控：點項目選取；點數值的 ◀ / ▶ 切換，已選中的列再點一次往後切換
  tap(x, y) {
    const cx = VIEW_W / 2 - 80;
    const i = rowAt(x, y, cx, 160, 60, this.items.length, 360);
    if (i < 0) return;
    const it = this.items[i];
    const onValue = x > cx + 140;
    if (it.change && !onValue && this.sel !== i) { this.sel = i; audio.sfx('move'); return; }
    this.sel = i;
    this.update({ any: it.act ? { ok: true } : onValue && x < cx + 220 ? { left: true } : { right: true } });
    this.t--;
  }
  update(ev) {
    this.t++;
    const e = ev.any;
    const it = this.items[this.sel];
    if (e.up) { this.sel = (this.sel + this.items.length - 1) % this.items.length; audio.sfx('move'); }
    if (e.down) { this.sel = (this.sel + 1) % this.items.length; audio.sfx('move'); }
    if (it.change && (e.left || e.right)) { it.change(e.right ? 1 : -1); audio.sfx('move'); this.app.saveSettings(); }
    if (e.ok) { if (it.act) it.act(); else if (it.change) { it.change(1); this.app.saveSettings(); } audio.sfx('ok'); }
    if (e.back) { audio.sfx('back'); this.app.go(this.back); }
  }
  draw(g) {
    backdrop(g, this.t, 'beach', 0.75);
    text(g, '設定', VIEW_W / 2, 70, { size: 40, color: '#ffd84a', font: FONT_TC });
    menuList(g, this.items, this.sel, VIEW_W / 2 - 80, 160, 60);
  }
}

export { dirToRaw, view };
