// 控制器：每 tick 回傳一份原始輸入（方向 + 六鍵）。人類、CPU、訓練假人共用同一套角色輸入流程
import { readKeyboard, readPad, mergeRaw } from './input.js';

const blank = () => ({ up: false, down: false, left: false, right: false, LP: false, MP: false, HP: false, LK: false, MK: false, HK: false, start: false, select: false });

// 相對方向（6=前）→ 絕對方向鍵
export function dirToRaw(raw, d, facing) {
  const h = ((d - 1) % 3) - 1;            // -1 後、0、1 前
  const v = Math.floor((d - 1) / 3) - 1;  // -1 下、0、1 上
  const ah = h * facing;
  raw.left = ah < 0; raw.right = ah > 0;
  raw.down = v < 0; raw.up = v > 0;
  return raw;
}

export class HumanController {
  constructor(maps, pads) { this.maps = maps; this.pads = pads; }
  poll() { return mergeRaw([...this.maps.map(readKeyboard), ...this.pads.map(readPad)]); }
}

export class NullController { poll() { return blank(); } }

// ---------- CPU ----------
const LEVELS = [
  { react: 26, block: 0.3, antiAir: 0.15, punish: 0.15, aggro: 0.35, combo: 0.25, special: 0.35, think: 30, idle: 0.25, super: 0.3 },   // EASY
  { react: 16, block: 0.6, antiAir: 0.45, punish: 0.45, aggro: 0.5, combo: 0.55, special: 0.5, think: 20, idle: 0.1, super: 0.6 },      // NORMAL
  { react: 10, block: 0.82, antiAir: 0.75, punish: 0.75, aggro: 0.6, combo: 0.85, special: 0.6, think: 14, idle: 0.04, super: 0.85 },  // HARD
  { react: 6, block: 0.94, antiAir: 0.92, punish: 0.92, aggro: 0.65, combo: 0.97, special: 0.7, think: 9, idle: 0, super: 1 },         // MASTER
];

const R = Math.random;
const pick = (arr) => arr[Math.floor(R() * arr.length)];

export class AIController {
  constructor(level = 1) {
    this.setLevel(level);
    this.queue = [];
    this.hold = null;       // { d, t }
    this.cool = 20;
    this.snaps = [];
    this.blockHold = 0;
    this.blockLow = false;
  }

  setLevel(l) { this.L = LEVELS[Math.max(0, Math.min(3, l))]; this.level = l; }

  snap(o) {
    this.snaps.push({ state: o.state, x: o.x, y: o.y, vx: o.vx, vy: o.vy, move: o.move, mt: o.mt, airborne: o.airborne, crouching: o.crouching, facing: o.facing });
    if (this.snaps.length > 40) this.snaps.shift();
    return this.snaps[Math.max(0, this.snaps.length - 1 - this.L.react)];
  }

  push(seq) { this.queue.push(...seq); }

  // 依角色的必殺技指令表產生輸入序列（相對方向），做不出來回傳 null
  seqFor(me, base, st = 'M', air = false) {
    const sp = me.def.specials.find((x) => (air ? x.air === base : x.move === base));
    if (!sp) return null;
    const name = base === 'super' ? 'super' : `${base}_${st}`;
    const mv = me.def.moves[name];
    if (!mv) return null;
    if (mv.proj && this.b.hasProjectile(me)) return null;
    if (mv.meter && me.meter < mv.meter) return null;
    const B = st + sp.btn;
    switch (sp.motion) {
      case 'QCF': return [{ d: 2 }, { d: 3 }, { d: 6, b: [B] }];
      case 'QCB': return [{ d: 2 }, { d: 1 }, { d: 4, b: [B] }];
      case 'DP': return [{ d: 6 }, { d: 2 }, { d: 3, b: [B] }];
      case 'SUPER': return [{ d: 2 }, { d: 3 }, { d: 6 }, { d: 2 }, { d: 3 }, { d: 6, b: [B] }];
      case 'SPD': return [{ d: 6 }, { d: 3 }, { d: 2 }, { d: 1 }, { d: 4 }, { d: 7, b: [B] }];
      case 'CBF': return me.input.charged('B') ? [{ d: 6, b: [B] }] : null;
      case 'CDU': return me.input.charged('D') ? [{ d: 8, b: [B] }] : null;
      default: return null;
    }
  }

