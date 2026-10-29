// ATLAS 阿特拉斯：拳帖四天王之一。希臘青銅巨漢（踏地震波、霸體衝撞、雙拳上擊）
import { baseNormals, STR, airSig } from './common.js';

const S = STR;

// 泰坦踏地：抬腿重踏，地裂震波沿地面往前竄（下段）
function quake(st) {
  return {
    type: 'special', anim: 'sp1',
    seq: [[1, 6], [2, 8], [3, 4], [4, 6], [5, 8], [6, 10], [7, 6]],
    shakeAt: [19, 6],
    proj: { t: 19, kind: 'quake', x: 100, y: 0, vx: 6.5, life: 140, scale: 1.1, anchor: 'foot',
      hit: { dmg: 90, chip: 22, stun: 140, hs: 22, bs: 18, push: 7, hitstop: 'S', guard: 'low', react: 'low', spark: 'H', meter: 8 },
      box: [-55, 0, 110, 80] },
    hits: [], whiffMeter: 4, sound: 'land',
  };
}

// 巨像上擊：雙拳合握往上砸（對空）
function upper(st) {
  return {
    type: 'special', anim: 'sp2',
    seq: [[1, 3], [2, 4], [3, 8], [4, 8], [5, 6], [6, 30]],
    jump: { t: 6, vy: { L: 12, M: 14, H: 16 }[st], vx: 1 },
    inv: [[1, { L: 5, M: 7, H: 10 }[st], st === 'H' ? 'all' : 'strike']],
    hits: [{ ...S.H, t: [4, 16], box: [-20, 150, 140, 210], autoBox: false, dmg: { L: 110, M: 125, H: 140 }[st], stun: 180, kd: true, launch: [2, 13], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' }],
    holdLast: true, landLag: [[6, 8], [7, 10]], landShake: 6, sound: 'rise', shout: true,
  };
}

// 青銅衝撞：霸體肩撞
function charge(st) {
  return {
    type: 'special', anim: 'sp3',
    seq: [[1, 6], [2, 4], [3, 12], [4, 8], [5, 8], [6, 6], [7, 6]],
    vel: [[11, 26, { L: 8, M: 9.5, H: 11 }[st]]],
    armor: [1, 22, 2], stopOnHit: true,
    hits: [{ ...S.H, t: [11, 26], box: [10, 80, 140, 200], dmg: { L: 100, M: 115, H: 130 }[st], stun: 150, hs: 24, bs: 16, push: 11, chip: 18, guard: 'mid', react: 'body', hitstop: 'S' }],
    sound: 'whiffH',
  };
}

const atlas = {
  id: 'atlas', name: 'ATLAS', nameZh: '阿特拉斯', title: 'BRONZE TITAN', style: '古希臘搏擊', color: '#e0a83a', boss: true,
  blurb: '拳帖四天王。青銅巨漢，踏地震波、霸體衝撞，硬吃攻擊也要壓過去。',
  hp: 1250, stunMax: 1300, size: 1.2, pushW: 46, dmgMul: 1.2,
  walkF: 2.4, walkB: 2.0, jumpVy: 16, jumpVx: 3.4,
  normals: baseNormals({
    '5LP': { hits: [{ dmg: 40 }] },
    '5MP': { hits: [{ dmg: 75 }] },
    '5HP': { hits: [{ dmg: 130, stun: 190 }] },
    '5HK': { hits: [{ dmg: 125, push: 11 }] },
    '2HK': { hits: [{ dmg: 120, maxReach: 245 }] },
    'jHP': { ...airSig('jp', [1, 2], [3], 8, 9, { dmg: 125, box: [-20, -60, 160, 130] }), landShake: 5 },
  }),
  throw: {
    type: 'throw', anim: 'throw', range: 132,
    seq: [[1, 4], [0, 16]],
    grab: { t: [2, 4] },
    onGrab: { dmg: 150, stun: 150, sound: 'hitH' },
  },
  specials: [
    { motion: 'SUPER', btn: 'P', move: 'super' },
    { motion: 'DP', btn: 'P', move: 'upper' },
    { motion: 'QCF', btn: 'P', move: 'quake' },
    { motion: 'QCF', btn: 'K', move: 'charge' },
  ],
  moves: {},
  moveNames: {
    quake: { zh: '泰坦踏地（下段）', cmd: '↓↘→ + P' },
    upper: { zh: '巨像上擊', cmd: '→↓↘ + P' },
    charge: { zh: '青銅衝撞（霸體）', cmd: '↓↘→ + K' },
    super: { zh: '超必殺・大地崩裂', cmd: '↓↘→↓↘→ + P' },
  },
  ai: { zone: 'quake', antiAir: 'upper', approach: 'charge', close: ['charge'], enders: { light: 'charge', big: 'upper' } },
};

for (const st of ['L', 'M', 'H']) {
  atlas.moves[`quake_${st}`] = quake(st);
  atlas.moves[`upper_${st}`] = upper(st);
  atlas.moves[`charge_${st}`] = charge(st);
}

// 大地崩裂：連踏三次，巨大震波連段
atlas.moves.super = {
  type: 'super', anim: 'sp1', meter: 100,
  seq: [[1, 6], [2, 8], [3, 4], [4, 6], [5, 8], [6, 10], [7, 8]],
  inv: [[1, 18, 'all']], shakeAt: [19, 14],
  proj: { t: 19, kind: 'quake', x: 110, y: 0, vx: 7.5, life: 160, scale: 1.9, anchor: 'foot', super: true,
    hit: { dmg: 55, chip: 14, stun: 40, hs: 26, bs: 18, push: 1.5, hitstop: 'S', guard: 'low', react: 'low', spark: 'H', meter: 0, superHit: true },
    multi: { count: 5, gap: 5, last: { dmg: 110, kd: true, launch: [5, 13], hitstop: 'SU' } },
    box: [-90, 0, 180, 140] },
  hits: [], sound: 'super',
};

export default atlas;
