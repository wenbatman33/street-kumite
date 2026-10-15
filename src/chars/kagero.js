// KAGERO 陽炎：忍者速度型（苦無、空中苦無、瞬移、二段跳）
import { baseNormals, STR } from './common.js';

const S = STR;

function kunai(st) {
  return {
    type: 'special', anim: 'sp1',
    seq: [[1, 3], [2, 3], [3, 3], [4, 3], [5, 8], [6, 6], [7, 5]],
    proj: { t: 11, kind: 'kunai', x: 90, y: 180, vx: { L: 11, M: 13, H: 15 }[st], life: 160, scale: 1,
      hit: { dmg: 55, chip: 12, stun: 80, hs: 15, bs: 10, push: 4, hitstop: 'M', guard: 'mid', react: 'high', spark: 'L', meter: 5 },
      box: [-30, -16, 60, 32], sound: 'whiffL' },
    hits: [], whiffMeter: 2, sound: 'whiffL',
  };
}

// 空中苦無：斜下方射出
function kunaiAir(st) {
  return {
    type: 'special', anim: 'jp', air: true,
    seq: [[1, 4], [2, 4], [3, 12]],
    proj: { t: 6, kind: 'kunai', x: 60, y: 110, vx: { L: 7, M: 9, H: 11 }[st], vy: { L: -6, M: -7, H: -8 }[st], life: 120, scale: 1,
      hit: { dmg: 40, chip: 8, stun: 60, hs: 15, bs: 10, push: 3, hitstop: 'M', guard: 'mid', react: 'high', spark: 'L', meter: 5 },
      box: [-28, -16, 56, 32], sound: 'whiffL' },
    hits: [], sound: 'whiffL',
  };
}

