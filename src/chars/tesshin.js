// TESSHIN 鐵心：拳帖之王（最終頭目）。TORA 的師父、大會主辦者「拳帖主人」，金色猛虎氣勁
import { baseNormals, STR, airSig } from './common.js';

const S = STR;

// 猛虎氣勁：虎頭形狀的金色氣功波（兩段）
function tiger(st) {
  return {
    type: 'special', anim: 'sp1',
    seq: [[1, 4], [2, 5], [3, 5], [4, 4], [5, 4], [6, 12], [7, 8]],
    proj: { t: 19, kind: 'tiger', x: 130, y: 165, vx: { L: 6.5, M: 8, H: 9.5 }[st], life: 240, scale: 1.1,
      hit: { dmg: 55, chip: 16, stun: 70, hs: 20, bs: 15, push: 3, hitstop: 'S', guard: 'mid', react: 'body', spark: 'H', meter: 6 },
      multi: { count: 2, gap: 6, last: { dmg: 60, push: 7 } },
      box: [-55, -45, 110, 90] },
    hits: [], whiffMeter: 4, sound: 'fireball',
  };
}

// 昇虎掌：帶著金色虎爪的上升掌（對空，重版全身無敵）
function rising(st) {
  const hits = [
    { ...S.H, t: [3, 6], box: [10, 120, 100, 160], dmg: { L: 70, M: 80, H: 90 }[st], stun: 100, hs: 28, kd: false, guard: 'mid', react: 'high', hitstop: 'S', juggle: true },
    { ...S.H, t: [7, 16], box: [-5, 170, 100, 200], dmg: { L: 60, M: 70, H: 80 }[st], stun: 100, kd: true, launch: [2.5, 13], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' },
  ];
  return {
    type: 'special', anim: 'sp2',
    seq: [[1, 2], [2, 3], [3, 10], [4, 7], [5, 6], [6, 30]],
    jump: { t: 5, vy: { L: 17, M: 19.5, H: 22 }[st], vx: 2.6 },
    inv: [[1, { L: 6, M: 8, H: 12 }[st], st === 'L' ? 'strike' : 'all']],
    hits, holdLast: true, landLag: [[7, 14]], sound: 'rise', shout: true,
  };
}

// 震地掌：掌拍地面，金色衝擊波貼地竄出（下段）
function palm(st) {
  return {
    type: 'special', anim: 'sp3',
    seq: [[1, 4], [2, 5], [3, 5], [4, 10], [5, 8], [6, 6], [7, 6]],
    shakeAt: [15, 6],
    hits: [{ ...S.H, t: [15, 23], box: [30, 0, { L: 220, M: 260, H: 300 }[st], 55], autoBox: false, dmg: { L: 90, M: 100, H: 110 }[st], stun: 140, chip: 18, kd: true, launch: [3, 8], guard: 'low', react: 'low', hitstop: 'S' }],
    sound: 'land',
  };
}

const tesshin = {
  id: 'tesshin', name: 'TESSHIN', nameZh: '鐵心', title: 'MASTER OF KUMITE', style: '剛柔虎拳流', color: '#ffc83a', boss: true, final: true,
  blurb: '拳帖之王。大會主辦者、虎牙的師父。猛虎氣勁、昇虎掌、震地掌，全方位無死角。',
  hp: 1300, stunMax: 1300, size: 1.05, dmgMul: 1.3,
  walkF: 3.7, walkB: 3.1, jumpVy: 18.5, jumpVx: 4.6,
  normals: baseNormals({
    '5LP': { hits: [{ dmg: 34 }] },
    '5HP': { hits: [{ dmg: 115 }] },
    '5HK': { hits: [{ dmg: 115 }] },
    'jHK': airSig('jk', [1, 2], [3], 7, 8, { dmg: 115 }),
  }),
  throw: {
    type: 'throw', anim: 'throw', range: 122,
    seq: [[1, 4], [0, 16]],
    grab: { t: [2, 4] },
    onGrab: { dmg: 140, stun: 140, sound: 'hitH' },
  },
  specials: [
    { motion: 'SUPER', btn: 'P', move: 'super' },
    { motion: 'DP', btn: 'P', move: 'rising' },
    { motion: 'QCF', btn: 'P', move: 'tiger' },
    { motion: 'QCB', btn: 'P', move: 'palm' },
  ],
  moves: {},
  moveNames: {
    tiger: { zh: '猛虎氣勁', cmd: '↓↘→ + P' },
    rising: { zh: '昇虎掌', cmd: '→↓↘ + P' },
    palm: { zh: '震地掌（下段）', cmd: '↓↙← + P' },
    super: { zh: '超必殺・百虎咆哮', cmd: '↓↘→↓↘→ + P' },
  },
  ai: { zone: 'tiger', antiAir: 'rising', close: ['palm'], enders: { light: 'tiger', big: 'rising' } },
};

for (const st of ['L', 'M', 'H']) {
  tesshin.moves[`tiger_${st}`] = tiger(st);
  tesshin.moves[`rising_${st}`] = rising(st);
  tesshin.moves[`palm_${st}`] = palm(st);
}

// 百虎咆哮：巨大猛虎氣勁，多段
tesshin.moves.super = {
  type: 'super', anim: 'sp1', meter: 100,
  seq: [[1, 6], [2, 8], [3, 8], [4, 6], [5, 4], [6, 18], [7, 10]],
  inv: [[1, 22, 'all']],
  proj: { t: 25, kind: 'tiger', x: 140, y: 170, vx: 8.5, life: 260, scale: 2.1, super: true,
    hit: { dmg: 50, chip: 14, stun: 40, hs: 26, bs: 18, push: 1.5, hitstop: 'S', guard: 'mid', react: 'body', spark: 'H', meter: 0, superHit: true },
    multi: { count: 7, gap: 5, last: { dmg: 120, kd: true, launch: [6, 13], hitstop: 'SU' } },
    box: [-90, -80, 180, 160] },
  hits: [], sound: 'super',
};

export default tesshin;
