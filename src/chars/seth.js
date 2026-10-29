// SETH 賽特：拳帖四天王之一。埃及操沙拳士（沙暴龍捲、地面沙刺、沙中潛行）
import { baseNormals, STR, airSig } from './common.js';

const S = STR;

// 沙暴：連續多段的沙龍捲
function tornado(st) {
  return {
    type: 'special', anim: 'sp1',
    seq: [[1, 5], [2, 5], [3, 10], [5, 12], [6, 8], [7, 6]],   // 第 4 格素材裁切異常，略過
    proj: { t: 17, kind: 'tornado', x: 120, y: 150, vx: 5.5, life: 220, scale: 1,
      hit: { dmg: 34, chip: 9, stun: 50, hs: 18, bs: 12, push: 2, hitstop: 'M', guard: 'mid', react: 'body', spark: 'M', meter: 4 },
      multi: { count: 3, gap: 7, last: { dmg: 50, kd: true, launch: [3, 10], hitstop: 'S' } },
      box: [-45, -80, 90, 160] },
    hits: [], whiffMeter: 4, sound: 'fireball',
  };
}

// 沙刺：前方地面竄出沙刺（對空）
function spikes(st) {
  return {
    type: 'special', anim: 'sp2',
    seq: [[1, 4], [2, 4], [3, 4], [4, 10], [5, 8], [6, 6], [7, 8]],
    inv: [[1, { L: 4, M: 6, H: 9 }[st], st === 'H' ? 'all' : 'strike']],
    shakeAt: [12, 4],
    hits: [{ ...S.H, t: [12, 24], box: [{ L: 60, M: 90, H: 120 }[st], 0, 120, 280], autoBox: false, dmg: { L: 100, M: 110, H: 120 }[st], stun: 170, kd: true, launch: [2, 14], juggle: true, guard: 'mid', react: 'high', hitstop: 'S' }],
    sound: 'rise',
  };
}

// 沙中潛行：化成沙子消失，從對手身邊竄出上擊（輕＝往前、中＝繞到背後、重＝往後拉開）
function dive(st) {
  return {
    type: 'special', anim: 'sp3',
    seq: [[1, 6], [2, 6], [3, 8], [4, 8], [5, 6], [6, 8], [7, 8]],
    invisible: [[15, 26]],
    teleport: { t: 22, mode: { L: 'fwd', M: 'behind', H: 'back' }[st], dist: { L: 200, M: 90, H: 240 }[st], face: true },
    hits: st === 'H' ? [] : [{ ...S.H, t: [29, 36], box: [0, 120, 120, 190], dmg: 95, stun: 140, kd: true, launch: [2, 12], guard: 'mid', react: 'high', hitstop: 'S' }],
    sound: 'whiffM',
  };
}

const seth = {
  id: 'seth', name: 'SETH', nameZh: '賽特', title: 'SAND PHARAOH', style: '埃及沙之拳', color: '#f0c040', boss: true,
  blurb: '拳帖四天王。操控黃沙的拳士，沙暴牽制、沙刺對空、沙中潛行神出鬼沒。',
  hp: 1100, stunMax: 1100, dmgMul: 1.15,
  walkF: 3.4, walkB: 3.0, jumpVy: 18.5, jumpVx: 4.4,
  normals: baseNormals({
    '5LP': { hits: [{ dmg: 32 }] },
    '5HP': { hits: [{ dmg: 105 }] },
    '5HK': { hits: [{ dmg: 105, box: [20, 190, 190, 70] }] },
  }),
  throw: {
    type: 'throw', anim: 'throw', range: 118,
    seq: [[1, 4], [0, 16]],
    grab: { t: [2, 4] },
    onGrab: { dmg: 120, stun: 130, sound: 'hitH' },
  },
  specials: [
    { motion: 'SUPER', btn: 'P', move: 'super' },
    { motion: 'DP', btn: 'P', move: 'spikes' },
    { motion: 'QCF', btn: 'P', move: 'tornado' },
    { motion: 'QCB', btn: 'K', move: 'dive' },
  ],
  moves: {},
  moveNames: {
    tornado: { zh: '沙暴', cmd: '↓↘→ + P' },
    spikes: { zh: '沙刺（對空）', cmd: '→↓↘ + P' },
    dive: { zh: '沙中潛行', cmd: '↓↙← + K' },
    super: { zh: '超必殺・荒漠之怒', cmd: '↓↘→↓↘→ + P' },
  },
  ai: { zone: 'tornado', antiAir: 'spikes', teleport: 'dive', close: ['dive'], enders: { light: 'tornado', big: 'spikes' } },
};

for (const st of ['L', 'M', 'H']) {
  seth.moves[`tornado_${st}`] = tornado(st);
  seth.moves[`spikes_${st}`] = spikes(st);
  seth.moves[`dive_${st}`] = dive(st);
}

// 荒漠之怒：巨大沙暴龍捲，多段
seth.moves.super = {
  type: 'super', anim: 'sp1', meter: 100,
  seq: [[1, 6], [2, 8], [3, 14], [5, 16], [6, 10], [7, 8]],
  inv: [[1, 20, 'all']],
  proj: { t: 21, kind: 'tornado', x: 130, y: 170, vx: 6, life: 260, scale: 1.9, super: true,
    hit: { dmg: 40, chip: 12, stun: 30, hs: 24, bs: 18, push: 1, hitstop: 'S', guard: 'mid', react: 'body', spark: 'H', meter: 0, superHit: true },
    multi: { count: 7, gap: 5, last: { dmg: 100, kd: true, launch: [6, 13], hitstop: 'SU' } },
    box: [-80, -140, 160, 280] },
  hits: [], sound: 'super',
};

export default seth;
