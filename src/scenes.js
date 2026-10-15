// 場景：標題 → 模式選單 → 選角 → VS → 對戰 → 結算；另有暫停／操作說明／設定
import { VIEW_W, VIEW_H, GAME, KEYMAPS, STAGES } from './config.js';
import { CHARS, CHAR_IDS } from './chars/index.js';
import { ASSETS, altAtlasImages } from './assets.js';
import { MenuInput, readPad } from './input.js';
import { Battle } from './battle.js';
import { HumanController, AIController, DummyController, NullController, dirToRaw } from './controllers.js';
import { drawBattle, drawStage, text, view } from './render.js';
import { audio } from './audio.js';

const FONT_TC = '"Noto Sans TC", "PingFang TC", sans-serif';
const STAGE_IDS = Object.keys(STAGES);

// ---------- 選單輸入 ----------
const KEYS = {
  any: { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], ok: ['Enter', 'Space', 'KeyU', 'KeyJ', 'KeyT', 'KeyG', 'NumpadEnter'], back: ['Escape', 'Backspace', 'KeyI', 'KeyY'] },
  p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], ok: ['KeyT', 'KeyG', 'Space', 'KeyU', 'KeyJ'], back: ['KeyY', 'KeyH', 'Escape'] },
  p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], ok: ['KeyI', 'KeyK', 'Enter', 'Numpad4', 'Numpad1', 'NumpadEnter'], back: ['KeyO', 'KeyL', 'Numpad5', 'Backspace'] },
};
const padMenus = [new MenuInput(), new MenuInput()];

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
  return out;
}

