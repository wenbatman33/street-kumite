// 觸控操作層：虛擬搖桿 + 六鍵 + 系統鍵（暫停／重設／SP／全螢幕），選單時改成小搖桿 + 確定／返回
// - 只在觸控裝置（pointer: coarse，或第一次觸控之後）顯示；沒有觸控的桌機完全不出現
// - 自己做命中判定：多點觸控、手指在按鍵間滑動換鍵、兩鍵中間同按（LP+LK 投技）
// - 沒按到任何按鍵的點擊轉給遊戲畫面（場景 tap / click、DEV 拖曳 HUD）
// - DEV 開啟時可直接拖曳按鍵；數值在 LAYOUT.touch（手機 / 平板分開設定），跟著 DEV 匯出
import { LAYOUT, GAME, BUTTONS } from './config.js';
import { touchState, pushKeyPress } from './input.js';

const ROWS = [['LP', 'MP', 'HP'], ['LK', 'MK', 'HK']];
const RING = [6, 9, 8, 7, 4, 1, 2, 3];        // 0° = 右，逆時針每 45° 一格
const LOWER = new Set([6, 3, 2, 1, 4]);       // 下半圈（搓招常用，跳格時補斜角）
const SYS = ['sp', 'pause', 'reset', 'fs', 'ok', 'back'];
const SYS_BTN = { sp: 'SP', ok: 'LP', back: 'MP' };   // 系統鍵按住時等同哪顆遊戲鍵（選單：LP 確定、MP 返回）
const PROFILES = { mobile: '📱 手機', tablet: '💻 平板／觸控 PC' };

