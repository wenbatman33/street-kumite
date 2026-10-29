// VOLKAN 沃坎：拳帖四天王之一。冰島熔岩拳士（熔岩拳、噴發火柱、隕石俯衝）
import { baseNormals, STR, airSig } from './common.js';

const S = STR;

// 熔岩拳：打出一團岩漿
function magma(st) {
  return {
    type: 'special', anim: 'sp1',
    seq: [[1, 5], [2, 6], [3, 5], [4, 4], [5, 12], [6, 8], [7, 6]],
    proj: { t: 17, kind: 'magma', x: 130, y: 160, vx: 6.5, life: 220, scale: 1,
      hit: { dmg: 95, chip: 24, stun: 130, hs: 22, bs: 16, push: 7, hitstop: 'S', guard: 'mid', react: 'body', spark: 'H', meter: 8 },
      box: [-50, -40, 100, 80] },
    hits: [], whiffMeter: 4, sound: 'fireball',
  };
}

// 噴發：拳砸地面，前方噴出火柱（對空）
function eruption(st) {
  return {
    type: 'special', anim: 'sp2',
    seq: [[1, 4], [2, 4], [3, 4], [4, 12], [5, 8], [6, 6], [7, 8]],
    inv: [[1, { L: 4, M: 6, H: 9 }[st], st === 'H' ? 'all' : 'strike']],
    shakeAt: [12, 6],
    hits: [{ ...S.H, t: [12, 26], box: [{ L: 60, M: 80, H: 110 }[st], 0, 120, 320], autoBox: false, dmg: { L: 110, M: 120, H: 135 }[st], stun: 170, kd: true, launch: [2, 14], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' }],
    sound: 'superball',
  };
}

// 隕石俯衝：跳起後全身著火往斜下方俯衝（中段，須站防）
function meteor(st) {
  return {
    type: 'special', anim: 'sp3',
    seq: [[1, 4], [2, 6], [3, 10], [4, 40]],
    jump: { t: 6, vy: 15, vx: { L: 2.5, M: 4, H: 5.5 }[st] },
    dive: { t: 20, vy: -17, vx: { L: 6, M: 8, H: 10 }[st] },
    hits: [{ ...S.H, t: [20, 60], box: [0, -40, 150, 170], autoBox: false, dmg: { L: 100, M: 115, H: 130 }[st], stun: 160, chip: 20, kd: true, launch: [3, 9], guard: 'high', react: 'high', hitstop: 'S' }],
    holdLast: true, landLag: [[5, 6], [6, 10], [7, 8]], landShake: 10, sound: 'whiffH', shout: true,
  };
}

const volkan = {
  id: 'volkan', name: 'VOLKAN', nameZh: '沃坎', title: 'MAGMA FIST', style: '火山熔岩拳', color: '#ff5a1e', boss: true,
  blurb: '拳帖四天王。熔岩拳的火山戰士，岩漿牽制、火柱對空、隕石俯衝壓制。',
  hp: 1200, stunMax: 1200, size: 1.12, pushW: 42, dmgMul: 1.2,
  walkF: 3.0, walkB: 2.6, jumpVy: 17, jumpVx: 4.0,
  normals: baseNormals({
    '5LP': { hits: [{ dmg: 38 }] },
    '5MP': { hits: [{ dmg: 72 }] },
    '5HP': { hits: [{ dmg: 125 }] },
    '5HK': { hits: [{ dmg: 115 }] },
    'jHP': airSig('jp', [1, 2], [3], 8, 8, { dmg: 115 }),
  }),
  throw: {
    type: 'throw', anim: 'throw', range: 124,
    seq: [[1, 4], [0, 16]],
    grab: { t: [2, 4] },
    onGrab: { dmg: 135, stun: 140, sound: 'hitH' },
  },
  specials: [
    { motion: 'SUPER', btn: 'P', move: 'super' },
    { motion: 'DP', btn: 'P', move: 'eruption' },
    { motion: 'QCF', btn: 'P', move: 'magma' },
    { motion: 'QCB', btn: 'P', move: 'meteor' },
  ],
  moves: {},
  moveNames: {
    magma: { zh: '熔岩拳', cmd: '↓↘→ + P' },
    eruption: { zh: '噴發（對空）', cmd: '→↓↘ + P' },
    meteor: { zh: '隕石俯衝（中段）', cmd: '↓↙← + P' },
    super: { zh: '超必殺・火山爆發', cmd: '↓↘→↓↘→ + P' },
  },
  ai: { zone: 'magma', antiAir: 'eruption', approach: 'meteor', close: ['meteor'], enders: { light: 'magma', big: 'eruption' } },
};

for (const st of ['L', 'M', 'H']) {
  volkan.moves[`magma_${st}`] = magma(st);
  volkan.moves[`eruption_${st}`] = eruption(st);
  volkan.moves[`meteor_${st}`] = meteor(st);
}

// 火山爆發：連發熔岩拳，最後一發把人打飛
volkan.moves.super = {
  type: 'super', anim: 'sp1', meter: 100,
  seq: [[1, 6], [2, 8], [3, 6], [4, 4], [5, 16], [6, 10], [7, 8]],
  inv: [[1, 18, 'all']],
  proj: { t: 19, kind: 'magma', x: 140, y: 160, vx: 7.5, life: 240, scale: 1.8, super: true,
    hit: { dmg: 50, chip: 14, stun: 30, hs: 26, bs: 18, push: 1.5, hitstop: 'S', guard: 'mid', react: 'body', spark: 'H', meter: 0, superHit: true },
    multi: { count: 6, gap: 5, last: { dmg: 110, kd: true, launch: [6, 12], hitstop: 'SU' } },
    box: [-80, -70, 160, 140] },
  hits: [], sound: 'super',
};

export default volkan;