// ---------- 共用繪製 ----------
function backdrop(g, t, stage = 'market', dim = 0.62) {
  drawStage(g, stage, 300 + Math.sin(t * 0.003) * 200, t);
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

function portrait(g, id, x, y, h, flip = false, alpha = 1) {
  const img = ASSETS.portraits[id];
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
  if (flip) { g.translate(x, 0); g.scale(-1, 1); g.drawImage(img, -w / 2, y, w, h); }
  else g.drawImage(img, x - w / 2, y, w, h);
  g.restore();
}

function menuList(g, items, sel, x, y, gap = 58, t = 0) {
  items.forEach((it, i) => {
    const on = i === sel;
    const label = typeof it === 'string' ? it : it.label;
    if (on) {
      g.fillStyle = 'rgba(255,140,30,0.25)';
      g.fillRect(x - 260, y + i * gap - 24, 520, 48);
      g.fillStyle = '#ff8a1e';
      g.fillRect(x - 260, y + i * gap - 24, 6, 48);
    }
    const hasVal = it.value !== undefined;
    text(g, label, hasVal ? x - 40 : x, y + i * gap, { size: on ? 32 : 28, color: on ? '#ffe9a8' : '#c9c2d8', font: FONT_TC, lw: 6 });
    if (hasVal) text(g, `◀ ${it.value} ▶`, x + 220, y + i * gap, { size: 22, color: on ? '#fff' : '#9a92aa', font: FONT_TC, align: 'center' });
  });
}

// ---------- 標題 ----------
export class TitleScene {
  constructor(app) { this.app = app; this.t = 0; }
  update(ev) {
    this.t++;
    if (ev.any.ok || ev.any.back) { audio.sfx('ok'); this.app.go(new MenuScene(this.app)); }
  }
  draw(g) {
    const t = this.t;
    backdrop(g, t, 'market', 0.5);
    portrait(g, 'tora', 270, 150, 600, false, 0.95);
    portrait(g, 'vera', VIEW_W - 270, 150, 600, true, 0.95);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    logo(g, VIEW_W / 2, 250, 1);
    if (t % 60 < 40) text(g, 'PRESS START', VIEW_W / 2, 520, { size: 34, color: '#fff' });
    text(g, 'Enter / Space / 手把 START', VIEW_W / 2, 568, { size: 18, color: '#c9c2d8', font: FONT_TC });
    text(g, '原創同人格鬥遊戲・角色與美術皆為原創，與任何商業格鬥遊戲無關', VIEW_W / 2, 690, { size: 15, color: '#8a829a', font: FONT_TC, outline: null });
  }
}

// ---------- 模式選單 ----------
export class MenuScene {
  constructor(app) {
    this.app = app; this.t = 0; this.sel = 0;
    this.items = [
      { label: '1P 對戰 CPU', go: () => new SelectScene(app, 'arcade') },
      { label: '2P 本機雙人對戰', go: () => new SelectScene(app, 'versus') },
      { label: '訓練模式', go: () => new SelectScene(app, 'training') },
      { label: '操作說明・招式表', go: () => new ControlsScene(app, this) },
      { label: '設定', go: () => new OptionsScene(app, this) },
    ];
  }
  update(ev) {
    this.t++;
    const e = ev.any;
    if (e.up) { this.sel = (this.sel + this.items.length - 1) % this.items.length; audio.sfx('move'); }
    if (e.down) { this.sel = (this.sel + 1) % this.items.length; audio.sfx('move'); }
    if (e.ok) { audio.sfx('ok'); this.app.go(this.items[this.sel].go()); }
    if (e.back) { audio.sfx('back'); this.app.go(new TitleScene(this.app)); }
  }
  click(x, y) {
    this.items.forEach((it, i) => { if (Math.abs(y - (330 + i * 64)) < 26 && Math.abs(x - VIEW_W / 2) < 260) { this.sel = i; this.update({ any: { ok: true } }); } });
  }
  draw(g) {
    backdrop(g, this.t, 'beach', 0.66);
    logo(g, VIEW_W / 2, 150, 0.62);
    menuList(g, this.items, this.sel, VIEW_W / 2, 330, 64);
    text(g, '↑↓ 選擇　Enter / U 確定　Esc 返回', VIEW_W / 2, 680, { size: 16, color: '#9a92aa', font: FONT_TC, outline: null });
  }
}

// ---------- 選角 ----------
export class SelectScene {
  constructor(app, mode, prev) {
    this.app = app; this.mode = mode; this.t = 0;
    this.cur = [prev ? CHAR_IDS.indexOf(prev.chars[0]) : 0, prev ? CHAR_IDS.indexOf(prev.chars[1]) : 1];
    this.done = [false, false];
    this.stage = prev ? STAGE_IDS.indexOf(prev.stage) : 0;
    this.phase = 'chars';   // chars → stage
    this.active = 0;        // 1P 模式：先選自己再選對手
  }
  update(ev) {
    this.t++;
    const n = CHAR_IDS.length;
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
        if (e.left) { this.cur[i] = (this.cur[i] + n - 1) % n; audio.sfx('move'); }
        if (e.right) { this.cur[i] = (this.cur[i] + 1) % n; audio.sfx('move'); }
        if (e.ok) { this.done[i] = true; audio.sfx('ok'); if (!versus && i === 0) this.active = 1; }
        if (e.back) {
          audio.sfx('back');
          if (!versus && i === 1) { this.active = 0; this.done[0] = false; }
          else { this.app.go(new MenuScene(this.app)); return; }
        }
      }
      if (this.done[0] && this.done[1]) this.phase = 'stage';
      return;
    }
    const e = ev.any;
    if (e.left) { this.stage = (this.stage + STAGE_IDS.length - 1) % STAGE_IDS.length; audio.sfx('move'); }
    if (e.right) { this.stage = (this.stage + 1) % STAGE_IDS.length; audio.sfx('move'); }
    if (e.back) { this.phase = 'chars'; this.done = [false, false]; this.active = 0; audio.sfx('back'); }
    if (e.ok) {
      audio.sfx('ok');
      const setup = { mode: this.mode, chars: [CHAR_IDS[this.cur[0]], CHAR_IDS[this.cur[1]]], stage: STAGE_IDS[this.stage] };
      this.app.go(this.mode === 'training' ? new BattleScene(this.app, setup) : new VSScene(this.app, setup));
    }
  }
  click(x, y) {
    if (this.phase !== 'chars') { this.update({ any: { ok: true }, p1: {}, p2: {} }); return; }
    const i = this.mode === 'versus' ? (x < VIEW_W / 2 ? 0 : 1) : this.active;
    const n = CHAR_IDS.length;
    const slot = Math.floor((x - (VIEW_W / 2 - n * 70)) / 140);
    if (y > 560 && slot >= 0 && slot < n) { this.cur[i] = slot; this.done[i] = true; if (this.mode !== 'versus' && i === 0) this.active = 1; if (this.done[0] && this.done[1]) this.phase = 'stage'; }
  }
  draw(g) {
    const t = this.t;
    backdrop(g, t, STAGE_IDS[this.stage], 0.7);
    const title = { arcade: '1P 對戰 CPU', versus: '2P 對戰', training: '訓練模式' }[this.mode];
    text(g, 'SELECT YOUR FIGHTER', VIEW_W / 2, 48, { size: 34, color: '#ffd84a' });
    text(g, title, VIEW_W / 2, 88, { size: 20, color: '#fff', font: FONT_TC });
    for (let i = 0; i < 2; i++) {
      const id = CHAR_IDS[this.cur[i]];
      const c = CHARS[id];
      const x = i === 0 ? 290 : VIEW_W - 290;
      const bob = this.done[i] ? 0 : Math.sin(t * 0.08) * 4;
      portrait(g, id, x, 130 + bob, 420, i === 1);
      const tag = i === 0 ? '1P' : this.mode === 'versus' ? '2P' : 'CPU';
      text(g, tag, x, 128, { size: 26, color: i === 0 ? '#ff5a3c' : '#3cb4ff' });
      text(g, c.name, x, 470, { size: 46, color: '#fff' });
      text(g, `${c.nameZh}・${c.style}`, x, 512, { size: 20, color: c.color, font: FONT_TC });
      if (this.done[i]) text(g, 'READY!', x, 300, { size: 44, color: '#7dff6b', lw: 8 });
      else if (this.mode === 'versus' || i === this.active) {
        if (t % 40 < 28) text(g, '◀　▶', x, 300, { size: 34, color: '#ffffffaa', outline: null });
      }
    }
    // 角色格
    const n = CHAR_IDS.length;
    CHAR_IDS.forEach((id, k) => {
      const x = VIEW_W / 2 - n * 70 + k * 140 + 70, y = 620;
      g.fillStyle = '#120a18';
      g.fillRect(x - 60, y - 60, 120, 120);
      const img = ASSETS.portraits[id];
      if (img) { g.save(); g.beginPath(); g.rect(x - 58, y - 58, 116, 116); g.clip(); g.drawImage(img, x - 80, y - 66, 160, 160 * img.height / img.width); g.restore(); }
      for (let i = 0; i < 2; i++) {
        if (this.cur[i] === k) {
          g.strokeStyle = i === 0 ? '#ff5a3c' : '#3cb4ff';
          g.lineWidth = 5;
          g.strokeRect(x - 60 - i * 6, y - 60 - i * 6, 120 + i * 12, 120 + i * 12);
        }
      }
    });
    if (this.phase === 'stage') {
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.fillRect(0, 300, VIEW_W, 140);
      const s = STAGES[STAGE_IDS[this.stage]];
      text(g, 'STAGE SELECT', VIEW_W / 2, 330, { size: 24, color: '#ffd84a' });
      text(g, `◀  ${s.nameZh}  ${s.name}  ▶`, VIEW_W / 2, 380, { size: 34, color: '#fff', font: FONT_TC });
      text(g, '確定開始', VIEW_W / 2, 420, { size: 16, color: '#c9c2d8', font: FONT_TC, outline: null });
    } else {
      const hint = this.mode === 'versus' ? '1P：A/D 選、T 確定　　2P：←/→ 選、I 確定' : this.active === 0 ? '選擇你的角色' : '選擇對手';
      text(g, hint, VIEW_W / 2, 700, { size: 16, color: '#c9c2d8', font: FONT_TC, outline: null });
    }
  }
}

