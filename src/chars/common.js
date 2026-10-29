// 角色共用：時間軸工具、狀態動畫對照、通用普通技模板
// 世界座標：x 向前為正（依面向翻轉）、y 向上為正、角色站姿身高 300
// 判定框 box = [前方起點, 離地高度, 寬, 高]

// 把幾段 [影格陣列, tick 數] 展開成 seq：[[影格, tick], ...]，tick 平均分給該段影格
export function timeline(...parts) {
  const seq = [];
  for (const [frames, ticks, anim] of parts) {
    if (!ticks) continue;
    const n = frames.length;
    let used = 0;
    frames.forEach((f, i) => {
      const t = Math.round((ticks * (i + 1)) / n) - used;
      used += t;
      if (t > 0) seq.push(anim ? [f, t, anim] : [f, t]);
    });
  }
  return seq;
}

// 普通技：起手 S（第 S tick 判定出現）、持續 A、收招 R
export function normal(anim, { pre, act, rec }, S, A, R, hit, extra = {}) {
  const seq = timeline([pre, S - 1], [act, A], [rec, R]);
  return {
    type: 'normal', anim, seq, cancel: true,
    hits: [{ t: [S, S + A - 1], ...hit }],
    ...extra,
  };
}

// 狀態動畫（兩位角色的 strip 結構相同）
export const STATE_ANIMS = {
  idle:   { a: 'idle', f: [0, 1, 2, 3, 4, 5], fps: 9, loop: true },
  walkF:  { a: 'walk', f: [0, 1, 2, 3, 4, 5, 6, 7], fps: 14, loop: true },
  walkB:  { a: 'walk', f: [7, 6, 5, 4, 3, 2, 1, 0], fps: 11, loop: true },
  crouchDown: { a: 'crouch', f: [1], fps: 30 },
  crouch: { a: 'crouch', f: [2, 3], fps: 3, loop: true },
  standUp: { a: 'crouch', f: [1], fps: 30 },
  prejump: { a: 'jump', f: [1] },
  jumpUp: { a: 'jump', f: [2, 3], fps: 8 },
  apex:   { a: 'jump', f: [4] },
  fall:   { a: 'jump', f: [5, 6], fps: 6 },
  land:   { a: 'jump', f: [7] },
  guardHi: { a: 'block', f: [1] },
  guardLo: { a: 'block', f: [3] },
  blockHi: { a: 'block', f: [2, 1], fps: 10 },
  blockLo: { a: 'block', f: [4, 3], fps: 10 },
  hitHigh: { a: 'hit', f: [1, 2], fps: 9 },
  hitBody: { a: 'hit', f: [3, 4], fps: 9 },
  hitLow:  { a: 'hit', f: [5, 6], fps: 9 },
  dizzy:  { a: 'hit', f: [7] },
  airHit: { a: 'down', f: [1] },
  airFall: { a: 'down', f: [2] },
  downSlam: { a: 'down', f: [3] },
  down:   { a: 'down', f: [4] },
  getup:  { a: 'down', f: [5, 6, 7], fps: 0 },     // fps 0 = 依狀態進度分配
  thrown: { a: 'hit', f: [3, 4], fps: 8 },
  // 被投演出姿勢（投技路徑的第 5 欄指定）
  thrownPull: { a: 'hit', f: [1] },
  thrownGut: { a: 'hit', f: [3, 4], fps: 10 },
  thrownUp: { a: 'down', f: [1] },
  thrownFly: { a: 'down', f: [2] },
  win:    { a: 'win', f: [0, 1, 2, 3, 4, 5], fps: 0 },
  intro:  { a: 'win', f: [2] },
};

// 以重心為錨點的影格（空中姿勢：避免縮腿／伸腿切換時身體跳動）
export const MASS_FRAMES = {
  jump: [2, 3, 4, 5, 6],
  jp: [1, 2, 3],
  jk: [1, 2, 3],
  down: [1, 2],
};

// 預設受擊框（無 sprite 時使用；有 sprite 時高度依影格自動計算）
export const HURT = {
  stand: [-40, 0, 80, 280],
  crouch: [-46, 0, 92, 170],
  air: [-38, 40, 76, 210],
  down: [-110, 0, 220, 60],
};

