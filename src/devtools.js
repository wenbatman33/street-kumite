// DEV 微調工具：F2 / ` / 右下角齒輪開關
// - 版面：HUD 元件可直接用滑鼠拖曳，滑桿即時生效
// - 角色 sprite：每個動畫的位移／縮放
// - 招式：時間軸、判定框、傷害等 frame data；可逐 tick 預覽並拖曳判定框
// - 狀態觸發：KO、時間到、暈眩、超必殺暗場、勝利姿勢…
// - 💾 匯出：把所有調整輸出成 JSON（下載 + 複製），交給 Claude baked 回原始碼
import GUI from 'lil-gui';
import { LAYOUT, STAGES, PHYS, FX, VIEW_W } from './config.js';
import { CHARS, refreshMove } from './chars/index.js';
import { view } from './render.js';
import { ASSETS } from './assets.js';

const LS_KEY = 'streetkumite-dev-overrides';
const dirtyMoves = new Set();

export class DevTools {
  constructor(app) {
    this.app = app;
    this.open = false;
    this.paused = false;
    this.stepOnce = false;
    this.speed = 1;
    this.acc = 0;
    this.preview = { on: false, side: 0, char: 'tora', move: '5LP', tick: 1, hit: 0 };
    this.drag = null;
    this.gui = null;
    this.btn = document.getElementById('devBtn');
    this.btn.addEventListener('click', () => this.toggle());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F2' || e.code === 'Backquote') { e.preventDefault(); this.toggle(); }
      if (!this.open) return;
      if (e.code === 'Period') { this.paused = true; this.stepOnce = true; }
      if (e.code === 'KeyP' && e.shiftKey) this.paused = !this.paused;
    });
  }

  speedSteps() {
    if (this.preview.on) return 0;
    this.acc += this.speed;
    const n = Math.floor(this.acc);
    this.acc -= n;
    return n;
  }

  toggle() {
    this.open = !this.open;
    if (this.open && !this.gui) this.build();
    if (this.gui) this.gui.show(this.open);
    view.devHud = this.open;
    if (!this.open) { this.preview.on = false; this.paused = false; }
    this.btn.classList.toggle('on', this.open);
  }

  battle() { return this.app.battle && this.app.scene && this.app.scene.battle === this.app.battle ? this.app.battle : null; }

  // ---------- 建立面板 ----------
  build() {
    const gui = new GUI({ title: '🛠 DEV 微調（F2）', width: 330 });
    this.gui = gui;
    gui.domElement.style.zIndex = 50;

    // 匯出／匯入
    const io = {
      export: () => this.exportJSON(),
      import: () => this.importJSON(),
      clear: () => { localStorage.removeItem(LS_KEY); location.reload(); },
    };
    gui.add(io, 'export').name('💾 匯出 / 鎖定（JSON）');
    gui.add(io, 'import').name('📥 匯入 JSON');
    gui.add(io, 'clear').name('↺ 清除本機覆寫並重新載入');

    // 狀態
    const st = gui.addFolder('▶ 遊戲狀態 / 觸發');
    st.add(this, 'paused').name('暫停（. 逐格）').listen();
    st.add(this, 'speed', { '0.25x': 0.25, '0.5x': 0.5, '1x': 1, '2x': 2 }).name('速度');
    st.add(view, 'showBoxes').name('顯示判定框');
    const auto = { get v() { const b = this.self.battle(); return b ? b.autoBoxes : true; }, set v(x) { const b = this.self.battle(); if (b) b.autoBoxes = x; }, self: this };
    st.add(auto, 'v').name('判定框貼齊 sprite');
    const T = {
      ko2: () => this.withBattle((b) => { const f = b.fighters[1]; f.hp = 1; b.fighters[0].meter = 100; f.receive(b.fighters[0], { dmg: 999, hitstop: 'H', kd: true }, { x: b.fighters[0].x }); }),
      timeOver: () => this.withBattle((b) => { b.timer = 1; b.timerTick = 999; }),
      dizzy2: () => this.withBattle((b) => { const f = b.fighters[1]; f.setState('dizzy', { dizzyT: 180 }); }),
      super1: () => this.withBattle((b) => { const f = b.fighters[0]; f.meter = 100; f.startMove('super'); }),
      win1: () => this.withBattle((b) => { b.fighters[0].setState('win'); }),
      meter: () => this.withBattle((b) => { for (const f of b.fighters) f.meter = 100; }),
      low: () => this.withBattle((b) => { for (const f of b.fighters) { f.hp = Math.round(f.def.hp * 0.15); f.hpTrail = f.hp; } }),
      msg: () => this.withBattle((b) => b.say('K.O.', 120, '#ff3b2f', 'PERFECT')),
      combo: () => this.withBattle((b) => { b.comboShow[0] = { hits: 7, dmg: 345, t: 0 }; }),
      reset: () => this.withBattle((b) => b.resetPositions('center')),
    };
    st.add(T, 'ko2').name('P2 K.O.');
    st.add(T, 'timeOver').name('時間到');
    st.add(T, 'dizzy2').name('P2 暈眩');
    st.add(T, 'super1').name('P1 超必殺');
    st.add(T, 'win1').name('P1 勝利姿勢');
    st.add(T, 'meter').name('量表全滿');
    st.add(T, 'low').name('血量 15%');
    st.add(T, 'msg').name('顯示 K.O. 訊息');
    st.add(T, 'combo').name('顯示連段數');
    st.add(T, 'reset').name('重設位置');

    // 版面
    const lay = gui.addFolder('📐 版面 HUD（可直接拖曳）');
    lay.close();
    for (const [k, o] of Object.entries(LAYOUT.hud)) {
      const f = lay.addFolder(k);
      f.close();
      for (const p of Object.keys(o)) f.add(o, p, ...rangeFor(p)).listen().onChange(() => this.save());
    }
    const col = lay.addFolder('顏色');
    col.close();
    for (const k of Object.keys(LAYOUT.colors)) col.addColor(LAYOUT.colors, k).onChange(() => this.save());

    // 舞台
    const stg = gui.addFolder('🏙 舞台 / 角色大小');
    stg.close();
    stg.add(LAYOUT, 'groundY', 400, 720, 1).name('地面 Y').onChange(() => this.save());
    stg.add(LAYOUT, 'charH', 180, 420, 1).name('角色身高').onChange(() => this.save());
    stg.add(LAYOUT, 'stageW', 1300, 3000, 10).name('舞台寬').onChange(() => this.save());
    stg.add(LAYOUT, 'edge', 0, 120, 1).name('畫面邊距').onChange(() => this.save());
    stg.add(LAYOUT, 'startGap', 150, 800, 1).name('開場距離').onChange(() => this.save());
    stg.add(LAYOUT, 'shadowAlpha', 0, 1, 0.01).name('影子').onChange(() => this.save());
    for (const [id, s] of Object.entries(STAGES)) {
      const f = stg.addFolder(`背景 ${s.nameZh}`);
      f.close();
      f.add(s, 'scale', 0.5, 2, 0.01).onChange(() => this.save());
      f.add(s, 'y', 0.3, 1.2, 0.005).name('地面位於圖高').onChange(() => this.save());
      f.add(s, 'parallax', 0, 1, 0.01).onChange(() => this.save());
      void id;
    }

    // 物理與打擊感
    const ph = gui.addFolder('⚙ 物理 / 打擊感');
    ph.close();
    for (const k of Object.keys(PHYS)) ph.add(PHYS, k, 0, k === 'gravity' || k === 'pushDecay' ? 2 : 200, k === 'gravity' || k === 'pushDecay' || k === 'stunDecay' ? 0.01 : 1).onChange(() => this.save());
    for (const k of Object.keys(FX.hitstop)) ph.add(FX.hitstop, k, 0, 40, 1).name(`頓幀 ${k}`).onChange(() => this.save());
    for (const k of Object.keys(FX.shake)) ph.add(FX.shake, k, 0, 30, 1).name(`震動 ${k}`).onChange(() => this.save());
    ph.add(FX, 'sparkScale', 0.3, 3, 0.05).name('火花大小').onChange(() => this.save());
    ph.add(FX, 'superFlash', 0, 120, 1).name('超必殺暗場').onChange(() => this.save());
    ph.add(FX, 'koSlow', 1, 8, 1).name('KO 慢動作').onChange(() => this.save());

    // 角色
    this.charFolder = gui.addFolder('🥋 角色 / sprite');
    this.charFolder.close();
    this.buildChar();

    // 招式
    this.moveFolder = gui.addFolder('🎯 招式 frame data / 判定框');
    this.moveFolder.close();
    this.buildMove();
    this.gui.show(this.open);
  }

  withBattle(fn) {
    const b = this.battle();
    if (!b) { alert('請先進入對戰或訓練模式'); return; }
    fn(b);
  }

  buildChar() {
    const f = this.charFolder;
    [...f.children].forEach((c) => c.destroy());
    const sel = { char: this.selChar || 'tora', anim: this.selAnim || 'idle' };
    f.add(sel, 'char', Object.keys(CHARS)).name('角色').onChange((v) => { this.selChar = v; this.buildChar(); });
    const c = CHARS[sel.char];
    for (const k of ['hp', 'walkF', 'walkB', 'jumpVy', 'jumpVx']) f.add(c, k, 0, k === 'hp' ? 2000 : 30, k === 'hp' ? 10 : 0.1).onChange(() => this.save());
    const atlas = ASSETS.chars[sel.char];
    const anims = atlas ? Object.keys(atlas.anims) : ['idle'];
    f.add(sel, 'anim', anims).name('動畫').onChange((v) => { this.selAnim = v; this.buildChar(); });
    const adj = c.spriteAdj[sel.anim] || (c.spriteAdj[sel.anim] = { dx: 0, dy: 0, s: 1 });
    f.add(adj, 'dx', -150, 150, 1).name('位移 X').onChange(() => this.save());
    f.add(adj, 'dy', -150, 150, 1).name('位移 Y').onChange(() => this.save());
    f.add(adj, 's', 0.5, 1.6, 0.01).name('縮放').onChange(() => this.save());
    f.open();
  }

  buildMove() {
    const f = this.moveFolder;
    [...f.children].forEach((c) => c.destroy());
    const P = this.preview;
    const c = CHARS[P.char];
    if (!c.moves[P.move]) P.move = '5LP';
    const m = c.moves[P.move];
    f.add(P, 'char', Object.keys(CHARS)).name('角色').onChange(() => { P.move = '5LP'; this.buildMove(); });
    f.add(P, 'move', Object.keys(c.moves)).name('招式').onChange(() => { P.tick = 1; P.hit = 0; this.buildMove(); });
    f.add(P, 'on').name('▶ 逐 tick 預覽（P1）').onChange((v) => { if (v) { this.paused = true; view.showBoxes = true; } }).listen();
    f.add(P, 'tick', 1, Math.max(2, m.total + 20), 1).name('預覽 tick').listen();
    const seqObj = { seq: m.seq.map((e) => (e[2] ? `${e[0]}:${e[1]}:${e[2]}` : `${e[0]}:${e[1]}`)).join(', ') };
    f.add(seqObj, 'seq').name('時間軸 格:tick').onFinishChange((v) => {
      const seq = v.split(',').map((s) => s.trim().split(':')).filter((x) => x.length >= 2).map(([a, b, an]) => (an ? [Number(a), Number(b), an] : [Number(a), Number(b)]));
      if (seq.length) { m.seq = seq; refreshMove(m); this.dirty(P.char, P.move); this.buildMove(); }
    });
    const info = { total: `總長 ${m.total}F／發生 ${m.firstActive}F／最後判定 ${m.lastActive}F` };
    f.add(info, 'total').name('資訊').disable();
    if (m.hits && m.hits.length) {
      f.add(P, 'hit', 0, m.hits.length - 1, 1).name('第幾段判定').onChange(() => this.buildMove());
      const h = m.hits[Math.min(P.hit, m.hits.length - 1)];
      const hf = f.addFolder(`判定 #${P.hit}`);
      const tt = { t0: h.t[0], t1: h.t[1] };
      hf.add(tt, 't0', 1, m.total, 1).name('開始 tick').onChange((v) => { h.t[0] = v; refreshMove(m); this.dirty(P.char, P.move); });
      hf.add(tt, 't1', 1, m.total + 30, 1).name('結束 tick').onChange((v) => { h.t[1] = v; refreshMove(m); this.dirty(P.char, P.move); });
      if (h.autoBox === undefined) h.autoBox = true;
      hf.add(h, 'autoBox').name('貼齊 sprite（關=用下方數值）').onChange(() => this.dirty(P.char, P.move)).listen();
      const bx = { x: h.box[0], y: h.box[1], w: h.box[2], h: h.box[3] };
      for (const k of ['x', 'y', 'w', 'h']) {
        hf.add(bx, k, k === 'y' ? -100 : k === 'x' ? -150 : 10, k === 'y' ? 400 : 400, 1).name(`box ${k}`).onChange((v) => {
          h.box[{ x: 0, y: 1, w: 2, h: 3 }[k]] = v; h.autoBox = false; this.dirty(P.char, P.move);
        }).listen();
      }
      this.boxCtl = bx;
      for (const k of ['dmg', 'chip', 'stun', 'hs', 'bs', 'push']) {
        if (h[k] === undefined) h[k] = 0;
        hf.add(h, k, 0, k === 'dmg' || k === 'stun' ? 400 : 60, k === 'push' ? 0.1 : 1).onChange(() => this.dirty(P.char, P.move));
      }
      hf.add(h, 'guard', ['mid', 'low', 'high']).onChange(() => this.dirty(P.char, P.move));
      hf.add(h, 'hitstop', ['L', 'M', 'H', 'S', 'SU']).onChange(() => this.dirty(P.char, P.move));
      if (h.kd === undefined) h.kd = false;
      hf.add(h, 'kd').name('擊倒').onChange(() => this.dirty(P.char, P.move));
    }
    if (m.proj) {
      const pf = f.addFolder('飛行道具');
      for (const k of ['t', 'x', 'y', 'vx', 'scale']) pf.add(m.proj, k, k === 'scale' ? 0.2 : 0, k === 'scale' ? 3 : 300, k === 'vx' || k === 'scale' ? 0.1 : 1).onChange(() => this.dirty(P.char, P.move));
    }
    if (m.jump) {
      const jf = f.addFolder('跳躍');
      for (const k of ['t', 'vy', 'vx']) jf.add(m.jump, k, -10, 40, 0.1).onChange(() => this.dirty(P.char, P.move));
    }
    f.open();
  }

  dirty(cid, mv) { dirtyMoves.add(`${cid}/${mv}`); this.save(); }

  // 預覽：把 P1 固定在指定招式的指定 tick
  applyPreview() {
    const b = this.battle();
    if (!b || !this.preview.on) return;
    const P = this.preview;
    const f = b.fighters[P.side];
    if (f.def.id !== P.char) return;
    const m = f.def.moves[P.move];
    f.state = 'move';
    f.move = m;
    f.moveName = P.move;
    f.seq = m.seq;
    f.mt = P.tick;
    f.hitDone = new Set();
    f.lockFailed = false;
    f.y = m.air ? 120 : 0;
    if (this.boxCtl && m.hits && m.hits[P.hit]) {
      const h = m.hits[P.hit];
      Object.assign(this.boxCtl, { x: h.box[0], y: h.box[1], w: h.box[2], h: h.box[3] });
    }
  }

  // ---------- 滑鼠 ----------
  pointerDown(x, y) {
    if (!this.open) return false;
    const b = this.battle();
    // 預覽中：拖判定框（右緣 = 改寬度，其餘 = 移動）
    if (b && this.preview.on) {
      const f = b.fighters[this.preview.side];
      const m = f.move;
      const h = m && m.hits && m.hits[this.preview.hit];
      if (h) {
        const r = f.hitRect(h);
        const sx0 = r.x0 - b.camX, sx1 = r.x1 - b.camX, sy0 = LAYOUT.groundY - r.y1, sy1 = LAYOUT.groundY - r.y0;
        if (x > sx0 - 8 && x < sx1 + 8 && y > sy0 - 8 && y < sy1 + 8) {
          // 先把目前（可能是自動）判定轉成手動數值
          const bx = f.facing > 0 ? r.x0 - f.x : f.x - r.x1;
          h.box = [Math.round(bx), Math.round(r.y0 - f.y), Math.round(r.x1 - r.x0), Math.round(r.y1 - r.y0)];
          h.autoBox = false;
          const edge = f.facing > 0 ? Math.abs(x - sx1) < 12 : Math.abs(x - sx0) < 12;
          this.drag = { type: edge ? 'boxW' : 'box', h, f, x, y, box: h.box.slice() };
          return true;
        }
      }
    }
    for (const r of view.hudRects.slice().reverse()) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && LAYOUT.hud[r.key]) {
        const o = LAYOUT.hud[r.key];
        this.drag = { type: 'hud', o, x, y, ox: o.x, oy: o.y };
        return true;
      }
    }
    // 拖角色
    if (b) {
      for (const f of b.fighters) {
        const sx = f.x - b.camX;
        if (Math.abs(x - sx) < 50 && y > LAYOUT.groundY - f.y - 300 && y < LAYOUT.groundY - f.y) {
          this.drag = { type: 'fighter', f, x, ox: f.x };
          return true;
        }
      }
    }
    return false;
  }

  pointerMove(x, y) {
    const d = this.drag;
    if (!d) return;
    if (d.type === 'hud') {
      if (d.o.x !== undefined) d.o.x = Math.round(d.ox + (x - d.x));
      if (d.o.y !== undefined) d.o.y = Math.round(d.oy + (y - d.y));
    } else if (d.type === 'fighter') {
      d.f.x = d.ox + (x - d.x);
    } else if (d.type === 'box') {
      d.h.box[0] = Math.round(d.box[0] + (x - d.x) * d.f.facing);
      d.h.box[1] = Math.round(d.box[1] - (y - d.y));
    } else if (d.type === 'boxW') {
      d.h.box[2] = Math.max(10, Math.round(d.box[2] + (x - d.x) * d.f.facing));
    }
  }

  pointerUp() {
    if (!this.drag) return;
    if (this.drag.type === 'box' || this.drag.type === 'boxW') this.dirty(this.preview.char, this.preview.move);
    else this.save();
    this.drag = null;
  }

  // ---------- 匯出 / 儲存 ----------
  snapshot() {
    const chars = {};
    for (const [id, c] of Object.entries(CHARS)) {
      const moves = {};
      for (const key of dirtyMoves) {
        const [cid, mv] = key.split('/');
        if (cid !== id) continue;
        const m = c.moves[mv];
        moves[mv] = { seq: m.seq, hits: m.hits, proj: m.proj, jump: m.jump };
      }
      const adj = {};
      for (const [a, v] of Object.entries(c.spriteAdj)) if (v.dx || v.dy || (v.s && v.s !== 1)) adj[a] = v;
      chars[id] = { hp: c.hp, walkF: c.walkF, walkB: c.walkB, jumpVy: c.jumpVy, jumpVx: c.jumpVx, spriteAdj: adj, moves };
    }
    const stages = {};
    for (const [id, s] of Object.entries(STAGES)) stages[id] = { scale: s.scale, y: s.y, parallax: s.parallax };
    return { version: 1, LAYOUT, STAGES: stages, PHYS, FX, chars };
  }

  save() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.snapshot())); } catch { /* 無痕模式 */ }
    }, 300);
  }

  exportJSON() {
    const json = JSON.stringify(this.snapshot(), null, 2);
    try { navigator.clipboard.writeText(json); } catch { /* 無剪貼簿權限 */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'streetkumite-tuning.json';
    a.click();
    showModal('已匯出（並複製到剪貼簿）。把這份 JSON 貼給 Claude，說「我調好了，鎖定」即可寫回原始碼。', json);
  }

  importJSON() {
    showModal('貼上 JSON 後按「套用」', '', (txt) => {
      try { applyOverrides(JSON.parse(txt)); this.save(); location.reload(); } catch (e) { alert('JSON 格式錯誤：' + e.message); }
    });
  }
}