// ---------- VS ----------
export class VSScene {
  constructor(app, setup) { this.app = app; this.setup = setup; this.t = 0; }
  update(ev) {
    this.t++;
    if (this.t > 150 || (this.t > 30 && ev.any.ok)) this.app.go(new BattleScene(this.app, this.setup));
  }
  draw(g) {
    const t = this.t;
    const [a, b] = this.setup.chars;
    g.fillStyle = '#0a0410';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    const slide = Math.min(1, t / 18);
    g.save();
    g.fillStyle = '#7a1206';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(VIEW_W * 0.58, 0); g.lineTo(VIEW_W * 0.42, VIEW_H); g.lineTo(0, VIEW_H); g.fill();
    g.fillStyle = '#0b2f6b';
    g.beginPath(); g.moveTo(VIEW_W * 0.58, 0); g.lineTo(VIEW_W, 0); g.lineTo(VIEW_W, VIEW_H); g.lineTo(VIEW_W * 0.42, VIEW_H); g.fill();
    g.restore();
    portrait(g, a, -200 + slide * 520, 80, 600, false);
    portrait(g, b, VIEW_W + 200 - slide * 520, 80, 600, true);
    text(g, CHARS[a].name, 260, 640, { size: 54 });
    text(g, CHARS[b].name, VIEW_W - 260, 640, { size: 54 });
    const s = t < 20 ? 3 - t / 10 : 1 + Math.sin(t * 0.2) * 0.03;
    text(g, 'VS', VIEW_W / 2, VIEW_H / 2, { size: 130 * s, color: '#ffd84a', lw: 14 });
    text(g, STAGES[this.setup.stage].nameZh, VIEW_W / 2, 690, { size: 20, color: '#fff', font: FONT_TC });
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
    const p1 = mode === 'versus' ? new HumanController([KEYMAPS.p1], [0]) : new HumanController([KEYMAPS.solo], [0]);
    this.p1Ctrl = p1;
    let p2;
    this.training = mode === 'training' ? (app.training = app.training || { ...TRAINING_DEFAULT }) : null;
    if (mode === 'versus') p2 = new HumanController([KEYMAPS.p2], [1]);
    else if (mode === 'training') p2 = new DummyController(this.training);
    else p2 = new AIController(GAME.difficulty);
    this.p2Ctrl = p2;
    this.battle = new Battle({ chars: setup.chars.map((id) => CHARS[id]), stage: setup.stage, mode, controllers: [p1, p2], training: this.training });
    if (setup.chars[0] === setup.chars[1]) altAtlasImages(setup.chars[1]);   // 鏡像配色（通常已在閒置時算好）
    app.battle = this.battle;
    audio.playMusic(STAGES[setup.stage].bgm);
  }