  // 嘗試出某招（成功就排入佇列）
  use(me, base, st) {
    if (!base) return false;
    const seq = this.seqFor(me, base, st || pick(['L', 'M', 'H']));
    if (!seq) return false;
    this.push(seq);
    return true;
  }

  // 平常沒事時要按的方向：蓄力角色蹲在後下累積蓄力
  rest(me) {
    const charge = me.def.ai && me.def.ai.charge;
    if (!charge || (me.input.charged('B') && me.input.charged('D'))) {
      if (!this.restPick || this.restT-- <= 0) { this.restPick = pick(charge ? [1, 4, 5, 5] : [5, 5, 4, 1]); this.restT = 30; }
      return this.restPick;
    }
    return 1;
  }

  poll(b, me, opp) {
    this.b = b;
    const raw = blank();
    const o = this.snap(opp);
    const P = me.def.ai || {};
    if (b.phase !== 'fight') { this.queue = []; this.hold = null; return raw; }

    // 執行中的輸入序列
    if (this.queue.length) {
      const f = this.queue.shift();
      dirToRaw(raw, f.d || 5, me.facing);
      for (const k of f.b || []) raw[k] = true;
      return raw;
    }
    if (me.state === 'dizzy') {
      // 連打掙脫（難度越高越快）
      if (R() < 0.15 + this.level * 0.15) raw[pick(['LP', 'LK', 'MP'])] = true;
      dirToRaw(raw, pick([4, 6, 2, 8]), me.facing);
      return raw;
    }

    const dist = Math.abs(opp.x - me.x);
    const toward = Math.sign(me.x - o.x) === Math.sign(o.vx) && Math.abs(o.vx) > 0.5;

    // 空中：空中必殺或下降時出跳踢
    if (me.state === 'air') {
      if (P.airZone && dist > 260 && me.vy > -2 && R() < 0.08 + this.L.special * 0.1) {
        const seq = this.seqFor(me, P.airZone, pick(['L', 'M', 'H']), true);
        if (seq) { this.push(seq); return raw; }
      }
      if (me.def.doubleJump && !me.dblUsed && me.vy < 0 && dist > 200 && R() < 0.05) { this.push([{ d: 5 }, { d: 9 }]); return raw; }
      if (!me.airUsed && me.vy < 2 && dist < 170 && me.y < 170) raw[pick(['HK', 'HK', 'HP', 'MK'])] = true;
      return raw;
    }

    // 防守中：維持防禦方向
    if (me.state === 'blockstun' || this.blockHold > 0) {
      this.blockHold--;
      dirToRaw(raw, this.blockLow ? 1 : 4, me.facing);
      if (me.state === 'blockstun') return raw;
    }

    if (!me.actionable) { dirToRaw(raw, this.rest(me), me.facing); return raw; }

    // ---- 反應：對手出招 ----
    const oAtk = o.state === 'move' && o.move && o.move.hits && o.move.hits.length && o.mt <= o.move.lastActive;
    if (oAtk && dist < 340 && !o.airborne) {
      if (R() < this.L.block * 0.5 + (this.blockHold > 0 ? 0.5 : 0)) {
        const guard = o.move.hits[0].guard;
        const right = R() < this.L.block;
        this.blockLow = guard === 'low' ? right : guard === 'high' ? !right : R() < 0.75;
        this.blockHold = 14;
        dirToRaw(raw, this.blockLow ? 1 : 4, me.facing);
        return raw;
      }
    }
    // ---- 對空 ----
    if (o.airborne && o.state === 'air' && toward && dist < 280 && o.vy < 6 && this.cool <= 0) {
      this.cool = 18;
      if (R() < this.L.antiAir && this.use(me, P.antiAir, R() < 0.5 ? 'H' : 'M')) return raw;
      if (R() < 0.5) { this.push([{ d: 2, b: ['HP'] }]); return raw; }
      this.blockLow = false; this.blockHold = 20;
      dirToRaw(raw, 4, me.facing);
      return raw;
    }
    // ---- 飛行道具 ----
    const incoming = b.projectiles.find((p) => p.owner !== me && !p.spec.noClash && Math.sign(me.x - p.x) === Math.sign(p.vx) && Math.abs(p.x - me.x) < 330 && p.t > this.L.react);
    if (incoming && this.cool <= 0) {
      this.cool = 25;
      const d = Math.abs(incoming.x - me.x);
      if (P.zone && d > 200 && R() < 0.4 && this.use(me, P.zone, 'M')) return raw;
      if (P.teleport && d < 260 && R() < this.L.special * 0.5 && this.use(me, P.teleport, 'M')) return raw;
      if (d < 230 && d > 120 && R() < this.L.special) { this.push([{ d: 9 }, { d: 9 }, { d: 9 }]); return raw; }
      this.blockLow = me.def.ai && me.def.ai.charge; this.blockHold = 30;
      dirToRaw(raw, this.blockLow ? 1 : 4, me.facing);
      return raw;
    }
    // ---- 確反 ----
    const oRecover = (o.state === 'move' && o.move && o.mt > o.move.lastActive && o.move.total - o.mt > 8 && !o.airborne) || (o.state === 'landing' && opp.landT - opp.st > 8);
    if (oRecover && this.cool <= 0 && R() < this.L.punish) {
      this.cool = 30;
      if (me.meter >= 100 && R() < this.L.super && dist < 420 && this.use(me, 'super')) return raw;
      if (P.grab && dist < 125 && this.use(me, P.grab, 'H')) return raw;
      if (dist < 150) { this.push(this.combo(me, true)); return raw; }
      if (dist < 230) { this.push([{ d: 6, b: ['HK'] }]); return raw; }
      if (P.approach && dist < 360 && this.use(me, P.approach, P.approachSt || 'H')) return raw;
    }
    if (this.hold && this.hold.t > 0) {
      this.hold.t--;
      dirToRaw(raw, this.hold.d, me.facing);
      this.cool--;
      return raw;
    }
    this.cool--;
    dirToRaw(raw, this.rest(me), me.facing);
    if (this.cool > 0) return raw;
    this.cool = this.L.think + Math.floor(R() * this.L.think);
    if (R() < this.L.idle) { this.hold = { d: this.rest(me), t: 20 }; return raw; }

    // ---- 對手倒地：靠近等起身 ----
    if (opp.state === 'knockdown' || opp.state === 'getup') {
      if (dist > 160) this.hold = { d: 6, t: 15 };
      else if (opp.state === 'getup' && opp.st > 18 && R() < this.L.aggro) {
        if (P.grab && R() < 0.4) this.use(me, P.grab, 'L');
        else this.push([{ d: 2, b: ['MK'] }]);
      } else this.hold = { d: 1, t: 10 };
      return raw;
    }
    if (opp.state === 'dizzy' && dist < 400) {
      if (dist > 140) this.hold = { d: 6, t: 12 };
      else if (!(me.meter >= 100 && this.use(me, 'super'))) this.push(this.combo(me, true));
      return raw;
    }

    // ---- 立回 ----
    if (me.meter >= 100 && R() < this.L.super * 0.12 && dist < 500 && this.use(me, 'super')) return raw;
    const [zMin, zMax] = P.zoneRange || [380, 9999];
    if (P.zone && dist >= zMin && dist <= zMax && R() < this.L.special * 0.7 && this.use(me, P.zone)) return raw;
    if (dist > 430) {
      if (P.approach && R() < this.L.special * 0.4 && dist < 560 && this.use(me, P.approach, P.approachSt || 'H')) return raw;
      if (P.charge && R() < 0.6) { this.hold = { d: 1, t: 30 }; return raw; }   // 蓄力角色在遠處蹲著等
      this.hold = { d: 6, t: 20 + Math.floor(R() * 25) };
      return raw;
    }
    if (dist > 210) {
      const r = R();
      if (P.approach && r < this.L.special * 0.3 && dist < 360 && this.use(me, P.approach, pick(['L', 'M']))) return raw;
      if (P.teleport && r < 0.08 && this.use(me, P.teleport, 'L')) return raw;
      if (r < 0.42 + this.L.aggro * 0.2) this.hold = { d: P.charge ? 4 : 6, t: 10 + Math.floor(R() * 20) };
      else if (r < 0.6) this.hold = { d: 4, t: 8 + Math.floor(R() * 12) };
      else if (r < 0.6 + this.L.aggro * 0.25 + (P.jumpy || 0)) this.push([{ d: 9 }, { d: 9 }, { d: 9 }]);
      else if (dist < 270) this.push([{ d: 2, b: ['MK'] }]);
      else this.hold = { d: 6, t: 12 };
      return raw;
    }
    // 近距離
    const r = R();
    if (P.grab && dist < 115 && r < 0.15 + this.L.aggro * 0.15 && this.use(me, P.grab, pick(['L', 'M', 'H']))) return raw;
    if (dist < 110 && r < 0.18 + this.L.aggro * 0.1) { this.push([{ d: 6, b: ['HP'] }]); return raw; }
    if (r < 0.45) { this.push(this.combo(me, false)); return raw; }
    if (r < 0.58 && P.close && this.use(me, pick(P.close), pick(['L', 'M']))) return raw;
    if (r < 0.75) { this.blockLow = true; this.blockHold = 20; dirToRaw(raw, 1, me.facing); return raw; }
    if (r < 0.85) { this.hold = { d: 4, t: 14 }; return raw; }
    this.push([{ d: 6, b: ['LP'] }]);
    return raw;
  }

