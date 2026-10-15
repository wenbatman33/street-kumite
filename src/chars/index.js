// 角色註冊：合併普通技、投技、必殺技成單一 moves 表
import tora from './tora.js';
import vera from './vera.js';
import baatar from './baatar.js';
import skye from './skye.js';
import kagero from './kagero.js';
import shen from './shen.js';
import drake from './drake.js';
import kanya from './kanya.js';
import { MASS_FRAMES } from './common.js';

export const CHARS = { tora, vera, baatar, skye, kagero, shen, drake, kanya };
export const CHAR_IDS = Object.keys(CHARS);

// 空中翻轉、橫躺類影格改用重心錨點
vera.massFrames = { sp2: [3, 4, 5, 6] };
kagero.massFrames = { sp2: [3, 4, 5, 6] };
shen.massFrames = { sp3: [3, 4, 5] };
kanya.massFrames = { sp1: [3, 4, 5] };

for (const c of Object.values(CHARS)) {
  c.moves = { ...c.normals, ...c.moves, throw: c.throw };
  c.massFrames = { ...MASS_FRAMES, ...(c.massFrames || {}) };
  c.spriteAdj = c.spriteAdj || {};          // 每個動畫的 dx/dy/scale 微調（DEV 工具）
  for (const [name, m] of Object.entries(c.moves)) {
    m.name = name;
    refreshMove(m);
    // 角色整體傷害倍率（平衡用）
    if (c.dmgMul) {
      const mul = (h) => { if (h && h.dmg) h.dmg = Math.round(h.dmg * c.dmgMul); };
      (m.hits || []).forEach(mul);
      if (m.proj) { mul(m.proj.hit); if (m.proj.multi) mul(m.proj.multi.last); }
      if (m.onGrab) mul(m.onGrab);
    }
  }
}

// DEV 工具修改招式後重新計算衍生值
export function refreshMove(m) {
  m.total = m.seq.reduce((s, e) => s + e[1], 0);
  m.lastActive = Math.max(0, ...(m.hits || []).map((h) => h.t[1]));
  m.firstActive = (m.hits && m.hits.length) ? Math.min(...m.hits.map((h) => h.t[0])) : (m.proj ? m.proj.t : m.grab ? m.grab.t[0] : 0);
}