  update(ev, codes) {
    this.t++;
    const b = this.battle;
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
    drawBattle(g, this.battle, this.t);
    if (this.recording) text(g, '● REC', VIEW_W - 90, 120, { size: 22, color: this.t % 40 < 25 ? '#ff3b2f' : '#802020' });
    if (this.training && !this.pause) text(g, 'Esc 選單　R 重設位置（按住←/→ 到牆角）', VIEW_W / 2, 712, { size: 14, color: '#ffffffaa', font: FONT_TC, outline: null });
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
  update(ev) {
    if (this.sub) { this.sub.t++; if (ev.any.back || ev.any.ok) this.sub = null; return; }
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
export class ResultScene {
  constructor(app, setup, result) {
    this.app = app; this.setup = setup; this.result = result; this.t = 0; this.sel = 0;
    this.items = ['再戰一場', '重新選角', '回主選單'];
    audio.stopMusic();
  }
  update(ev) {
    this.t++;
    const e = ev.any;
    if (e.up) { this.sel = (this.sel + 2) % 3; audio.sfx('move'); }
    if (e.down) { this.sel = (this.sel + 1) % 3; audio.sfx('move'); }
    if (e.ok && this.t > 30) {
      audio.sfx('ok');
      if (this.sel === 0) this.app.go(new VSScene(this.app, this.setup));
      else if (this.sel === 1) this.app.go(new SelectScene(this.app, this.setup.mode, this.setup));
      else this.app.go(new MenuScene(this.app));
    }
  }
  draw(g) {
    const t = this.t;
    backdrop(g, t, this.setup.stage, 0.72);
    const r = this.result;
    if (r === -1) {
      text(g, 'DRAW GAME', VIEW_W / 2, 200, { size: 80, color: '#ffd84a' });
    } else {
      const id = this.setup.chars[r];
      portrait(g, id, 360, 90, 560, r === 1);
      const who = this.setup.mode === 'versus' ? `${r + 1}P WINS` : r === 0 ? 'YOU WIN' : 'YOU LOSE';
      text(g, who, 860, 180, { size: 78, color: r === 0 || this.setup.mode === 'versus' ? '#ffd84a' : '#ff5a3c' });
      text(g, CHARS[id].name, 860, 270, { size: 48 });
      text(g, CHARS[id].nameZh, 860, 318, { size: 24, color: CHARS[id].color, font: FONT_TC });
    }
    menuList(g, this.items, this.sel, 860, 440, 60);
  }
}

// ---------- 操作說明 ----------
export class ControlsScene {
  constructor(app, back, chars) { this.app = app; this.back = back; this.t = 0; this.chars = chars || CHAR_IDS; }
  update(ev) { this.t++; if ((ev.any.back || ev.any.ok) && this.back) { audio.sfx('back'); this.app.go(this.back); } }
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
    for (const id of this.chars.filter((v, i, a) => a.indexOf(v) === i)) {
      const c = CHARS[id];
      text(g, `${c.name}  ${c.nameZh}`, 120, y, { size: 22, color: c.color, align: 'left', font: FONT_TC });
      text(g, c.blurb, 120, y + 30, { size: 15, color: '#c9c2d8', align: 'left', font: FONT_TC, outline: null, shadow: false });
      Object.values(c.moveNames).forEach((m, k) => {
        text(g, m.zh, 140 + (k % 2) * 520, y + 64 + Math.floor(k / 2) * 30, { size: 17, color: '#fff', align: 'left', font: FONT_TC, outline: null, shadow: false });
        text(g, m.cmd, 400 + (k % 2) * 520, y + 64 + Math.floor(k / 2) * 30, { size: 17, color: '#ffe9a8', align: 'left', font: FONT_TC, outline: null, shadow: false });
      });
      y += 160;
    }
    text(g, '指令以角色面向右方為準（面向左時左右相反）。普通技命中／被防時可取消成必殺技；必殺技可再取消成超必殺。', VIEW_W / 2, 690, { size: 14, color: '#9a92aa', font: FONT_TC, outline: null, shadow: false });
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
