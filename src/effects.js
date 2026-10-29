// 特效：打擊火花、防禦火花、落地煙塵、文字彈出、畫面震動、鏡頭衝擊（只存資料，繪製在 render.js）
import { FX } from './config.js';

// 打擊強度鍵：普通技 L/M/H；必殺技依按鍵強度分成 SL/SM/SH（原本必殺全部共用 S，輕中重沒差）
export function strengthKey(h) {
  if ((h.sp || h.hitstop === 'S') && h.st) return 'S' + h.st;
  if (h.hitstop === 'S' || h.hitstop === 'SU') return h.hitstop;
  return h.spark || h.hitstop || 'M';
}
export const HEAVY = new Set(['H', 'SM', 'SH', 'SU']);
const SPARK_SIZE = { L: 0.62, M: 1, H: 1.45, S: 1.25, SL: 1.0, SM: 1.3, SH: 1.75, SU: 1.7 };

export class Effects {
  constructor() {
    this.list = [];
    this.shakeT = 0;
    this.shakeAmt = 0;
    this.shakeAxis = 'x';
    this.flashT = 0;         // 全畫面白閃
    this.zoomT = 0;          // 鏡頭衝擊縮放
    this.zoomAmt = 0;
    this.zoomLife = 1;
    this.zx = 0; this.zy = 0;
    this.dustColor = null;   // 舞台地面揚塵顏色（雪地、沙地、水花…）
  }

  // tint：必殺技火花帶角色色；jump：跳入攻擊（火花往下噴）
  spark(x, y, kind, dir, strength = 'M', tint = null, jump = false) {
    const size = (SPARK_SIZE[strength] || 1) * (jump ? 1.15 : 1);
    const block = kind === 'block';
    const n = block ? 6 : strength === 'L' ? 6 : 8;
    const rot = Math.random() * Math.PI;
    const rays = [];
    for (let i = 0; i < n; i++) rays.push({ a: rot + (i / n) * Math.PI * 2, len: (0.75 + Math.random() * 0.5) * size });
    this.list.push({ type: block ? 'block' : 'hit', x, y, dir, size: size * FX.sparkScale, t: 0, life: block ? 12 : HEAVY.has(strength) ? 16 : 12, rays, tint, heavy: HEAVY.has(strength), jump });
    // 碎點：往打擊方向噴（跳入攻擊往前下方）
    const bits = block ? 5 : HEAVY.has(strength) ? 12 : 7;
    for (let i = 0; i < bits; i++) {
      const base = jump ? (dir > 0 ? -0.6 : Math.PI + 0.6) : (dir > 0 ? 0 : Math.PI);
      const a = (Math.random() - 0.5) * 2.2 + base;
      const sp = 4 + Math.random() * 7 * size;
      const col = block ? '#9fe8ff' : tint && Math.random() < 0.5 ? tint : Math.random() < 0.5 ? '#fff3b0' : '#ff9a2e';
      this.list.push({ type: 'bit', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, t: 0, life: 12 + Math.random() * 8, color: col });
    }
    // 重擊：沿打擊方向的速度線
    if (!block && HEAVY.has(strength)) this.list.push({ type: 'streak', x, y, dir, size, t: 0, life: 10, jump });
  }

  // 吐血：K.O.／重擊時從口中噴出的血沫，落地後留下血跡慢慢淡掉
  spit(x, y, dir, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = -0.4 + Math.random() * 1.1;           // 往前上方噴
      const sp = 3 + Math.random() * 6;
      this.list.push({ type: 'drop', x, y, vx: dir * Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, t: 0, life: 240, color: Math.random() < 0.6 ? '#d0141e' : '#8c0a12', s: Math.random() < 0.3 ? 9 : 6, landed: false });
    }
  }

  dust(x, size = 1) {
    for (let i = 0; i < 6; i++) {
      this.list.push({ type: 'dust', x: x + (Math.random() - 0.5) * 80 * size, y: 4, vx: (Math.random() - 0.5) * 3 * size, vy: 0.6 + Math.random(), r: (12 + Math.random() * 14) * size, t: 0, life: 26, color: this.dustColor });
    }
  }

  // 被推開滑行時腳下的小煙塵
  skid(x, dir) {
    this.list.push({ type: 'dust', x, y: 4, vx: -dir * (0.5 + Math.random()), vy: 0.5 + Math.random() * 0.6, r: 8 + Math.random() * 7, t: 0, life: 18, color: this.dustColor });
  }

  ring(x, y, color, size = 1) {
    this.list.push({ type: 'ring', x, y, color, size, t: 0, life: 18 });
  }

  text(x, y, txt, color = '#ffe14a', size = 30) {
    this.list.push({ type: 'text', x, y, txt, color, size, t: 0, life: 60 });
  }

  // axis：'x' 水平為主（一般打擊）、'y' 垂直為主（跳入、倒地、重摔）
  shake(amt, axis = 'x') {
    if (amt <= 0) return;
    if (amt >= this.shakeAmt) this.shakeAxis = axis;
    this.shakeAmt = Math.max(this.shakeAmt, amt);
    this.shakeT = Math.max(this.shakeT, 10);
  }

  // 鏡頭衝擊：以 (x, y)（畫面座標）為中心瞬間放大再回彈
  zoom(amt, x, y, life = 12) {
    if (amt <= 0 || amt < this.zoomAmt * (this.zoomT / this.zoomLife)) return;
    this.zoomAmt = amt; this.zoomT = life; this.zoomLife = life;
    this.zx = x; this.zy = y;
  }

  zoomNow() {
    if (this.zoomT <= 0) return 0;
    const p = 1 - this.zoomT / this.zoomLife;       // 0 → 1
    return this.zoomAmt * (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85);
  }

  // frozen：慢動作的空拍，只推進震動與閃光計時，粒子不動
  update(frozen = false) {
    if (frozen) {
      if (this.shakeT > 0) { this.shakeT--; if (!this.shakeT) this.shakeAmt = 0; }
      if (this.flashT > 0) this.flashT--;
      if (this.zoomT > 0) this.zoomT--;
      return;
    }
    for (const e of this.list) {
      e.t++;
      if (e.vx !== undefined) { e.x += e.vx; e.y += e.vy; }
      if (e.type === 'bit') e.vy -= 0.45;
      if (e.type === 'dust') { e.vx *= 0.92; e.vy *= 0.95; }
      if (e.type === 'text') e.y += 0.6;
      if (e.type === 'drop' && !e.landed) {
        e.vy -= 0.55;
        if (e.y <= 2) { e.landed = true; e.y = 2; e.vx = 0; e.vy = 0; e.life = e.t + 150; }
      }
    }
    this.list = this.list.filter((e) => e.t < e.life);
    if (this.shakeT > 0) { this.shakeT--; if (!this.shakeT) this.shakeAmt = 0; }
    if (this.flashT > 0) this.flashT--;
    if (this.zoomT > 0) this.zoomT--;
  }

  // 街機式震動：沿主軸左右交替（不是隨機亂抖），副軸只帶一點
  offset() {
    if (!this.shakeT) return [0, 0];
    const a = this.shakeAmt * (this.shakeT / 10);
    const main = (this.shakeT % 2 ? 1 : -1) * a;
    const side = (Math.random() - 0.5) * a * 0.4;
    return this.shakeAxis === 'y' ? [side, main] : [main, side];
  }
}