const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const dist = (o, x, y) => Math.hypot(x - o.x, y - o.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
const inGui = (t) => !!(t && t.closest && t.closest('.lil-gui, .dev-modal, #devBtn'));

function lockLandscape() {
  try {
    const o = screen.orientation;
    if (o && o.lock) o.lock('landscape').catch(() => { /* 不支援就算了 */ });
  } catch { /* 不支援就算了 */ }
}

export class TouchLayer {
  constructor(app, fwd) {
    this.app = app;
    this.fwd = fwd;                 // { down(e), move(e), up(e) }：沒按到按鍵的指標轉給遊戲畫面
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.active = this.coarse;      // 觸控裝置一開始就顯示；其他裝置等第一次觸控
    this.force = false;             // DEV：桌機強制顯示（調版面用）
    this.edit = true;               // DEV 開啟時：拖曳 = 移動按鍵位置
    this.profile = null;            // DEV 指定版型（null = 依螢幕自動）
    this.ptrs = new Map();          // pointerId → { t: 'stick' | 'btn' | 'sys' | 'drag' | 'fwd', ... }
    this.stick = null;              // 搖桿目前中心（浮動或被手指拖走時；null = 原位）
    this.knob = [0, 0];
    this.dir = 5;
    this.mode = 'menu';             // battle：對戰中；menu：其他畫面（含暫停選單）
    this.key = '';
    this.vis = {};
    this.fsTried = false;
    this.shown = false;
    this.cache = new Map();
    this.build();
    this.listen();
  }

  get profiles() { return PROFILES; }
  profileName() { return this.profile || (Math.min(innerWidth, innerHeight) < 600 ? 'mobile' : 'tablet'); }
  editing() { return !!(this.app.dev && this.app.dev.open && this.edit); }
  stickKey() { return this.mode === 'battle' ? 'stick' : 'menuStick'; }

  // ---------- DOM ----------
  build() {
    const root = document.createElement('div');
    root.id = 'touch';
    const arrows = RING.map((d, i) => {
      const a = (i * Math.PI) / 4;
      const pt = (rad, da) => `${(Math.cos(a + da) * rad).toFixed(1)},${(-Math.sin(a + da) * rad).toFixed(1)}`;
      return `<path data-d="${d}" d="M${pt(90, 0)} L${pt(70, 0.16)} L${pt(70, -0.16)} Z"/>`;
    }).join('');
    root.innerHTML = `
      <div class="t-stick"><svg viewBox="-100 -100 200 200"><circle class="base" r="97"/><circle class="ring" r="48"/>${arrows}</svg><div class="t-knob"></div></div>
      ${BUTTONS.map((b) => `<div class="t-btn ${b[1] === 'P' ? 'p' : 'k'}" data-k="${b}"><b>${b}</b></div>`).join('')}
      <div class="t-btn t-sys sp" data-k="sp"><b>SP</b></div>
      <div class="t-btn t-sys" data-k="pause"><b>Ⅱ</b></div>
      <div class="t-btn t-sys" data-k="reset"><b>⟲</b></div>
      <div class="t-btn t-sys" data-k="fs"><b>⛶</b></div>
      <div class="t-btn p zh" data-k="ok"><b>確定</b></div>
      <div class="t-btn t-sys zh" data-k="back"><b>返回</b></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.els = {};
    root.querySelectorAll('[data-k]').forEach((el) => { this.els[el.dataset.k] = el; });
    this.stickEl = root.querySelector('.t-stick');
    this.knobEl = root.querySelector('.t-knob');
    this.arrowEls = {};
    root.querySelectorAll('path[data-d]').forEach((p) => { this.arrowEls[p.dataset.d] = p; });

    // 直式手機提示：點一下順便試全螢幕 + 鎖橫向
    const rot = document.createElement('div');
    rot.id = 'rotate';
    rot.innerHTML = '<div class="phone"></div><p>請將手機橫放</p><small>橫向畫面才能完整遊玩・點一下嘗試全螢幕</small>';
    rot.addEventListener('pointerup', () => this.enterFs());
    document.body.appendChild(rot);
  }

  listen() {
    const r = this.root;
    r.addEventListener('pointerdown', (e) => this.down(e));
    r.addEventListener('pointermove', (e) => this.move(e));
    r.addEventListener('pointerup', (e) => this.up(e));
    r.addEventListener('pointercancel', (e) => this.up(e, true));
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    // 第一次觸控就啟用（觸控筆電等「主要指標是滑鼠」的裝置）
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.active = true; }, true);
    // 主要指標是滑鼠的裝置：改用鍵盤就把觸控層收起來
    window.addEventListener('keydown', () => { if (!this.coarse && !this.force) this.active = false; });
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    // iOS Safari：關掉雙指縮放、雙擊縮放、長按選字／放大鏡、橡皮筋捲動（DEV 面板除外）
    const block = (e) => { if (this.shown && !inGui(e.target)) e.preventDefault(); };
    document.addEventListener('touchstart', block, { passive: false });
    document.addEventListener('touchmove', block, { passive: false });
    document.addEventListener('gesturestart', block);
    document.addEventListener('dblclick', block);
  }

  // ---------- 版面計算 ----------
  layout() {
    const name = this.profileName();
    const P = LAYOUT.touch[name];
    const rc = this.root.getBoundingClientRect();
    const W = rc.width, H = rc.height;
    this.left = rc.left; this.top = rc.top;
    const key = `${name}|${W}x${H}|${JSON.stringify(P)}`;
    if (key === this.key) return;
    this.key = key;
    this.W = W; this.H = H; this.P = P;
    const G = (this.geo = {});
    for (const k of ['stick', 'menuStick']) G[k] = { x: P[k].x * W, y: P[k].y * H, r: P[k].r * H };
    const b = P.buttons;
    const D = b.size * H;
    const step = D + b.gap * H;
    G.btns = [];
    ROWS.forEach((row, ri) => row.forEach((k, ci) => {
      G.btns.push({ k, x: b.x * W + (ci - 1) * step, y: b.y * H + (ri - 0.5) * step + (1 - ci) * b.tilt * H, r: D / 2 });
    }));
    for (const k of SYS) G[k] = { x: P[k].x * W, y: P[k].y * H, r: (P[k].size * H) / 2 };
    for (const o of G.btns) this.place(this.els[o.k], o);
    for (const k of SYS) this.place(this.els[k], G[k]);
    this.cache.delete('stickPos');
  }

  place(el, o) {
    el.style.left = `${o.x}px`;
    el.style.top = `${o.y}px`;
    el.style.width = el.style.height = `${o.r * 2}px`;
    el.style.fontSize = `${o.r * (el.classList.contains('zh') ? 0.5 : 0.62)}px`;
  }

  // 只在值改變時寫 DOM
  set(id, val, fn) {
    if (this.cache.get(id) === val) return;
    this.cache.set(id, val);
    fn(val);
  }

  // ---------- 每幀：顯示狀態、模式、按下效果 ----------
  frame() {
    const app = this.app;
    const sc = app.scene;
    const show = !!sc && (this.active || this.force);
    if (show !== this.shown) {
      this.shown = show;
      document.body.classList.toggle('touch-on', show);
      touchState.enabled = show;
      if (!show) this.releaseAll();
    }
    if (!show) return;
    this.set('portrait', innerHeight > innerWidth, (v) => document.body.classList.toggle('portrait', v));
    this.layout();

    const inBattle = !!(sc.battle && sc.battle === app.battle);
    const paused = inBattle && !!sc.pause;
    const mode = inBattle && !paused ? 'battle' : 'menu';
    const edit = this.editing();
    this.mode = mode;
    const battle = mode === 'battle';
    this.vis = {
      btns: battle,
      sp: edit || (battle && GAME.easySpecial),
      pause: edit || inBattle,
      reset: edit || (battle && !!sc.training),
      fs: edit || (fsSupported() && !fsEl()),
      ok: edit || !battle,
      back: edit || !battle,
    };
    this.set('edit', edit, (v) => { this.root.classList.toggle('edit', v); if (v) this.releaseInputs(); });
    this.set('alpha', battle ? this.P.alpha : this.P.menuAlpha, (v) => this.root.style.setProperty('--a', v));
    this.set('vis-btns', this.vis.btns, (v) => { for (const b of BUTTONS) this.els[b].style.display = v ? '' : 'none'; });
    for (const k of SYS) this.set(`vis-${k}`, this.vis[k], (v) => { this.els[k].style.display = v ? '' : 'none'; });

    // 按下效果
    const held = touchState.held;
    for (const b of BUTTONS) this.set(`on-${b}`, !!held[b], (v) => this.els[b].classList.toggle('on', v));
    const sysOn = {};
    for (const p of this.ptrs.values()) if (p.t === 'sys') sysOn[p.k] = true;
    for (const k of SYS) this.set(`on-${k}`, !!sysOn[k], (v) => this.els[k].classList.toggle('on', v));

    // 搖桿（對戰／選單各自的位置與大小）
    const home = this.geo[this.stickKey()];
    const c = this.stick || home;
    this.set('stickPos', `${c.x},${c.y},${home.r}`, () => {
      const st = this.stickEl.style;
      st.left = `${c.x}px`; st.top = `${c.y}px`;
      st.width = st.height = `${home.r * 2}px`;
    });
    this.set('knob', `${this.knob[0]},${this.knob[1]}`, () => { this.knobEl.style.transform = `translate(${this.knob[0]}px,${this.knob[1]}px)`; });
    this.set('dir', this.dir, (d) => { for (const k in this.arrowEls) this.arrowEls[k].classList.toggle('on', Number(k) === d); });
  }

  // ---------- 命中判定 ----------
  hitBtns(x, y) {
    if (!this.vis.btns) return [];
    const list = this.geo.btns.map((b) => ({ k: b.k, d: dist(b, x, y), r: b.r })).sort((a, b) => a.d - b.d);
    const [a, b] = list;
    if (a.d > a.r * 1.25) return [];
    // 兩顆鍵中間（離兩顆距離差不多）= 同時按兩顆，方便 LP+LK 投技
    if (b && b.d - a.d < a.r * this.P.buttons.twin && b.d < b.r * 1.5) return [a.k, b.k];
    return [a.k];
  }

  hitSys(x, y) {
    for (const k of SYS) if (this.vis[k] && dist(this.geo[k], x, y) < this.geo[k].r * 1.2) return k;
    return null;
  }

  // 回傳搖桿中心；null = 沒按到搖桿
  hitStick(x, y) {
    const s = this.geo[this.stickKey()];
    const battle = this.mode === 'battle';
    if (dist(s, x, y) < s.r * (battle ? 1.5 : 1.3)) return { x: s.x, y: s.y, r: s.r, home: true };
    // 浮動搖桿：對戰中左側區域按下，搖桿就移到手指處
    if (battle && this.P.stick.float && x < this.W * 0.45) {
      return { x: clamp(x, s.r, this.W - s.r), y: clamp(y, s.r, this.H - s.r), r: s.r, home: false };
    }
    return null;
  }

  hitEdit(x, y) {
    for (const k of SYS) if (dist(this.geo[k], x, y) < this.geo[k].r * 1.2) return k;
    if (this.vis.btns && this.geo.btns.some((b) => dist(b, x, y) < b.r * 1.15)) return 'buttons';
    const sk = this.stickKey();
    if (dist(this.geo[sk], x, y) < this.geo[sk].r * 1.2) return sk;
    return null;
  }

  // ---------- 指標事件 ----------
  down(e) {
    e.preventDefault();
    try { this.root.setPointerCapture(e.pointerId); } catch { /* 舊瀏覽器 */ }
    this.layout();
    const x = e.clientX - this.left, y = e.clientY - this.top;
    const id = e.pointerId;
    if (this.editing()) {
      const k = this.hitEdit(x, y);
      if (k) { const o = this.P[k]; this.ptrs.set(id, { t: 'drag', k, x, y, ox: o.x, oy: o.y }); return; }
    } else {
      const k = this.hitSys(x, y);
      if (k) { this.sysDown(k, id); return; }
      const bs = this.hitBtns(x, y);
      if (bs.length) {
        this.ptrs.set(id, { t: 'btn', on: bs });
        for (const b of bs) touchState.latch[b] = true;
        this.syncHeld();
        return;
      }
      if (![...this.ptrs.values()].some((p) => p.t === 'stick')) {
        const c = this.hitStick(x, y);
        if (c) {
          this.stick = c.home ? null : { x: c.x, y: c.y };
          const p = { t: 'stick', cx: c.x, cy: c.y, r: c.r };
          this.ptrs.set(id, p);
          this.stickMove(p, x, y);
          return;
        }
      }
    }
    this.ptrs.set(id, { t: 'fwd' });
    this.fwd.down(e);
  }

  move(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const x = e.clientX - this.left, y = e.clientY - this.top;
    if (p.t === 'stick') this.stickMove(p, x, y);
    else if (p.t === 'btn') {
      // 手指滑到別顆鍵：放開舊的、按下新的
      const bs = this.hitBtns(x, y);
      for (const b of bs) if (!p.on.includes(b)) touchState.latch[b] = true;
      p.on = bs;
      this.syncHeld();
    } else if (p.t === 'drag') {
      const o = this.P[p.k];
      o.x = r3(clamp(p.ox + (x - p.x) / this.W, 0, 1));
      o.y = r3(clamp(p.oy + (y - p.y) / this.H, 0, 1));
    } else if (p.t === 'fwd') this.fwd.move(e);
  }

  up(e, cancel = false) {
    const p = this.ptrs.get(e.pointerId);
    // 全螢幕要在 pointerup（觸控的「使用者啟用」事件）裡要求，第一次放開手指時試一次
    if (e.pointerType === 'touch' && !cancel && !this.fsTried) { this.fsTried = true; this.enterFs(); }
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (p.t === 'stick') { this.stick = null; this.knob = [0, 0]; this.setDir(5); }
    else if (p.t === 'drag') { if (this.app.dev) this.app.dev.save(); }
    else if (p.t === 'fwd') this.fwd.up(e);
    else if (p.t === 'sys' && p.k === 'fs' && !cancel) this.toggleFs();
    this.syncHeld();
  }

  sysDown(k, id) {
    this.ptrs.set(id, { t: 'sys', k });
    if (k === 'pause') pushKeyPress('Escape');
    else if (k === 'reset') pushKeyPress('KeyR');
    else if (SYS_BTN[k]) touchState.latch[SYS_BTN[k]] = true;
    this.syncHeld();
  }

  stickMove(p, x, y) {
    const r = p.r;
    let dx = x - p.cx, dy = y - p.cy;
    let d = Math.hypot(dx, dy);
    // 手指拖太遠：搖桿中心跟著手指移動，轉 360 時不會卡在邊緣
    if (d > r * 1.6) {
      const k = (d - r * 1.6) / d;
      p.cx += dx * k; p.cy += dy * k;
      this.stick = { x: p.cx, y: p.cy };
      dx = x - p.cx; dy = y - p.cy; d = Math.hypot(dx, dy);
    }
    const m = Math.min(d, r * 0.62);
    this.knob = d > 0 ? [(dx / d) * m, (dy / d) * m] : [0, 0];
    this.setDir(this.dirOf(dx, dy, d, r));
  }

  // 向量 → 8 方向（數字鍵盤表示）。diag = 斜角判定角度（45 = 平均分配，越大斜角越好按）
  dirOf(dx, dy, d, r) {
    const S = this.P.stick;
    if (d < r * S.dead) return 5;
    const a = ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360;
    const half = (90 - S.diag) / 2;
    for (let i = 0; i < 4; i++) if (Math.abs(((a - i * 90 + 540) % 360) - 180) <= half) return RING[i * 2];
    return RING[(Math.floor(a / 90) * 2 + 1) % 8];
  }

  setDir(d) {
    if (d === this.dir) return;
    const q = touchState.dirs;
    // 下半圈跳過一格（例如 ↓ 直接到 →）時補上中間的斜角，快速搓招不漏格
    const i0 = RING.indexOf(this.dir), i1 = RING.indexOf(d);
    if (i0 >= 0 && i1 >= 0 && LOWER.has(this.dir) && LOWER.has(d)) {
      const step = (i1 - i0 + 8) % 8;
      const mid = step === 2 ? RING[(i0 + 1) % 8] : step === 6 ? RING[(i0 + 7) % 8] : 0;
      if (mid && LOWER.has(mid)) q.push(mid);
    }
    q.push(d);
    if (q.length > 6) q.splice(1, q.length - 6);
    this.dir = d;
  }

  syncHeld() {
    const held = {};
    for (const p of this.ptrs.values()) {
      if (p.t === 'btn') for (const b of p.on) held[b] = true;
      if (p.t === 'sys' && SYS_BTN[p.k]) held[SYS_BTN[p.k]] = true;
    }
    touchState.held = held;
  }

  // 放開所有遊戲輸入（轉給畫面的指標保留）
  releaseInputs() {
    for (const [id, p] of this.ptrs) if (p.t !== 'fwd') this.ptrs.delete(id);
    this.stick = null;
    this.knob = [0, 0];
    this.setDir(5);
    this.syncHeld();
  }

  releaseAll() {
    for (const p of this.ptrs.values()) if (p.t === 'fwd') this.fwd.up({});
    this.ptrs.clear();
    this.releaseInputs();
  }

  // ---------- 全螢幕 / 橫向 ----------
  enterFs() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || fsEl()) { lockLandscape(); return; }
    try {
      const pr = req.call(el, { navigationUI: 'hide' });
      if (pr && pr.then) pr.then(lockLandscape, () => { /* 被拒絕就算了 */ });
      else lockLandscape();
    } catch { /* iPhone Safari 等不支援 */ }
  }

  toggleFs() {
    if (!fsEl()) { this.enterFs(); return; }
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    try { if (exit) exit.call(document); } catch { /* 忽略 */ }
  }
}
