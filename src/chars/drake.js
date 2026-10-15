// DRAKE 德雷克：重量級拳擊（霸體衝拳、衝刺上勾拳、連續勾拳）
import { baseNormals, STR } from './common.js';

const S = STR;

function dash(st) {
  return {
    type: 'special', anim: 'sp1',
    seq: [[1, 5], [2, 4], [3, 6], [4, 6], [5, 8], [6, 8], [7, 6]],
    vel: [[10, 22, { L: 8, M: 10, H: 12 }[st]]],
    armor: [3, 20, 1], stopOnHit: [10, 24],
    hits: [{ ...S.H, t: [17, 24], box: [20, 140, 140, 80], dmg: { L: 100, M: 115, H: 130 }[st], chip: 20, stun: 150, hs: 22, bs: 16, push: 9, guard: 'mid', react: 'body', hitstop: 'S' }],
    sound: 'whiffH',
  };
}

function upper(st) {
  return {
    type: 'special', anim: 'sp2',
    seq: [[1, 2], [2, 4], [3, 6], [4, 8], [5, 6], [6, 30]],
    jump: { t: 5, vy: { L: 14, M: 16.5, H: 19 }[st], vx: 2 },
    inv: [[1, { L: 3, M: 5, H: 8 }[st], st === 'H' ? 'all' : 'strike']],
    hits: [{ ...S.H, t: [3, { L: 9, M: 11, H: 13 }[st]], box: [10, 150, 105, 180], dmg: { L: 100, M: 115, H: 130 }[st], stun: 170, kd: true, launch: [2.5, 12], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' }],
    holdLast: true, landLag: [[7, 16]], sound: 'rise',
  };
}

function rush(st) {
  const fin = { L: 55, M: 65, H: 75 }[st];
  return {
    type: 'special', anim: 'sp3',
    seq: [[1, 4], [2, 4], [3, 5], [4, 5], [5, 5], [6, 8], [7, 10]],
    vel: [[5, 12, 5]],
    hits: [
      { ...S.M, t: [10, 12], box: [10, 90, 140, 90], dmg: 28, chip: 6, stun: 50, hs: 18, bs: 12, push: 1.5, guard: 'mid', react: 'body', hitstop: 'M' },
      { ...S.M, t: [15, 17], box: [10, 90, 140, 90], dmg: 28, chip: 6, stun: 50, hs: 18, bs: 12, push: 1.5, guard: 'mid', react: 'body', hitstop: 'M' },
      { ...S.M, t: [20, 22], box: [10, 90, 140, 90], dmg: 28, chip: 6, stun: 50, hs: 18, bs: 12, push: 1.5, guard: 'mid', react: 'body', hitstop: 'M' },
      { ...S.H, t: [24, 29], box: [10, 140, 120, 160], dmg: fin, chip: 10, stun: 80, kd: true, launch: [3, 12], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' },
    ],
    sound: 'whiffM',
  };
}

const drake = {
  id: 'drake', name: 'DRAKE', nameZh: '德雷克', title: 'HEAVYWEIGHT', style: '重量級拳擊', color: '#2fd06a',
  blurb: '力量型。衝拳有霸體，可以吃下一招硬打回去；所有攻擊都是拳頭，腳鍵是低段拳。',
  hp: 1050, stunMax: 1050, size: 1.08, pushW: 40, dmgMul: 1.07,
  walkF: 3.4, walkB: 2.8, jumpVy: 17, jumpVx: 4.0,
  normals: baseNormals({
    '5LP': { hits: [{ dmg: 32 }] },
    '5HP': { hits: [{ dmg: 110 }] },
    '5LK': { hits: [{ box: [20, 100, 125, 60] }] },
    '5HK': { hits: [{ dmg: 110 }] },
  }),
  throw: {
    type: 'throw', anim: 'throw', range: 120,
    seq: [[1, 4], [0, 16]],
    grab: { t: [2, 4] },
    onGrab: { seq: [[2, 8], [3, 14], [4, 10], [5, 14]], hitT: 24, dmg: 120, stun: 130, launch: [8, 8], sound: 'hitH' },
  },
  specials: [
    { motion: 'SUPER', btn: 'P', move: 'super' },
    { motion: 'DP', btn: 'P', move: 'upper' },
    { motion: 'QCF', btn: 'P', move: 'dash' },
    { motion: 'QCB', btn: 'P', move: 'rush' },
  ],
  moves: {},
  moveNames: {
    dash: { zh: '重砲直拳（霸體）', cmd: '↓↘→ + P' },
    upper: { zh: '衝天勾拳（對空）', cmd: '→↓↘ + P' },
    rush: { zh: '連環勾拳', cmd: '↓↙← + P' },
    super: { zh: '超必殺・最終鐘聲', cmd: '↓↘→↓↘→ + P' },
  },
  ai: { approach: 'dash', antiAir: 'upper', close: ['rush'], enders: { light: 'dash', big: 'rush' } },
};

for (const st of ['L', 'M', 'H']) {
  drake.moves[`dash_${st}`] = dash(st);
  drake.moves[`upper_${st}`] = upper(st);
  drake.moves[`rush_${st}`] = rush(st);
}

// 最終鐘聲：霸體衝刺，命中後連環勾拳接衝天勾拳
const sh = (t, dmg, extra = {}) => ({ ...S.M, t, box: [0, 80, 170, 180], autoBox: false, dmg, chip: 10, stun: 20, hs: 32, bs: 16, push: 0.8, guard: 'mid', react: 'body', hitstop: 'M', superHit: true, juggle: true, ...extra });
drake.moves.super = {
  type: 'super', anim: 'sp1', meter: 100,
  seq: [
    [1, 3], [2, 3], [3, 6], [4, 6],                         // 1-18 衝刺
    [3, 5, 'sp3'], [4, 5, 'sp3'], [5, 5, 'sp3'],            // 19-33
    [3, 5, 'sp3'], [4, 5, 'sp3'], [5, 5, 'sp3'],            // 34-48
    [2, 4, 'sp2'], [3, 6, 'sp2'], [4, 8, 'sp2'], [5, 6, 'sp2'], [6, 40, 'sp2'],
  ],
  vel: [[5, 18, 14], [19, 50, 3.2]],
  stopOnHit: [5, 18],
  armor: [1, 18, 3],
  inv: [[1, 8, 'all']],
  lock: { hit: 0, by: 18, whiff: [[5, 10], [6, 10], [7, 8]] },
  jump: { t: 53, vy: 15, vx: 1.5 },
  hits: [
    sh([8, 18], 40, { hs: 40, push: 0.4 }),
    sh([21, 23], 30), sh([26, 28], 30), sh([31, 33], 30),
    sh([36, 38], 30), sh([41, 43], 30), sh([46, 48], 30),
    sh([51, 58], 100, { kd: true, launch: [3, 14], hitstop: 'SU', spark: 'H', react: 'high', box: [0, 100, 230, 260] }),
  ],
  holdLast: true, landLag: [[7, 14, 'sp2']], sound: 'super',
};

export default drake;
