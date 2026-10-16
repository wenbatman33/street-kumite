// 角色註冊：合併普通技、投技、必殺技成單一 moves 表
import tora from './tora.js';
import vera from './vera.js';
import baatar from './baatar.js';
import skye from './skye.js';
import kagero from './kagero.js';
import shen from './shen.js';
import drake from './drake.js';
import kanya from './kanya.js';
import { MASS_FRAMES, THROW_FWD, THROW_BACK } from './common.js';

export const CHARS = { tora, vera, baatar, skye, kagero, shen, drake, kanya };
export const CHAR_IDS = Object.keys(CHARS);

// 空中翻轉、橫躺類影格改用重心錨點
vera.massFrames = { sp2: [3, 4, 5, 6] };
kagero.massFrames = { sp2: [3, 4, 5, 6] };
shen.massFrames = { sp3: [3, 4, 5] };
kanya.massFrames = { sp1: [3, 4, 5] };

// 招式強度：必殺技 xxx_L/M/H、普通技 5LP/2MK/jHP 的 L/M/H
const strengthOf = (name) => { const m = /_([LMH])$/.exec(name) || /^[25j]([LMH])[PK]$/.exec(name); return m ? m[1] : null; };
// 必殺技輕中重差異拉大：輕＝慢、近、小，重＝快、遠、大
const SP_SPEED = { L: 0.9, M: 1, H: 1.1 };
const SP_SIZE = { L: 0.84, M: 1, H: 1.2 };
const SP_DMG = { L: 0.9, M: 1, H: 1.1 };      // 飛行道具傷害（角色檔裡三種強度同傷害，這裡補上差異）

for (const c of Object.values(CHARS)) {
  // 一般投技：套用共用的前摔／背摔演出，保留角色自己的傷害、暈眩、音效等數值
  const own = c.throw.onGrab;
  const keep = { dmg: own.dmg, stun: own.stun, sound: own.sound, noTech: own.noTech };
  c.throw.onGrab = { ...THROW_FWD, ...keep };
  c.throw.onGrabBack = { ...THROW_BACK, ...keep };
  c.moves = { ...c.normals, ...c.moves, throw: c.throw };
  c.massFrames = { ...MASS_FRAMES, ...(c.massFrames || {}) };
  c.spriteAdj = c.spriteAdj || {};          // 每個動畫的 dx/dy/scale 微調（DEV 工具）
  for (const [name, m] of Object.entries(c.moves)) {
    m.name = name;
    m.st = strengthOf(name);
    if (m.st) {
      for (const h of m.hits || []) h.st = h.st || m.st;
      if (m.proj) { m.proj.hit.st = m.st; if (m.proj.multi && m.proj.multi.last) m.proj.multi.last.st = m.st; }
    }
    if (m.type === 'special' && m.st) {
      for (const h of m.hits || []) h.sp = true;
      if (m.proj) { m.proj.hit.sp = true; if (m.proj.multi && m.proj.multi.last) m.proj.multi.last.sp = true; }
      const k = SP_SPEED[m.st];
      if (m.vel) m.vel = m.vel.map(([a, b, v]) => [a, b, v * k]);
      if (m.proj) {
        const z = SP_SIZE[m.st];
        m.proj.vx *= k;
        m.proj.scale = (m.proj.scale || 1) * z;
        m.proj.box = m.proj.box.map((v) => Math.round(v * z));
        if (m.proj.hit.dmg) m.proj.hit.dmg = Math.round(m.proj.hit.dmg * SP_DMG[m.st]);
      }
    }
    refreshMove(m);
    // 角色整體傷害倍率（平衡用）
    if (c.dmgMul) {
      const mul = (h) => { if (h && h.dmg) h.dmg = Math.round(h.dmg * c.dmgMul); };
      (m.hits || []).forEach(mul);
      if (m.proj) { mul(m.proj.hit); if (m.proj.multi) mul(m.proj.multi.last); }
      if (m.onGrab) mul(m.onGrab);
      if (m.onGrabBack) mul(m.onGrabBack);
    }
  }
}

// DEV 工具修改招式後重新計算衍生值
export function refreshMove(m) {
  m.total = m.seq.reduce((s, e) => s + e[1], 0);
  m.lastActive = Math.max(0, ...(m.hits || []).map((h) => h.t[1]));
  m.firstActive = (m.hits && m.hits.length) ? Math.min(...m.hits.map((h) => h.t[0])) : (m.proj ? m.proj.t : m.grab ? m.grab.t[0] : 0);
}
