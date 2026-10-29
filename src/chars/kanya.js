// KANYA 甘雅：泰拳膝肘型（飛膝、衝天膝對空、連環肘擊）
import { baseNormals, STR, airSig } from './common.js';

const S = STR;

function knee(st) {
  return {
    type: 'special', anim: 'sp1',
    seq: [[1, 4], [2, 5], [3, 6], [4, 8], [5, 30]],
    jump: { t: 6, vy: 8.5, vx: { L: 6, M: 7.5, H: 9 }[st] },
    hits: [{ ...S.H, t: [11, 30], box: [20, 140, 110, 110], dmg: { L: 85, M: 95, H: 110 }[st], chip: 16, stun: 140, hs: 20, bs: 13, push: 7, guard: 'mid', react: 'high', hitstop: 'S' }],
    holdLast: true, landLag: [[6, 6], [7, 6]], sound: 'whiffH',
  };
}

function rising(st) {
  return {
    type: 'special', anim: 'sp2',
    seq: [[1, 2], [2, 3], [3, 6], [4, 8], [5, 6], [6, 30]],
    jump: { t: 4, vy: { L: 15, M: 17, H: 19.5 }[st], vx: 1.5 },
    inv: [[1, { L: 3, M: 5, H: 8 }[st], st === 'H' ? 'all' : 'strike']],
    hits: [{ ...S.H, t: [3, { L: 10, M: 12, H: 14 }[st]], box: [0, 140, 110, 190], dmg: { L: 95, M: 110, H: 125 }[st], stun: 160, kd: true, launch: [2.5, 12], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' }],
    holdLast: true, landLag: [[7, 15]], sound: 'rise',
  };
}

// 連環肘：最後一下是由上往下的中段肘（要站防）
function elbows(st) {
  const k = { L: 0.85, M: 1, H: 1.15 }[st];
  const e = (t, dmg, extra = {}) => ({ ...S.M, t, box: [10, 130, 120, 110], dmg: Math.round(dmg * k), chip: 6, stun: 50, hs: 18, bs: 12, push: 1.5, guard: 'mid', react: 'high', hitstop: 'M', ...extra });
  return {
    type: 'special', anim: 'sp3',
    seq: [[1, 4], [2, 4], [3, 5], [4, 5], [5, 5], [6, 8], [7, 9]],
    vel: [[4, 14, 4.5]],
    hits: [e([9, 11], 28), e([14, 16], 28), e([19, 21], 32), e([24, 28], 55, { guard: 'high', kd: true, launch: [3, 7], push: 6, hitstop: 'S', spark: 'H' })],
    sound: 'whiffM',
  };
}

const kanya = {
  id: 'kanya', name: 'KANYA', nameZh: '甘雅', title: 'ART OF EIGHT LIMBS', style: '泰拳', color: '#ff5a5a',
  blurb: '近身型。飛膝快速貼近，連環肘最後一下是中段；衝天膝是很強的對空。',
  hp: 980, stunMax: 980, size: 0.97, dmgMul: 1.12,
  walkF: 4.0, walkB: 3.3, jumpVy: 18.5, jumpVx: 4.6,
  normals: baseNormals({
    '5HP': { hits: [{ dmg: 100 }] },
    '5LK': { hits: [{ push: 9 }] },
    '5HK': { hits: [{ dmg: 105 }] },
    '2MK': { hits: [{ dmg: 65 }] },
    // 空中飛膝：提膝撞向對手
    'jHK': airSig('sp1', [2], [3, 4], 7, 8, { dmg: 105, react: 'body' }),
  }),
  throw: {
    type: 'throw', anim: 'throw', range: 118,
    seq: [[1, 4], [0, 16]],
    grab: { t: [2, 4] },
    onGrab: { seq: [[2, 8], [3, 14], [4, 10], [5, 14]], hitT: 24, dmg: 115, stun: 130, launch: [8, 8], sound: 'hitH' },
  },
  specials: [
    { motion: 'SUPER', btn: 'K', move: 'super' },
    { motion: 'DP', btn: 'K', move: 'rising' },
    { motion: 'QCF', btn: 'K', move: 'knee' },
    { motion: 'QCB', btn: 'P', move: 'elbows' },
  ],
  moves: {},
  moveNames: {
    knee: { zh: '飛膝', cmd: '↓↘→ + K' },
    rising: { zh: '衝天膝（對空）', cmd: '→↓↘ + K' },
    elbows: { zh: '連環肘（末段中段）', cmd: '↓↙← + P' },
    super: { zh: '超必殺・迦樓羅', cmd: '↓↘→↓↘→ + K' },
  },
  ai: { approach: 'knee', antiAir: 'rising', close: ['elbows'], enders: { light: 'elbows', big: 'rising' } },
};

for (const st of ['L', 'M', 'H']) {
  kanya.moves[`knee_${st}`] = knee(st);
  kanya.moves[`rising_${st}`] = rising(st);
  kanya.moves[`elbows_${st}`] = elbows(st);
}

// 迦樓羅：飛膝突進命中後，連環肘接衝天膝
const sh = (t, dmg, extra = {}) => ({ ...S.M, t, box: [0, 90, 170, 190], autoBox: false, dmg, chip: 10, stun: 20, hs: 34, bs: 16, push: 0.8, guard: 'mid', react: 'high', hitstop: 'M', superHit: true, juggle: true, ...extra });
kanya.moves.super = {
  type: 'super', anim: 'sp1', meter: 100,
  seq: [
    [1, 3], [2, 4], [3, 6], [4, 7],                          // 1-20 突進飛膝
    [3, 5, 'sp3'], [4, 5, 'sp3'], [5, 5, 'sp3'], [6, 6, 'sp3'],   // 21-41
    [2, 3, 'sp2'], [3, 6, 'sp2'], [4, 8, 'sp2'], [5, 6, 'sp2'], [6, 40, 'sp2'],
  ],
  vel: [[5, 20, 15], [21, 44, 3.2]],
  stopOnHit: [5, 20],
  inv: [[1, 12, 'all']],
  lock: { hit: 0, by: 20, whiff: [[5, 8], [6, 10], [7, 8]] },
  jump: { t: 45, vy: 16, vx: 1.5 },
  hits: [
    sh([9, 20], 45, { hs: 40, push: 0.4 }),
    sh([23, 25], 35), sh([28, 30], 35), sh([33, 35], 40), sh([38, 41], 45),
    sh([44, 52], 110, { kd: true, launch: [3, 14], hitstop: 'SU', spark: 'H', box: [0, 100, 230, 260] }),
  ],
  holdLast: true, landLag: [[7, 14, 'sp2']], sound: 'super',
};

export default kanya;