// 一般投技演出（所有角色共用骨架；傷害、暈眩、音效寫在角色檔）
// 街機原作的節奏：抓住瞬間定格 → 一個動作甩出去 → 重摔，整段約半秒，不拖泥帶水
// 投技動畫影格：1 伸手、2 抓住拉近、4 推出、5 收招
// path：[tick, 被投者在前方的距離, 高度, 旋轉角度（度，正值 = 往投技方前方翻）, 被投者姿勢 pull/gut/up/fly]
// 前投：抓住 → 往前上方甩出 → 摔在前方
export const THROW_FWD = {
  seq: [[2, 6], [4, 12], [5, 12]],
  path: [[0, 80, 0, 0, 'pull'], [5, 60, 0, 0, 'pull'], [8, 70, 60, 20, 'up'], [13, 150, 150, 50, 'fly'], [18, 225, 80, 45, 'fly'], [21, 255, 6, 30, 'fly']],
  hitT: 21, launch: [2.5, 6], hitstop: 12, shake: 10, dust: true, slam: true,
};
// 後投（按住「後」）：抓住 → 從頭上甩過去 → 摔在背後（左右換邊）
export const THROW_BACK = {
  seq: [[2, 5], [2, 6], [0, 16]],
  path: [[0, 80, 0, 0, 'pull'], [5, 50, 30, -20, 'up'], [9, 5, 190, -75, 'fly'], [14, -90, 140, -110, 'fly'], [18, -130, 6, -120, 'fly']],
  hitT: 18, launch: [-2.5, 6], hitstop: 12, shake: 10, dust: true, slam: true,
};

// 打擊強度共用值
export const STR = {
  L: { stun: 60, hs: 13, bs: 9, push: 4.5, hitstop: 'L', spark: 'L', meter: 4 },
  M: { stun: 100, hs: 17, bs: 13, push: 5.5, hitstop: 'M', spark: 'M', meter: 7 },
  H: { stun: 150, hs: 21, bs: 17, push: 7, hitstop: 'H', spark: 'H', meter: 10 },
};

