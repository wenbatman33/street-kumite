// TORA 虎牙：均衡型空手道家（飛行道具、昇龍型對空、中段下劈）
import { baseNormals, timeline, STR } from './common.js';

const S = STR;

function fireball(st) {
  const sp = { L: 5.5, M: 7, H: 8.5 }[st];
  return {
    type: 'special', anim: 'sp1',
    seq: timeline([[0, 1], 4], [[2, 3], 7], [[4, 5], 8], [[6], 14], [[7], 10]),
    proj: { t: 12, kind: 'fireball', x: 120, y: 165, vx: sp, life: 240, scale: 1,
      hit: { dmg: 80, chip: 20, stun: 120, hs: 20, bs: 16, push: 6, hitstop: 'S', guard: 'mid', react: 'body', spark: 'M', meter: 8 },
      box: [-48, -38, 96, 76] },
    hits: [], whiffMeter: 4, sound: 'fireball',
  };
}

function rising(st) {
  const v = { L: [16, 2.0], M: [18.5, 2.6], H: [21, 3.0] }[st];
  const dmg = { L: 100, M: 115, H: 70 }[st];
  const hits = st === 'H'
    ? [
        { ...S.H, t: [3, 5], box: [10, 120, 95, 150], dmg, stun: 120, hs: 30, kd: true, launch: [1.5, 13], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' },
        { ...S.H, t: [6, 15], box: [-5, 170, 95, 190], dmg: 70, stun: 100, kd: true, launch: [2.5, 12], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' },
      ]
    : [{ ...S.H, t: [3, st === 'L' ? 10 : 12], box: [5, 140, 95, 170], dmg, stun: 180, kd: true, launch: [2.5, 12], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' }];
  return {
    type: 'special', anim: 'sp2',
    seq: [[1, 2], [2, 3], [3, 10], [4, 7], [5, 6], [6, 30]],
    jump: { t: 5, vy: v[0], vx: v[1] },
    inv: [[1, { L: 4, M: 6, H: 9 }[st], st === 'H' ? 'all' : 'strike']],
    hits, holdLast: true, landLag: [[7, 16]], sound: 'rise', shout: true,
  };
}

function axe(st) {
  const vx = { L: 3.2, M: 4.6, H: 6 }[st];
  return {
    type: 'special', anim: 'sp3',
    seq: [[1, 4], [2, 8], [3, 6], [4, 30]],
    jump: { t: 5, vy: 10, vx },
    hits: [{ ...S.H, t: [19, 34], box: [15, 0, 120, 220], dmg: { L: 90, M: 100, H: 110 }[st], stun: 150, hs: 22, bs: 15, guard: 'high', react: 'high', hitstop: 'S' }],
    holdLast: true, landLag: [[5, 10], [6, 8]], landShake: 3, sound: 'whiffH',
  };
}

const tora = {
  id: 'tora', name: 'TORA', nameZh: '虎牙', title: 'TIGER FIST', style: '空手道', color: '#ff8a1e',
  blurb: '均衡型。用虎咆彈控場，對手跳進就用昇虎拳打下來。',
  hp: 1000, stunMax: 1000,
  walkF: 3.6, walkB: 2.9, jumpVy: 18.5, jumpVx: 4.4,
  normals: baseNormals({
    '5HP': { hits: [{ dmg: 105 }] },
  }),
  throw: {
    type: 'throw', anim: 'throw', range: 118,
    seq: [[1, 4], [0, 16]],                         // 落空
    grab: { t: [2, 4] },
    onGrab: { seq: [[2, 10], [3, 12], [4, 10], [5, 14]], hitT: 26, dmg: 120, stun: 120, launch: [7, 9], hold: 92, sound: 'hitH' },
  },
  specials: [
    { motion: 'SUPER', btn: 'P', move: 'super' },
    { motion: 'DP', btn: 'P', move: 'rising' },
    { motion: 'QCF', btn: 'P', move: 'fireball' },
    { motion: 'QCB', btn: 'K', move: 'axe' },
  ],
  moves: {},
  moveNames: {
    fireball: { zh: '虎咆彈', cmd: '↓↘→ + P' },
    rising: { zh: '昇虎拳', cmd: '→↓↘ + P' },
    axe: { zh: '虎落踵（中段）', cmd: '↓↙← + K' },
    super: { zh: '超必殺・雷虎轟', cmd: '↓↘→↓↘→ + P' },
  },
  ai: { zone: 'fireball', antiAir: 'rising', close: ['axe'], enders: { light: 'fireball', big: 'rising' } },
};

for (const st of ['L', 'M', 'H']) {
  tora.moves[`fireball_${st}`] = fireball(st);
  tora.moves[`rising_${st}`] = rising(st);
  tora.moves[`axe_${st}`] = axe(st);
}

tora.moves.super = {
  type: 'super', anim: 'sp1', meter: 100,
  seq: timeline([[0, 1], 6], [[2, 3], 10], [[4, 5], 10], [[6], 18], [[7], 12]),
  inv: [[1, 18, 'all']],
  proj: { t: 17, kind: 'fireball', x: 130, y: 165, vx: 8, life: 260, scale: 1.65, super: true,
    hit: { dmg: 52, chip: 14, stun: 40, hs: 26, bs: 18, push: 1.5, hitstop: 'S', guard: 'mid', react: 'body', spark: 'H', meter: 0, superHit: true },
    multi: { count: 5, gap: 5, last: { dmg: 90, kd: true, launch: [6, 12], hitstop: 'SU' } },
    box: [-80, -60, 160, 120] },
  hits: [], sound: 'super',
};

export default tora;
