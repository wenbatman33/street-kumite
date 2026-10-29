// VERA 薇拉：卡波耶拉速攻型（突進踢、後空翻對空、倒立旋風連段）
import { baseNormals, timeline, STR, airSig } from './common.js';

const S = STR;

function lunge(st) {
  const sp = { L: 9, M: 11, H: 13 }[st];
  return {
    type: 'special', anim: 'sp1',
    seq: [[1, 6], [2, 4], [3, 7], [4, { L: 7, M: 9, H: 11 }[st]], [5, 6], [6, 9], [7, 4]],
    vel: [[7, { L: 23, M: 25, H: 27 }[st], sp]],
    stopOnHit: true,
    hits: [{ ...S.H, t: [11, { L: 24, M: 26, H: 28 }[st]], box: [20, 120, 140, 90], dmg: { L: 85, M: 95, H: 105 }[st], stun: 140, hs: 20, bs: 14, push: 7, chip: 18, guard: 'mid', react: 'high', hitstop: 'S' }],
    sound: 'whiffH',
  };
}

function moon(st) {
  const vy = { L: 16, M: 18, H: 20 }[st];
  return {
    type: 'special', anim: 'sp2',
    seq: [[1, 2], [2, 3], [3, 7], [4, 6], [5, 6], [6, 40]],
    jump: { t: 4, vy, vx: -1.2 },
    inv: [[1, { L: 4, M: 6, H: 9 }[st], st === 'H' ? 'all' : 'strike']],
    hits: [{ ...S.H, t: [3, { L: 11, M: 13, H: 15 }[st]], box: [-10, 130, 120, 200], dmg: { L: 100, M: 115, H: 130 }[st], stun: 180, kd: true, launch: [3, 13], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' }],
    holdLast: true, landLag: [[7, 18]], sound: 'rise', shout: true,
  };
}

function spin(st) {
  const n = { L: 3, M: 4, H: 5 }[st];
  const parts = [[1, 5], [2, 4]];
  const hits = [];
  let t = 10;
  for (let i = 0; i < n; i++) {
    parts.push([3, 4], [4, 4], [5, 4]);
    const last = i === n - 1;
    hits.push({ ...S.M, t: [t, t + 3], box: [-30, 70, 170, 140], dmg: last ? 45 : 30, chip: 7, stun: 60, hs: last ? 24 : 20, bs: 12, push: last ? 6 : 1.2,
      kd: last, launch: last ? [5, 9] : null, guard: 'mid', react: 'body', hitstop: 'M', juggle: true });
    t += 12;
  }
  parts.push([6, 8], [7, 6]);
  return {
    type: 'special', anim: 'sp3', seq: parts,
    vel: [[8, 8 + n * 12, { L: 1.6, M: 2.1, H: 2.6 }[st]]],
    hits, sound: 'spin',
  };
}

const vera = {
  id: 'vera', name: 'VERA', nameZh: '薇拉', title: 'CAPOEIRA STORM', style: '卡波耶拉', color: '#3ddc68',
  blurb: '速攻型。用疾風腳拉近距離，倒立旋風連段壓制，月輪空翻對空。',
  hp: 950, stunMax: 950, dmgMul: 1.06,
  walkF: 4.0, walkB: 3.3, jumpVy: 19, jumpVx: 4.8,
  normals: baseNormals({
    '5LP': { hits: [{ dmg: 28 }] },
    '5HP': { hits: [{ dmg: 95 }] },
    '5HK': { hits: [{ dmg: 100, box: [20, 190, 185, 70] }] },
    '2MK': { hits: [{ box: [20, 0, 180, 40] }] },
    // 空中疾風腳：側身飛踢帶綠色旋風
    'jHK': airSig('sp1', [2], [3, 4], 7, 8, { dmg: 100 }),
  }),
  throw: {
    type: 'throw', anim: 'throw', range: 118,
    seq: [[1, 4], [0, 16]],
    grab: { t: [2, 4] },
    onGrab: { seq: [[2, 8], [3, 14], [4, 10], [5, 14]], hitT: 24, dmg: 110, stun: 120, launch: [8, 8], hold: 92, sound: 'hitH' },
  },
  specials: [
    { motion: 'SUPER', btn: 'K', move: 'super' },
    { motion: 'DP', btn: 'K', move: 'moon' },
    { motion: 'QCF', btn: 'K', move: 'lunge' },
    { motion: 'QCB', btn: 'K', move: 'spin' },
  ],
  moves: {},
  moveNames: {
    lunge: { zh: '疾風腳', cmd: '↓↘→ + K' },
    moon: { zh: '月輪', cmd: '→↓↘ + K' },
    spin: { zh: '銀河旋', cmd: '↓↙← + K' },
    super: { zh: '超必殺・嵐舞', cmd: '↓↘→↓↘→ + K' },
  },
  ai: { approach: 'lunge', antiAir: 'moon', close: ['spin'], enders: { light: 'lunge', big: 'spin' } },
};

for (const st of ['L', 'M', 'H']) {
  vera.moves[`lunge_${st}`] = lunge(st);
  vera.moves[`moon_${st}`] = moon(st);
  vera.moves[`spin_${st}`] = spin(st);
}

// 嵐舞：突進命中後自動接一串踢技，落空則收招
const sh = (t, dmg, extra = {}) => ({ ...S.M, t, box: [-10, 60, 175, 200], dmg, chip: 10, stun: 20, hs: 34, bs: 16, push: 0.8, guard: 'mid', react: 'high', hitstop: 'M', superHit: true, juggle: true, ...extra });
vera.moves.super = {
  type: 'super', anim: 'sp1', meter: 100,
  seq: [
    [1, 3], [2, 4], [3, 8], [4, 7],                    // 1-22 突進
    [1, 3, 'lk'], [2, 5, 'lk'],                        // 23-30
    [2, 4, 'hk'], [3, 6, 'hk'],                        // 31-40
    [3, 4, 'sp3'], [4, 4, 'sp3'], [5, 4, 'sp3'],       // 41-52
    [1, 4, 'sp2'], [2, 4, 'sp2'], [3, 8, 'sp2'],       // 53-68
    [4, 6, 'sp2'], [5, 6, 'sp2'], [6, 40, 'sp2'],
  ],
  vel: [[5, 22, 15], [23, 56, 3]],
  stopOnHit: [5, 22],
  inv: [[1, 14, 'all']],
  lock: { hit: 0, by: 22, whiff: [[5, 8], [6, 10], [7, 8]] },
  jump: { t: 60, vy: 15, vx: 1.5 },
  hits: [
    sh([8, 22], 40, { hs: 40, push: 0.5 }),
    sh([26, 28], 40),
    sh([35, 37], 50),
    sh([42, 44], 30),
    sh([46, 48], 30),
    sh([57, 64], 90, { kd: true, launch: [4, 14], hitstop: 'SU', spark: 'H', autoBox: false, box: [0, 40, 240, 280] }),
  ],
  holdLast: true, landLag: [[7, 16, 'sp2']], sound: 'super',
};

export default vera;