// 兩位角色共用的普通技骨架（傷害與判定可在角色檔覆寫）
export function baseNormals(o = {}) {
  const L = STR.L, M = STR.M, H = STR.H;
  const lpF = { pre: [1], act: [2], rec: [3, 0] };
  const hpF = { pre: [1, 2], act: [3], rec: [4, 5] };
  const lkF = { pre: [1], act: [2], rec: [3] };
  const hkF = { pre: [1, 2], act: [3], rec: [4, 5] };
  const crpF = { pre: [1], act: [2], rec: [3, 1] };
  const crkF = { pre: [1], act: [2], rec: [3, 1] };
  const swF = { pre: [1, 2], act: [3], rec: [4, 5] };
  const jpF = { pre: [1, 2], act: [3], rec: [3] };
  const jkF = { pre: [1, 2], act: [3], rec: [3] };
  const jlF = { pre: [1], act: [2], rec: [2] };      // 跳輕：手腳半伸、出得快，判定小
  const n = {
    '5LP': normal('lp', lpF, 4, 3, 6, { ...L, box: [20, 205, 120, 50], dmg: 30, guard: 'mid', react: 'high' }),
    '5MP': normal('hp', { pre: [1], act: [3], rec: [4, 5] }, 6, 3, 11, { ...M, box: [20, 200, 135, 55], dmg: 60, guard: 'mid', react: 'high' }),
    '5HP': normal('hp', hpF, 9, 4, 19, { ...H, box: [20, 195, 150, 60], dmg: 100, guard: 'mid', react: 'high' }, { cancel: false }),
    '5LK': normal('lk', lkF, 5, 3, 8, { ...L, box: [20, 110, 125, 50], dmg: 35, guard: 'mid', react: 'body' }),
    '5MK': normal('lk', { pre: [0, 1], act: [2], rec: [3, 0] }, 7, 4, 13, { ...M, box: [20, 105, 150, 55], dmg: 65, guard: 'mid', react: 'body' }),
    '5HK': normal('hk', hkF, 10, 4, 20, { ...H, box: [20, 195, 175, 60], dmg: 105, guard: 'mid', react: 'high' }, { cancel: false }),
    '2LP': normal('crp', crpF, 4, 2, 7, { ...L, box: [20, 110, 120, 45], dmg: 25, guard: 'mid', react: 'high' }, { crouch: true }),
    '2MP': normal('crp', { pre: [1], act: [2], rec: [2, 3, 1] }, 6, 3, 11, { ...M, box: [20, 110, 135, 50], dmg: 55, guard: 'mid', react: 'high' }, { crouch: true }),
    '2HP': normal('crp', { pre: [1, 1], act: [2], rec: [2, 3, 1] }, 8, 5, 20, { ...H, box: [10, 120, 130, 120], dmg: 90, guard: 'mid', react: 'high' }, { crouch: true, cancel: false }),
    '2LK': normal('crk', crkF, 4, 2, 8, { ...L, box: [20, 0, 135, 40], dmg: 25, guard: 'low', react: 'low' }, { crouch: true }),
    '2MK': normal('crk', { pre: [1, 1], act: [2], rec: [2, 3, 1] }, 7, 3, 13, { ...M, box: [20, 0, 170, 40], dmg: 60, guard: 'low', react: 'low', maxReach: 205 }, { crouch: true }),
    '2HK': normal('sweep', swF, 9, 4, 24, { ...H, box: [20, 0, 200, 40], dmg: 100, guard: 'low', react: 'low', kd: true, launch: [3, 6], maxReach: 225 }, { crouch: true, cancel: false }),
    'jLP': normal('jp', jlF, 3, 9, 1, { ...L, box: [10, -10, 95, 70], dmg: 40, guard: 'high', react: 'high', maxReach: 150 }, { air: true, cancel: false }),
    'jMP': normal('jp', jpF, 5, 8, 1, { ...M, box: [10, -20, 115, 80], dmg: 70, guard: 'high', react: 'high' }, { air: true, cancel: false }),
    'jHP': normal('jp', jpF, 7, 7, 1, { ...H, box: [10, -40, 130, 100], dmg: 100, guard: 'high', react: 'high' }, { air: true, cancel: false, trail: true }),
    'jLK': normal('jk', jlF, 3, 9, 1, { ...L, box: [10, -30, 105, 70], dmg: 40, guard: 'high', react: 'high', maxReach: 160 }, { air: true, cancel: false }),
    'jMK': normal('jk', jkF, 5, 8, 1, { ...M, box: [10, -40, 130, 80], dmg: 70, guard: 'high', react: 'high' }, { air: true, cancel: false }),
    'jHK': normal('jk', jkF, 7, 7, 1, { ...H, box: [10, -50, 145, 100], dmg: 100, guard: 'high', react: 'high' }, { air: true, cancel: false, trail: true }),
  };
  // 空中技收招後維持最後一格直到落地
  for (const k of ['jLP', 'jMP', 'jHP', 'jLK', 'jMK', 'jHK']) n[k].holdLast = true;
  for (const [k, v] of Object.entries(o)) n[k] = deepMerge(n[k] || {}, v);
  return n;
}

// 招牌跳躍重攻擊：改用角色自己的必殺技影格（pre = 起手影格、act = 出招影格），S = 判定開始、A = 持續
// 空中技一律以重心為錨點，站姿影格在空中也不會錯位
export function airSig(anim, pre, act, S, A, hit = {}) {
  return { anim, seq: timeline([pre, S - 1], [act, A], [act.slice(-1), 1]), hits: [{ t: [S, S + A - 1], ...hit }], trail: true };
}

export function deepMerge(a, b) {
  const out = Array.isArray(a) ? a.slice() : { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) out[k] = deepMerge(a[k], v);
    // 物件陣列（如 hits）逐項合併；數值陣列（如 box）整個取代
    else if (Array.isArray(v) && Array.isArray(a[k]) && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) out[k] = a[k].map((x, i) => (v[i] ? deepMerge(x, v[i]) : x));
    else out[k] = v;
  }
  return out;
}

// 依按鍵取得強度
export const STRENGTH = { LP: 'L', MP: 'M', HP: 'H', LK: 'L', MK: 'M', HK: 'H' };