function crescent(st) {
  return {
    type: 'special', anim: 'sp2',
    seq: [[1, 2], [2, 3], [3, 6], [4, 6], [5, 6], [6, 30]],
    jump: { t: 4, vy: { L: 15, M: 17, H: 19 }[st], vx: 1.2 },
    inv: [[1, { L: 3, M: 5, H: 8 }[st], st === 'H' ? 'all' : 'strike']],
    hits: [{ ...S.H, t: [3, { L: 10, M: 12, H: 14 }[st]], box: [-5, 140, 115, 190], dmg: { L: 90, M: 100, H: 115 }[st], stun: 150, kd: true, launch: [2.5, 12], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' }],
    holdLast: true, landLag: [[7, 14]], sound: 'rise',
  };
}

// 瞬移：LK 往前、MK 繞到對手背後、HK 往後拉開
function teleport(st) {
  return {
    type: 'special', anim: 'sp3',
    seq: [[1, 4], [2, 4], [3, 4], [4, 6], [5, 4], [6, 6], [7, 6]],
    teleport: { t: 13, mode: { L: 'fwd', M: 'behind', H: 'back' }[st], dist: { L: 220, M: 110, H: 300 }[st] },
    invisible: [10, 18],
    inv: [[8, 21, 'all']],
    hits: [], sound: 'whiffL',
  };
}

const kagero = {
  id: 'kagero', name: 'KAGERO', nameZh: '陽炎', title: 'SHADOW BLOSSOM', style: '忍術', color: '#a678ff',
  blurb: '速度型。可以二段跳、空中丟苦無、瞬移到對手背後；血量最少，被抓到就危險。',
  hp: 960, stunMax: 960, size: 0.94, doubleJump: true, dmgMul: 1.26,
  walkF: 4.3, walkB: 3.6, jumpVy: 19.5, jumpVx: 5.0,
  normals: baseNormals({
    '5LP': { hits: [{ dmg: 26 }] },
    '5HP': { hits: [{ dmg: 95 }] },
    '5HK': { hits: [{ dmg: 100 }] },
    '2MK': { hits: [{ dmg: 62 }] },
    '2HK': { hits: [{ dmg: 90 }] },
  }),
  throw: {
    type: 'throw', anim: 'throw', range: 115,
    seq: [[1, 4], [0, 16]],
    grab: { t: [2, 4] },
    onGrab: { seq: [[2, 8], [3, 12], [4, 10], [5, 14]], hitT: 22, dmg: 105, stun: 120, launch: [8, 9], sound: 'hitH' },
  },
  specials: [
    { motion: 'SUPER', btn: 'P', move: 'super' },
    { motion: 'DP', btn: 'K', move: 'crescent' },
    { motion: 'QCF', btn: 'P', move: 'kunai', air: 'kunaiAir' },
    { motion: 'QCB', btn: 'K', move: 'teleport' },
  ],
  moves: {},
  moveNames: {
    kunai: { zh: '苦無（空中可）', cmd: '↓↘→ + P' },
    crescent: { zh: '月影斬（對空）', cmd: '→↓↘ + K' },
    teleport: { zh: '陽炎遁（瞬移）', cmd: '↓↙← + K（輕前／中背後／重後）' },
    super: { zh: '超必殺・影舞', cmd: '↓↘→↓↘→ + P' },
  },
  ai: { zone: 'kunai', airZone: 'kunaiAir', antiAir: 'crescent', teleport: 'teleport', approach: 'teleport', approachSt: 'L', jumpy: 0.25, close: ['teleport'], enders: { light: 'kunai', big: 'crescent' } },
};

for (const st of ['L', 'M', 'H']) {
  kagero.moves[`kunai_${st}`] = kunai(st);
  kagero.moves[`kunaiAir_${st}`] = kunaiAir(st);
  kagero.moves[`crescent_${st}`] = crescent(st);
  kagero.moves[`teleport_${st}`] = teleport(st);
}

// 影舞：突進斬命中後，消失→背後斬→消失→背後斬，最後月影斬
const sh = (t, dmg, extra = {}) => ({ ...S.M, t, box: [-10, 80, 190, 200], autoBox: false, dmg, chip: 10, stun: 20, hs: 36, bs: 16, push: 0.6, guard: 'mid', react: 'high', hitstop: 'M', superHit: true, juggle: true, ...extra });
kagero.moves.super = {
  type: 'super', anim: 'sp3', meter: 100,
  seq: [
    [1, 3], [2, 3], [3, 14, 'hp'],                    // 1-20 突進斬
    [2, 4, 'hp'], [3, 4, 'hp'],                        // 21-28
    [3, 4, 'sp3'], [4, 4, 'sp3'], [3, 6, 'hp'],       // 29-42 消失→背後斬
    [3, 4, 'sp3'], [4, 4, 'sp3'], [3, 6, 'hp'],       // 43-56 消失→背後斬
    [1, 2, 'sp2'], [2, 3, 'sp2'], [3, 8, 'sp2'], [4, 6, 'sp2'], [5, 6, 'sp2'], [6, 40, 'sp2'],
  ],
  vel: [[7, 20, 17]],
  stopOnHit: [7, 20],
  inv: [[1, 12, 'all']],
  lock: { hit: 0, by: 20, whiff: [[4, 8, 'hp'], [5, 8, 'hp'], [7, 6]] },
  teleport: [{ t: 33, mode: 'behind', dist: 95 }, { t: 47, mode: 'behind', dist: 95 }],
  invisible: [[30, 34], [44, 48]],
  jump: { t: 59, vy: 16, vx: 1.2 },
  hits: [
    sh([8, 20], 35, { hs: 40, push: 0.4 }),
    sh([25, 27], 45),
    sh([37, 40], 45),
    sh([51, 54], 45),
    sh([59, 66], 100, { kd: true, launch: [3, 14], hitstop: 'SU', spark: 'H', box: [-20, 100, 150, 260] }),
  ],
  holdLast: true, landLag: [[7, 14, 'sp2']], sound: 'super',
};

export default kagero;