  // 連段：近距離普通技取消必殺技（收尾招依角色設定）
  combo(me, big) {
    const P = me.def.ai || {};
    const can = R() < this.L.combo;
    const lead = big ? pick([['2', 'MK'], ['5', 'MP'], ['2', 'MP']]) : pick([['2', 'LK'], ['2', 'MK'], ['5', 'LP'], ['2', 'LP']]);
    const d0 = lead[0] === '2' ? (P.charge ? 1 : 2) : 5;
    const seq = [{ d: d0, b: [lead[1]] }];
    if (!can || !P.enders) return seq;
    const ender = big ? P.enders.big : P.enders.light;
    const tail = this.seqFor(me, ender, big ? 'H' : pick(['L', 'M']));
    if (!tail) return seq;
    seq.push({ d: d0 }, { d: d0 }, { d: d0 }, ...tail);
    return seq;
  }
}


// ---------- 訓練假人 ----------
export class DummyController {
  constructor(training) {
    this.T = training;
    this.ai = new AIController(training.cpuLevel ?? 1);
    this.rec = [];
    this.playIdx = 0;
  }
  poll(b, me, opp) {
    const T = this.T;
    if (T.dummy === 'cpu') { this.ai.setLevel(T.cpuLevel ?? 1); return this.ai.poll(b, me, opp); }
    const raw = blank();
    if (T.dummy === 'playback' && T.recording && T.recording.length) {
      const f = T.recording[this.playIdx++ % T.recording.length];
      dirToRaw(raw, f.d, me.facing);
      for (const k of f.b) raw[k] = true;
      return raw;
    }
    if (T.dummy === 'crouch') raw.down = true;
    if (T.dummy === 'jump') raw.up = true;
    return raw;
  }
}
