// 輸入：鍵盤／手把／AI 三種來源 → 每位玩家一個 PlayerInput（方向歷史 + 按鍵緩衝 + 搓招判定）
import { KEYMAPS, PADMAP, BUTTONS, PHYS } from './config.js';

const keys = new Set();
const keyPresses = [];        // 本 tick 內新按下的鍵（給選單、DEV 快捷鍵）
const GAME_KEYS = new Set(Object.values(KEYMAPS).flatMap((m) => Object.values(m).flat()).concat(['Space', 'Tab']));

window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (!e.repeat) keyPresses.push(e.code);
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

export function takeKeyPresses() {
  const out = keyPresses.slice();
  keyPresses.length = 0;
  return out;
}
export const isKeyDown = (code) => keys.has(code);

const EMPTY = () => ({ up: false, down: false, left: false, right: false, LP: false, MP: false, HP: false, LK: false, MK: false, HK: false, start: false, select: false });

export function readKeyboard(map) {
  const r = EMPTY();
  for (const k in map) r[k] = map[k].some((c) => keys.has(c));
  return r;
}

export function readPad(index) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && pads[index];
  if (!gp || !gp.connected) return null;
  const r = EMPTY();
  const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
  for (const k in PADMAP) r[k] = PADMAP[k].some(btn);
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  if (ax < -0.5) r.left = true;
  if (ax > 0.5) r.right = true;
  if (ay < -0.5) r.up = true;
  if (ay > 0.5) r.down = true;
  return r;
}

export function mergeRaw(list) {
  const r = EMPTY();
  for (const s of list) if (s) for (const k in r) r[k] = r[k] || s[k];
  return r;
}

// 數字鍵盤方向表示法：7 8 9 / 4 5 6 / 1 2 3（6 = 前、4 = 後，相對角色面向）
const MIRROR = { 1: 3, 3: 1, 4: 6, 6: 4, 7: 9, 9: 7, 2: 2, 5: 5, 8: 8 };
export const rel = (d, facing) => (facing >= 0 ? d : MIRROR[d]);

export const MOTIONS = {
  SUPER: { seq: [[2], [3], [6], [2], [3], [6]], win: 40 },
  SUPERK: { seq: [[2], [3], [6], [2], [3], [6]], win: 40 },
  DP: { seq: [[6, 3], [2], [3]], win: 18 },
  QCF: { seq: [[2], [3], [6]], win: 16 },
  QCB: { seq: [[2], [1], [4]], win: 16 },
};

export class PlayerInput {
  constructor() { this.reset(); }

  reset() {
    this.frame = 0;
    this.hist = [{ d: 5, t: 0 }];   // 只記方向「改變」的時間點
    this.raw = EMPTY();
    this.prev = EMPTY();
    this.press = {};                 // 按鍵 → 按下的 frame（緩衝用）
    this.dir = 5;
    this.log = [];                   // 訓練模式輸入紀錄
  }

  feed(raw) {
    this.frame++;
    this.prev = this.raw;
    this.raw = raw;
    // SOCD：左右同按 = 中立；上下同按 = 上
    const h = (raw.right ? 1 : 0) - (raw.left ? 1 : 0);
    const v = raw.up ? 1 : raw.down ? -1 : 0;
    const d = 5 + h + v * 3;
    if (d !== this.dir) {
      this.dir = d;
      this.hist.push({ d, t: this.frame });
      if (this.hist.length > 48) this.hist.shift();
    }
    const newly = [];
    for (const b of BUTTONS) {
      if (raw[b] && !this.prev[b]) { this.press[b] = this.frame; newly.push(b); }
    }
    // 輸入紀錄（方向或按鍵變化時新增一列）
    const last = this.log[this.log.length - 1];
    if (!last || last.d !== d || newly.length) {
      this.log.push({ d, b: newly, n: 1 });
      if (this.log.length > 40) this.log.shift();
    } else last.n++;
  }

  pressedNow(b) { return this.raw[b] && !this.prev[b]; }
  justPressed(key) { return this.raw[key] && !this.prev[key]; }

  // 緩衝內按下（尚未被消耗）
  buffered(b, within = PHYS.bufferTicks) {
    const t = this.press[b];
    return t !== undefined && this.frame - t <= within;
  }
  consume(b) { delete this.press[b]; }
  consumeAll() { this.press = {}; }

  // 兩鍵同按（投技）
  pair(a, b, within = 3) {
    const ta = this.press[a], tb = this.press[b];
    if (ta === undefined || tb === undefined) return false;
    return Math.abs(ta - tb) <= within && this.frame - Math.max(ta, tb) <= PHYS.bufferTicks;
  }

  relDir(facing) { return rel(this.dir, facing); }

  motion(name, facing) {
    const m = MOTIONS[name];
    const seq = m.seq;
    let k = seq.length - 1;
    for (let i = this.hist.length - 1; i >= 0; i--) {
      const e = this.hist[i];
      const end = i === this.hist.length - 1 ? this.frame : this.hist[i + 1].t - 1;
      if (this.frame - end > m.win) return false;
      if (seq[k].includes(rel(e.d, facing))) {
        k--;
        if (k < 0) return true;
      }
    }
    return false;
  }
}

// 選單用：任一來源的方向／確認／返回（含方向自動連發）
export class MenuInput {
  constructor() { this.prev = EMPTY(); this.hold = { up: 0, down: 0, left: 0, right: 0 }; }
  update(raw) {
    const ev = { up: false, down: false, left: false, right: false, ok: false, back: false, start: false };
    for (const d of ['up', 'down', 'left', 'right']) {
      if (raw[d]) {
        this.hold[d]++;
        if (this.hold[d] === 1 || (this.hold[d] > 18 && this.hold[d] % 5 === 0)) ev[d] = true;
      } else this.hold[d] = 0;
    }
    const edge = (k) => raw[k] && !this.prev[k];
    ev.ok = edge('LP') || edge('LK') || edge('start');
    ev.back = edge('MP') || edge('MK') || edge('select');
    ev.start = edge('start');
    this.prev = raw;
    return ev;
  }
}
