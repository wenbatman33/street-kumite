// SHEN 沈：武僧長棍牽制型（普通技最長、龍突長戳、旋風棍對空、撐竿飛踢）
import { baseNormals, normal, STR, airSig } from './common.js';

const S = STR;
const W = { limbHurt: 0.45 };   // 棍子前端打不到本人

function thrust(st) {
  return {
    type: 'special', anim: 'sp1', ...W,
    seq: [[1, 5], [2, 4], [3, 4], [4, 3], [5, 9], [6, 6], [7, 6]],
    vel: [[6, 12, 4]],
    hits: [{ ...S.H, t: [14, 22], box: [20, 150, 320, 60], dmg: { L: 80, M: 90, H: 100 }[st], chip: 15, stun: 120, hs: 20, bs: 14, push: 8, guard: 'mid', react: 'body', hitstop: 'S' }],
    sound: 'whiffH',
  };
}

function whirl(st) {
  const n = { L: 2, M: 3, H: 4 }[st];
  const seq = [[1, 3], [2, 3]];
  const hits = [];
  let t = 7;
  for (let i = 0; i < n; i++) {
    seq.push([3, 3], [4, 3]);
    const last = i === n - 1;
    hits.push({ ...S.M, t: [t, t + 3], box: [-90, 170, 250, 160], autoBox: false, dmg: last ? 50 : 32, chip: 7, stun: 60, hs: last ? 24 : 18, bs: 10, push: last ? 6 : 1,
      kd: last, launch: last ? [3, 11] : [1, 9], juggle: true, guard: 'mid', react: 'high', hitstop: 'M' });
    t += 6;
  }
  seq.push([5, 4], [6, 6], [7, 8]);
  return {
    type: 'special', anim: 'sp2', ...W, seq,
    inv: st === 'H' ? [[1, 6, 'strike']] : [],
    hits, sound: 'spin',
  };
}

// 撐竿飛踢：越過地面低段攻擊，從空中下踢
function vault(st) {
  return {
    type: 'special', anim: 'sp3',
    seq: [[1, 4], [2, 5], [3, 6], [4, 6], [5, 40]],
    jump: { t: 9, vy: 13, vx: { L: 5, M: 6.5, H: 8 }[st] },
    hits: [{ ...S.H, t: [24, 60], box: [10, -10, 150, 150], dmg: { L: 80, M: 90, H: 100 }[st], stun: 120, hs: 20, bs: 14, guard: 'high', react: 'high', hitstop: 'S' }],
    holdLast: true, landLag: [[6, 8], [7, 6]], sound: 'whiffH',
  };
}

const shen = {
  id: 'shen', name: 'SHEN', nameZh: '沈', title: 'IRON STAFF', style: '少林棍法', color: '#ffb02e',
  blurb: '牽制型。普通技距離全角色最長，站在中距離用棍子封鎖對手；撐竿飛踢可以越過下段。',
  hp: 980, stunMax: 980, size: 1.02, dmgMul: 0.93,
  walkF: 3.2, walkB: 2.8, jumpVy: 17.5, jumpVx: 4.2,
  normals: baseNormals({
    '5LP': { ...W, hits: [{ box: [20, 180, 170, 45], dmg: 32 }] },
    '5MP': { ...W, hits: [{ box: [20, 175, 230, 50], dmg: 60 }] },
    '5HK': { ...W, hits: [{ box: [10, 165, 250, 75], dmg: 100 }] },
    '2LP': { ...W, hits: [{ box: [20, 50, 190, 45] }] },
    '2MP': { ...W, hits: [{ box: [20, 50, 230, 50] }] },
    '2MK': { hits: [{ maxReach: 235 }] },
    '2HK': { ...W, hits: [{ box: [20, 0, 270, 40], dmg: 95, maxReach: 270 }] },
    'jHP': { ...W, hits: [{ box: [0, -40, 190, 110] }] },
    // 空中撐竿飛踢：棍子撐住身體、雙腳蹬出
    'jHK': airSig('sp3', [2], [3, 4], 7, 8, { dmg: 105 }),
  }),
  throw: {
    type: 'throw', anim: 'throw', range: 125,
    seq: [[1, 4], [0, 16]],
    grab: { t: [2, 4] },
    onGrab: { seq: [[2, 8], [3, 12], [4, 10], [5, 14]], hitT: 24, dmg: 110, stun: 120, launch: [9, 9], sound: 'hitH' },
  },
  specials: [
    { motion: 'SUPER', btn: 'P', move: 'super' },
    { motion: 'DP', btn: 'P', move: 'whirl' },
    { motion: 'QCF', btn: 'P', move: 'thrust' },
    { motion: 'QCB', btn: 'K', move: 'vault' },
  ],
  moves: {},
  moveNames: {
    thrust: { zh: '龍突（長距離戳刺）', cmd: '↓↘→ + P' },
    whirl: { zh: '旋風棍（對空多段）', cmd: '→↓↘ + P' },
    vault: { zh: '撐竿飛踢（中段）', cmd: '↓↙← + K' },
    super: { zh: '超必殺・百裂棍', cmd: '↓↘→↓↘→ + P' },
  },
  ai: { zone: 'thrust', zoneRange: [230, 340], antiAir: 'whirl', approach: 'vault', close: ['whirl'], enders: { light: 'thrust', big: 'thrust' } },
};

// 輕拳：棍子距離很長，發生與硬直比其他角色慢，避免近乎無風險的遠距離戳
shen.normals['5LP'] = normal('lp', { pre: [1], act: [2], rec: [3, 0] }, 6, 3, 10, { ...S.L, box: [20, 180, 170, 45], dmg: 32, guard: 'mid', react: 'high' }, { ...W });
// 重拳：全長突刺（發生慢、距離超長）
shen.normals['5HP'] = normal('hp', { pre: [1, 2], act: [3], rec: [4, 5] }, 11, 4, 22, { ...S.H, box: [20, 175, 280, 50], dmg: 95, guard: 'mid', react: 'high' }, { cancel: false, ...W });

for (const st of ['L', 'M', 'H']) {
  shen.moves[`thrust_${st}`] = thrust(st);
  shen.moves[`whirl_${st}`] = whirl(st);
  shen.moves[`vault_${st}`] = vault(st);
}

// 百裂棍：連續戳刺
{
  const seq = [[1, 4], [2, 4]];
  const hits = [];
  let t = 9;
  for (let i = 0; i < 7; i++) {
    seq.push([4, 3], [5, 3]);
    const last = i === 6;
    hits.push({ ...S.M, t: [t, t + 3], box: [20, 130, 320, 90], autoBox: false, dmg: last ? 80 : 30, chip: 9, stun: 20, hs: last ? 30 : 22, bs: 12, push: last ? 8 : 0.5,
      kd: last, launch: last ? [7, 9] : null, guard: 'mid', react: 'body', hitstop: last ? 'SU' : 'M', superHit: true });
    t += 6;
  }
  seq.push([6, 10], [7, 10]);
  shen.moves.super = { type: 'super', anim: 'sp1', meter: 100, ...W, seq, vel: [[5, 12, 3]], inv: [[1, 12, 'all']], hits, sound: 'super' };
}

export default shen;
