// BAATAR 巴特爾：蒙古摔角投技型（360 指令投、霸體衝撞、老鷹舞對空）
import { baseNormals, STR } from './common.js';

const S = STR;

// 360 指令投：抓到後把對手舉過頭頂轉一圈再砸到前方
function slam(st) {
  return {
    type: 'special', anim: 'sp1', range: { L: 105, M: 112, H: 120 }[st],
    seq: [[1, 4], [1, 6], [0, 24]],                     // 落空：撲空後大硬直
    grab: { t: [2, 5] }, prejumpOK: true,
    onGrab: {
      seq: [[2, 6], [3, 10], [4, 10], [5, 8], [6, 14], [7, 10]],
      path: [[0, 85, 0], [6, 70, 30], [16, 25, 230], [26, -15, 245], [34, -5, 210], [37, 95, 12], [58, 95, 0]],
      hitT: 37, dmg: { L: 170, M: 185, H: 200 }[st], stun: 200, launch: [2, 5], noTech: true, hitstop: 14, shake: 10, dust: true, sound: 'land',
    },
    hits: [], sound: 'grab',
  };
}

function eagle(st) {
  return {
    type: 'special', anim: 'sp2',
    seq: [[1, 3], [2, 4], [3, 6], [4, 6], [5, 6], [6, 30]],
    jump: { t: 4, vy: { L: 13, M: 15, H: 17 }[st], vx: 1.5 },
    inv: st === 'H' ? [[1, 7, 'strike']] : [],
    hits: [{ ...S.H, t: [4, { L: 14, M: 16, H: 18 }[st]], box: [-30, 150, 160, 190], autoBox: false, dmg: { L: 80, M: 90, H: 100 }[st], stun: 150, kd: true, launch: [3, 11], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' }],
    holdLast: true, landLag: [[7, 14]], sound: 'rise',
  };
}

function charge(st) {
  return {
    type: 'special', anim: 'sp3',
    seq: [[1, 6], [2, 4], [3, 8], [4, 8], [5, 6], [6, 10], [7, 12]],
    vel: [[7, 26, { L: 6, M: 7.5, H: 9 }[st]]],
    armor: st === 'L' ? null : [1, 14, 1], stopOnHit: true,
    hits: [{ ...S.H, t: [11, 26], box: [10, 90, 130, 170], dmg: { L: 85, M: 95, H: 105 }[st], stun: 130, hs: 22, bs: 14, push: 9, chip: 14, guard: 'mid', react: 'body', hitstop: 'S' }],
    sound: 'whiffH',
  };
}

const baatar = {
  id: 'baatar', name: 'BAATAR', nameZh: '巴特爾', title: 'STEPPE GIANT', style: '蒙古摔角', color: '#e0402a',
  blurb: '投技型。近身轉一圈就是 200 以上的指令投；衝撞有霸體，可以硬吃一招頂過去。',
  hp: 1040, stunMax: 1040, size: 1.08, pushW: 42, dmgMul: 0.85,
  walkF: 2.6, walkB: 2.2, jumpVy: 16.5, jumpVx: 3.6,
  normals: baseNormals({
    '5LP': { hits: [{ dmg: 38 }] },
    '5MP': { hits: [{ dmg: 70 }] },
    '5HP': { hits: [{ dmg: 125, stun: 180 }] },
    '5HK': { hits: [{ dmg: 115, push: 10 }] },
    '2HP': { hits: [{ dmg: 105 }] },
    '2MK': { hits: [{ maxReach: 215 }] },
    '2HK': { hits: [{ dmg: 115, maxReach: 235 }] },
    'jHP': { hits: [{ dmg: 115, box: [-20, -40, 150, 110] }] },
  }),
  throw: {
    type: 'throw', anim: 'throw', range: 128,
    seq: [[1, 4], [0, 16]],
    grab: { t: [2, 4] },
    onGrab: { seq: [[2, 10], [3, 12], [4, 10], [5, 14]], hitT: 26, dmg: 140, stun: 140, launch: [7, 9], sound: 'hitH' },
  },
  specials: [
    { motion: 'SUPER', btn: 'P', move: 'super' },
    { motion: 'SPD', btn: 'P', move: 'slam' },
    { motion: 'DP', btn: 'P', move: 'eagle' },
    { motion: 'QCF', btn: 'K', move: 'charge' },
  ],
  moves: {},
  moveNames: {
    slam: { zh: '草原大地摔（指令投）', cmd: '360 轉一圈 + P' },
    eagle: { zh: '鷹舞（對空）', cmd: '→↓↘ + P' },
    charge: { zh: '蠻牛衝撞（霸體）', cmd: '↓↘→ + K' },
    super: { zh: '超必殺・天地崩', cmd: '↓↘→↓↘→ + P' },
  },
  ai: { approach: 'charge', antiAir: 'eagle', grab: 'slam', close: ['slam'], enders: { light: 'charge', big: 'charge' } },
};

for (const st of ['L', 'M', 'H']) {
  baatar.moves[`slam_${st}`] = slam(st);
  baatar.moves[`eagle_${st}`] = eagle(st);
  baatar.moves[`charge_${st}`] = charge(st);
}

// 超必殺：衝刺抓取，抓到就是超大地摔
baatar.moves.super = {
  type: 'super', anim: 'sp3', meter: 100, range: 135,
  seq: [[1, 4], [2, 4], [3, 10], [4, 10], [6, 16], [7, 10]],
  vel: [[6, 28, 10]],
  inv: [[1, 12, 'all']],
  grab: { t: [8, 28] },
  onGrab: {
    seq: [[2, 6, 'sp1'], [3, 12, 'sp1'], [4, 12, 'sp1'], [5, 10, 'sp1'], [4, 10, 'sp1'], [5, 8, 'sp1'], [6, 16, 'sp1'], [7, 10, 'sp1']],
    path: [[0, 85, 0], [6, 70, 40], [18, 20, 280], [40, -20, 300], [58, 0, 260], [62, 95, 12], [84, 95, 0]],
    hitT: 62, dmg: 380, stun: 0, launch: [3, 7], noTech: true, hitstop: 20, shake: 16, dust: true, sound: 'ko',
  },
  hits: [], sound: 'super',
};

export default baatar;
