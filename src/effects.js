// 特效：打擊火花、防禦火花、落地煙塵、文字彈出、畫面震動（只存資料，繪製在 render.js）
import { FX } from './config.js';

// 打擊強度鍵：普通技 L/M/H；必殺技依按鍵強度分成 SL/SM/SH（原本必殺全部共用 S，輕中重沒差）
export function strengthKey(h) {
  if ((h.sp || h.hitstop === 'S') && h.st) return 'S' + h.st;
  if (h.hitstop === 'S' || h.hitstop === 'SU') return h.hitstop;
  return h.spark || h.hitstop || 'M';
}
export const HEAVY = new Set(['H', 'SM', 'SH', 'SU']);

export class Effects {
  constructor() {
    this.list = [];
    this.shakeT = 0;
    this.shakeAmt = 0;
    this.flashT = 0;         // 全畫面白閃
  }

  spark(x, y, kind, dir, strength = 'M') {
    const size = { L: 0.62, M: 1, H: 1.45, S: 1.25, SL: 1.0, SM: 1.3, SH: 1.75, SU: 1.7 }[strength] || 1;
    const block = kind === 'block';
    const rays = [];
    const n = block ? 7 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      rays.push({ a, len: (0.6 + Math.random() * 0.6) * size });
    }
    this.list.push({ type: block ? 'block' : 'hit', x, y, dir, size: size * FX.sparkScale, t: 0, life: block ? 12 : 14, rays });
    // 碎點
    for (let i = 0; i < (block ? 5 : 9); i++) {
      const a = (Math.random() - 0.5) * 2.4 + (dir > 0 ? 0 : Math.PI);
      const sp = 4 + Math.random() * 7 * size;
      this.list.push({ type: 'bit', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, t: 0, life: 14 + Math.random() * 8, color: block ? '#9fe8ff' : Math.random() < 0.5 ? '#fff3b0' : '#ff9a2e' });
    }
  }

  dust(x, size = 1) {
    for (let i = 0; i < 6; i++) {
      this.list.push({ type: 'dust', x: x + (Math.random() - 0.5) * 80 * size, y: 4, vx: (Math.random() - 0.5) * 3 * size, vy: 0.6 + Math.random(), r: (12 + Math.random() * 14) * size, t: 0, life: 26 });
    }
  }

  ring(x, y, color, size = 1) {
    this.list.push({ type: 'ring', x, y, color, size, t: 0, life: 18 });
  }

  text(x, y, txt, color = '#ffe14a', size = 30) {
    this.list.push({ type: 'text', x, y, txt, color, size, t: 0, life: 60 });
  }

  shake(amt) {
    if (amt <= 0) return;
    this.shakeAmt = Math.max(this.shakeAmt, amt);
    this.shakeT = Math.max(this.shakeT, 10);
  }

  update() {
    for (const e of this.list) {
      e.t++;
      if (e.vx !== undefined) { e.x += e.vx; e.y += e.vy; }
      if (e.type === 'bit') e.vy -= 0.45;
      if (e.type === 'dust') { e.vx *= 0.92; e.vy *= 0.95; }
      if (e.type === 'text') e.y += 0.6;
    }
    this.list = this.list.filter((e) => e.t < e.life);
    if (this.shakeT > 0) { this.shakeT--; if (!this.shakeT) this.shakeAmt = 0; }
    if (this.flashT > 0) this.flashT--;
  }

  offset() {
    if (!this.shakeT) return [0, 0];
    const a = this.shakeAmt * (this.shakeT / 10);
    return [(Math.random() - 0.5) * 2 * a, (Math.random() - 0.5) * 2 * a];
  }
}
