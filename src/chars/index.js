// 角色註冊：合併普通技、投技、必殺技成單一 moves 表
import tora from './tora.js';
import vera from './vera.js';
import { MASS_FRAMES } from './common.js';

export const CHARS = { tora, vera };
export const CHAR_IDS = Object.keys(CHARS);

vera.massFrames = { sp2: [3, 4, 5, 6] };

for (const c of Object.values(CHARS)) {
  c.moves = { ...c.normals, ...c.moves, throw: c.throw };
  c.massFrames = { ...MASS_FRAMES, ...(c.massFrames || {}) };
  c.spriteAdj = c.spriteAdj || {};          // 每個動畫的 dx/dy/scale 微調（DEV 工具）
  for (const [name, m] of Object.entries(c.moves)) {
    m.name = name;
    m.total = m.seq.reduce((s, e) => s + e[1], 0);
    m.lastActive = Math.max(0, ...(m.hits || []).map((h) => h.t[1]));
    m.firstActive = (m.hits && m.hits.length) ? Math.min(...m.hits.map((h) => h.t[0])) : (m.proj ? m.proj.t : 0);
  }
}

// DEV 工具修改招式後重新計算衍生值
export function refreshMove(m) {
  m.total = m.seq.reduce((s, e) => s + e[1], 0);
  m.lastActive = Math.max(0, ...(m.hits || []).map((h) => h.t[1]));
  m.firstActive = (m.hits && m.hits.length) ? Math.min(...m.hits.map((h) => h.t[0])) : (m.proj ? m.proj.t : 0);
}