function rangeFor(p) {
  if (p === 'size' || p === 'r') return [4, 200, 1];
  if (p === 'skew') return [-60, 60, 1];
  if (p === 'rows') return [1, 40, 1];
  if (p === 'gap') return [0, 80, 1];
  if (p === 'w' || p === 'x') return [0, VIEW_W, 1];
  return [0, 720, 1];
}

function deepAssign(dst, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') deepAssign(dst[k], v);
    else dst[k] = v;
  }
}

// 啟動時套用本機覆寫（DEV 調整過但尚未 baked 的數值）
export function applyOverrides(o) {
  if (!o) {
    try { o = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { o = null; }
  }
  if (!o) return false;
  if (o.LAYOUT) deepAssign(LAYOUT, o.LAYOUT);
  if (o.PHYS) deepAssign(PHYS, o.PHYS);
  if (o.FX) deepAssign(FX, o.FX);
  if (o.STAGES) for (const [id, s] of Object.entries(o.STAGES)) if (STAGES[id]) Object.assign(STAGES[id], s);
  if (o.chars) {
    for (const [id, c] of Object.entries(o.chars)) {
      const d = CHARS[id];
      if (!d) continue;
      for (const k of ['hp', 'walkF', 'walkB', 'jumpVy', 'jumpVx']) if (c[k] !== undefined) d[k] = c[k];
      if (c.spriteAdj) Object.assign(d.spriteAdj, c.spriteAdj);
      for (const [mv, m] of Object.entries(c.moves || {})) {
        if (!d.moves[mv]) continue;
        for (const k of ['seq', 'hits', 'proj', 'jump']) if (m[k]) d.moves[mv][k] = m[k];
        refreshMove(d.moves[mv]);
        dirtyMoves.add(`${id}/${mv}`);
      }
    }
  }
  return true;
}

function showModal(msg, content, onApply) {
  const wrap = document.createElement('div');
  wrap.className = 'dev-modal';
  wrap.innerHTML = `<div class="box"><p></p><textarea spellcheck="false"></textarea><div class="row"><button class="ok">${onApply ? '套用' : '關閉'}</button>${onApply ? '<button class="cancel">取消</button>' : ''}</div></div>`;
  wrap.querySelector('p').textContent = msg;
  const ta = wrap.querySelector('textarea');
  ta.value = content;
  wrap.querySelector('.ok').onclick = () => { if (onApply) onApply(ta.value); wrap.remove(); };
  const c = wrap.querySelector('.cancel');
  if (c) c.onclick = () => wrap.remove();
  document.body.appendChild(wrap);
  ta.focus();
  ta.select();
}
