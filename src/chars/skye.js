// SKYE 史凱：極地救援隊蓄力型（蓄後→前 冰盤、蓄下→上 冰柱、蓄後→前 K 滑鏟）
import { baseNormals, STR } from './common.js';

const S = STR;

function disc(st) {
  return {
    type: 'special', anim: 'sp1',
    seq: [[1, 4], [2, 4], [3, 3], [4, 3], [5, 12], [6, 10], [7, 8]],
    proj: { t: 12, kind: 'disc', x: 110, y: 160, vx: { L: 6.5, M: 8, H: 10 }[st], life: 240, scale: 1,
      hit: { dmg: 60, chip: 14, stun: 100, hs: 18, bs: 14, push: 6, hitstop: 'S', guard: 'mid', react: 'body', spark: 'M', meter: 8 },
      box: [-42, -28, 84, 56], sound: 'fireball' },
    hits: [], whiffMeter: 3, sound: 'whiffM',
  };
}

// 冰柱：在前方固定距離從地面竄出（蓄下→上），遠距離對空
function spire(st) {
  return {
    type: 'special', anim: 'sp2',
    seq: [[1, 3], [2, 5], [3, 6], [4, 8], [5, 8], [6, 6], [7, 6]],
    proj: { t: 9, kind: 'spire', x: { L: 110, M: 170, H: 230 }[st], y: 0, vx: 0, life: 40, scale: 1, once: 9, anchor: 'foot',
      activeT: [5, 24], noClash: true, juggle: true,
      hit: { dmg: 90, chip: 12, stun: 140, hs: 20, bs: 12, push: 4, kd: true, launch: [2, 12], hitstop: 'S', guard: 'mid', react: 'high', spark: 'H', meter: 8 },
      box: [-45, 0, 90, 290], sound: 'rise' },
    hits: [], sound: 'whiffL',
  };
}

function slide(st) {
  return {
    type: 'special', anim: 'sp3', crouch: true,
    seq: [[1, 4], [2, 4], [3, 8], [4, 8], [5, 6], [6, 6], [7, 4]],
    vel: [[7, 24, { L: 7, M: 8.5, H: 10 }[st]]],
    hits: [{ ...S.H, t: [9, 24], box: [10, 0, 150, 55], autoBox: false, dmg: { L: 75, M: 85, H: 95 }[st], stun: 120, kd: true, launch: [3, 6], chip: 12, guard: 'low', react: 'low', hitstop: 'S' }],
    sound: 'whiffH',
  };
}

const skye = {
  id: 'skye', name: 'SKYE', nameZh: '史凱', title: 'ARCTIC RANGER', style: '極地救援', color: '#5fc8ff',
  blurb: '蓄力型。按住後方蓄力再丟冰盤控場；對手一跳就從地面竄出冰柱。',
  hp: 940, stunMax: 940, dmgMul: 0.93,
  walkF: 3.3, walkB: 3.0, jumpVy: 18, jumpVx: 4.2,
  normals: baseNormals({
    '5HK': { hits: [{ dmg: 100 }] },
  }),
  throw: {
    type: 'throw', anim: 'throw', range: 118,
    seq: [[1, 4], [0, 16]],
    grab: { t: [2, 4] },
    onGrab: { seq: [[2, 8], [3, 14], [4, 10], [5, 14]], hitT: 24, dmg: 110, stun: 120, launch: [8, 8], sound: 'hitH' },
  },
  specials: [
    { motion: 'SUPER', btn: 'P', move: 'super' },
    { motion: 'CDU', btn: 'K', move: 'spire' },
    { motion: 'CBF', btn: 'P', move: 'disc' },
    { motion: 'CBF', btn: 'K', move: 'slide' },
  ],
  moves: {},
  moveNames: {
    disc: { zh: '寒冰飛盤', cmd: '按住← 再 → + P' },
    spire: { zh: '霜柱（遠距對空）', cmd: '按住↓ 再 ↑ + K' },
    slide: { zh: '冰面滑鏟（下段）', cmd: '按住← 再 → + K' },
    super: { zh: '超必殺・暴風雪', cmd: '↓↘→↓↘→ + P' },
  },
  ai: { charge: true, zone: 'disc', antiAir: 'spire', close: ['slide'], enders: { light: 'disc', big: 'slide' } },
};

for (const st of ['L', 'M', 'H']) {
  skye.moves[`disc_${st}`] = disc(st);
  skye.moves[`spire_${st}`] = spire(st);
  skye.moves[`slide_${st}`] = slide(st);
}

skye.moves.super = {
  type: 'super', anim: 'sp1', meter: 100,
  seq: [[1, 6], [2, 6], [3, 4], [4, 4], [5, 16], [6, 12], [7, 8]],
  inv: [[1, 16, 'all']],
  proj: { t: 18, kind: 'disc', x: 130, y: 170, vx: 7, life: 260, scale: 2.1, super: true,
    hit: { dmg: 42, chip: 12, stun: 30, hs: 26, bs: 18, push: 1.5, hitstop: 'S', guard: 'mid', react: 'body', spark: 'H', meter: 0, superHit: true },
    multi: { count: 6, gap: 4, last: { dmg: 90, kd: true, launch: [6, 12], hitstop: 'SU' } },
    box: [-90, -60, 180, 120] },
  hits: [], sound: 'super',
};

export default skye;
