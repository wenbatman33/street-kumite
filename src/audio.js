// 音效與音樂：全部用 Web Audio 即時合成（無外部音檔）；回合語音用瀏覽器 speechSynthesis
// 配樂：仿 90 年代街機 FM 音源的合成器（銅管、FM 貝斯、撥弦、弦樂墊底）+ 段落式編曲（前奏 / A / B），曲子皆為原創
import { GAME } from './config.js';

let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
let reverb = null, delay = null;
const CH = {};          // 配樂各聲部的混音通道

function init() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = GAME.volume;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  initMusicBus();
  return true;
}

// ---------- 音效用的基本音源 ----------
function noise(t, dur, { freq = 1200, q = 1, type = 'bandpass', gain = 0.5, sweep = null, bus = sfxBus } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

function tone(t, dur, { f0 = 200, f1 = 60, type = 'sine', gain = 0.6, bus = sfxBus } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// 命中音：輕＝清脆短促、中＝紮實、重＝低頻厚重；hitX = 重版必殺／超必殺（再加爆裂與餘震）
const SFX = {
  whiffL: (t) => noise(t, 0.08, { freq: 2600, sweep: 1000, q: 1.2, gain: 0.16 }),
  whiffM: (t) => noise(t, 0.13, { freq: 1900, sweep: 600, q: 1.1, gain: 0.22 }),
  whiffH: (t) => { noise(t, 0.22, { freq: 1400, sweep: 320, q: 0.9, gain: 0.3 }); tone(t, 0.18, { f0: 120, f1: 60, gain: 0.12 }); },
  hitL: (t) => { noise(t, 0.045, { freq: 3400, q: 1, gain: 0.42 }); tone(t, 0.05, { f0: 420, f1: 200, type: 'triangle', gain: 0.25 }); },
  hitM: (t) => { noise(t, 0.09, { freq: 1700, q: 0.8, gain: 0.6 }); tone(t, 0.12, { f0: 240, f1: 75, gain: 0.75 }); noise(t, 0.02, { freq: 4500, q: 0.7, gain: 0.2 }); },
  hitH: (t) => {
    noise(t, 0.16, { freq: 950, q: 0.6, gain: 0.75 });
    tone(t, 0.26, { f0: 160, f1: 40, gain: 1 });
    noise(t + 0.015, 0.3, { freq: 380, type: 'lowpass', gain: 0.5 });
    noise(t, 0.025, { freq: 5200, q: 0.7, gain: 0.35 });
  },
  hitX: (t) => {
    SFX.hitH(t);
    tone(t, 0.5, { f0: 95, f1: 26, gain: 0.95 });
    noise(t + 0.03, 0.55, { freq: 2600, sweep: 260, q: 0.5, gain: 0.32 });
  },
  powerH: (t) => { noise(t, 0.26, { freq: 380, sweep: 2800, q: 3, gain: 0.26 }); tone(t, 0.22, { f0: 170, f1: 520, type: 'sawtooth', gain: 0.07 }); },
  block: (t) => { noise(t, 0.06, { freq: 4200, q: 3, gain: 0.35 }); tone(t, 0.05, { f0: 900, f1: 500, type: 'square', gain: 0.08 }); },
  grab: (t) => { noise(t, 0.08, { freq: 900, q: 2, gain: 0.32 }); tone(t, 0.06, { f0: 300, f1: 160, gain: 0.3 }); },
  land: (t) => { tone(t, 0.28, { f0: 120, f1: 32, gain: 0.9 }); noise(t, 0.32, { freq: 300, type: 'lowpass', gain: 0.5 }); },
  fireball: (t) => { noise(t, 0.4, { freq: 600, sweep: 2400, q: 2, gain: 0.35 }); tone(t, 0.35, { f0: 110, f1: 220, type: 'sawtooth', gain: 0.12 }); },
  superball: (t) => { noise(t, 0.7, { freq: 300, sweep: 3000, q: 1.5, gain: 0.45 }); tone(t, 0.7, { f0: 70, f1: 300, type: 'sawtooth', gain: 0.2 }); },
  rise: (t) => noise(t, 0.3, { freq: 500, sweep: 3200, q: 1.5, gain: 0.3 }),
  spin: (t) => { for (let i = 0; i < 4; i++) noise(t + i * 0.1, 0.1, { freq: 1600, sweep: 700, gain: 0.18 }); },
  clash: (t) => { noise(t, 0.3, { freq: 2000, q: 0.5, gain: 0.5 }); tone(t, 0.3, { f0: 600, f1: 80, type: 'triangle', gain: 0.4 }); },
  super: (t) => {
    for (const [i, f] of [[0, 220], [1, 277], [2, 330], [3, 440]]) tone(t + i * 0.05, 0.6, { f0: f, f1: f * 2, type: 'sawtooth', gain: 0.09 });
    noise(t, 0.8, { freq: 200, sweep: 5000, q: 1, gain: 0.3 });
  },
  ko: (t) => { tone(t, 1.2, { f0: 140, f1: 28, gain: 1 }); noise(t, 1.0, { freq: 800, sweep: 120, type: 'lowpass', gain: 0.6 }); },
  fight: (t) => tone(t, 0.3, { f0: 300, f1: 600, type: 'square', gain: 0.08 }),
  move: (t) => tone(t, 0.05, { f0: 880, f1: 880, type: 'square', gain: 0.06 }),
  ok: (t) => { tone(t, 0.08, { f0: 660, f1: 660, type: 'square', gain: 0.08 }); tone(t + 0.07, 0.12, { f0: 990, f1: 990, type: 'square', gain: 0.08 }); },
  back: (t) => tone(t, 0.1, { f0: 440, f1: 220, type: 'square', gain: 0.07 }),
};

// =====================================================================
// 配樂
// =====================================================================

// 混音：各聲部通道 → 音樂總線（壓縮）→ 主音量；另有殘響與延遲送出
export const MIX = {
  music: 0.42,
  kick: 1, snare: 0.75, hat: 0.3, perc: 0.55, bass: 0.85, lead: 0.5, pad: 0.3, arp: 0.28, stab: 0.36, gtr: 0.32,
};

function initMusicBus() {
  musicBus = ctx.createGain();
  musicBus.gain.value = MIX.music;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.15;
  musicBus.connect(comp).connect(master);
  // 殘響：雜訊衰減做成的脈衝響應
  reverb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 1.8);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  reverb.buffer = ir;
  const revOut = ctx.createGain();
  revOut.gain.value = 0.5;
  reverb.connect(revOut).connect(musicBus);
  // 延遲（附點八分，曲子切換時重設時間）
  delay = ctx.createDelay(1.5);
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const dlf = ctx.createBiquadFilter();
  dlf.type = 'lowpass';
  dlf.frequency.value = 2600;
  delay.connect(dlf).connect(fb).connect(delay);
  dlf.connect(musicBus);
  const mk = (name, pan, rev, dly) => {
    const g = ctx.createGain();
    g.gain.value = MIX[name];
    let out = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    out.connect(musicBus);
    if (rev) { const s = ctx.createGain(); s.gain.value = rev; out.connect(s).connect(reverb); }
    if (dly) { const s = ctx.createGain(); s.gain.value = dly; out.connect(s).connect(delay); }
    CH[name] = g;
  };
  mk('kick', 0, 0.04, 0); mk('snare', 0, 0.25, 0); mk('hat', 0.25, 0.04, 0); mk('perc', -0.25, 0.25, 0);
  mk('bass', 0, 0, 0); mk('lead', 0.05, 0.28, 0.24); mk('pad', 0, 0.45, 0); mk('arp', -0.3, 0.2, 0.22);
  mk('stab', 0.2, 0.22, 0); mk('gtr', -0.15, 0.12, 0);
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ADSR：a 起音、d 衰減、s 持續比例、r 釋放；dur = 按住多久
function adsr(p, t, dur, peak, a, d, s, r) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(Math.max(0.0001, peak * s), t + a, Math.max(0.005, d / 3));
  p.setTargetAtTime(0.0001, t + Math.max(dur, a), Math.max(0.005, r / 3));
}

// 2-op FM：調變器 → 載波頻率（90 年代街機 FM 音源的質感）
function fm(ch, t, dur, n, o = {}) {
  const { ratio = 1, index = 2, idxEnd = index, idxT = 0.15, a = 0.005, d = 0.2, s = 0.6, r = 0.1, gain = 0.3, vib = 0, detune = 0, glide = null } = o;
  const f = midi(n);
  const car = ctx.createOscillator();
  car.frequency.setValueAtTime(glide ? midi(glide) : f, t);
  if (glide) car.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  car.detune.value = detune;
  const mod = ctx.createOscillator();
  mod.frequency.value = f * ratio;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * index, t);
  mg.gain.linearRampToValueAtTime(f * idxEnd, t + idxT);
  mod.connect(mg).connect(car.frequency);
  const g = ctx.createGain();
  adsr(g.gain, t, dur, gain, a, d, s, r);
  car.connect(g).connect(ch);
  const end = t + dur + r + 0.1;
  if (vib) vibrato(car, t, dur, vib, end);
  car.start(t); mod.start(t);
  car.stop(end); mod.stop(end);
}

// 延遲進來的抖音（長音才明顯）
function vibrato(osc, t, dur, cents, end, rate = 5.6) {
  const l = ctx.createOscillator();
  l.frequency.value = rate;
  const lg = ctx.createGain();
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(0, t + Math.min(0.18, dur * 0.5));
  lg.gain.linearRampToValueAtTime(cents, t + Math.min(0.45, dur * 0.9) + 0.01);
  l.connect(lg).connect(osc.detune);
  l.start(t);
  l.stop(end);
}

// 減法合成：多顆鋸齒／方波微走音疊加 → 低通濾波（濾波器也有包絡）
function sub(ch, t, dur, n, o = {}) {
  const { wave = 'sawtooth', voices = [-8, 8], cutoff = 2400, cutStart = cutoff, cutT = 0.1, q = 0.8, a = 0.01, d = 0.2, s = 0.7, r = 0.12, gain = 0.2, vib = 0, glide = null, shaper = null } = o;
  const f = midi(n);
  const flt = ctx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.Q.value = q;
  flt.frequency.setValueAtTime(cutStart, t);
  flt.frequency.exponentialRampToValueAtTime(cutoff, t + cutT);
  const g = ctx.createGain();
  adsr(g.gain, t, dur, gain / Math.sqrt(voices.length), a, d, s, r);
  let head = flt;
  if (shaper) { const ws = ctx.createWaveShaper(); ws.curve = shaper; ws.oversample = '2x'; ws.connect(flt); head = ws; }
  flt.connect(g).connect(ch);
  const end = t + dur + r + 0.1;
  for (const dt of voices) {
    const o2 = ctx.createOscillator();
    o2.type = wave;
    o2.frequency.setValueAtTime(glide ? midi(glide) : f, t);
    if (glide) o2.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    o2.detune.value = dt;
    if (vib) vibrato(o2, t, dur, vib, end, 6);
    o2.connect(head);
    o2.start(t);
    o2.stop(end);
  }
}

let distCurve = null;
function dist() {
  if (distCurve) return distCurve;
  distCurve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; distCurve[i] = Math.tanh(x * 6) * 0.8; }
  return distCurve;
}

// ---------- 樂器 ----------
const INST = {
  // FM 銅管主旋律（雙載波微走音，厚一點）
  brass: (t, d, n, o) => {
    fm(CH.lead, t, d, n, { ratio: 1, index: 0.4, idxEnd: 2.4, idxT: 0.06, a: 0.02, d: 0.3, s: 0.78, r: 0.12, gain: 0.3, vib: 16, glide: o.glide });
    fm(CH.lead, t, d, n, { ratio: 1, index: 0.3, idxEnd: 1.6, idxT: 0.08, a: 0.03, d: 0.3, s: 0.7, r: 0.12, gain: 0.16, detune: 9 });
  },
  // 方波主旋律（明亮、帶滑音）
  square: (t, d, n, o) => sub(CH.lead, t, d, n, { wave: 'square', voices: [-7, 7], cutoff: 3800, cutStart: 6000, a: 0.005, d: 0.25, s: 0.75, r: 0.09, gain: 0.2, vib: 18, glide: o.glide }),
  // 撥弦（古箏／三味線感）：FM 調變量快速衰減
  pluck: (t, d, n) => fm(CH.lead, t, Math.min(d, 0.5), n, { ratio: 3, index: 4.5, idxEnd: 0.4, idxT: 0.25, a: 0.002, d: 0.6, s: 0.0, r: 0.35, gain: 0.34 }),
  // 笛：接近正弦 + 一點 FM 和氣音
  flute: (t, d, n, o) => {
    fm(CH.lead, t, d, n, { ratio: 1, index: 0.25, idxEnd: 0.5, idxT: 0.2, a: 0.06, d: 0.3, s: 0.85, r: 0.15, gain: 0.32, vib: 22, glide: o.glide });
    noise(t, Math.min(0.12, d), { freq: midi(n) * 2, q: 4, gain: 0.04, bus: CH.lead });
  },
  // 擦弦（二胡／馬頭琴）：鋸齒 + 慢起音 + 大抖音 + 滑音
  fiddle: (t, d, n, o) => sub(CH.lead, t, d, n, { wave: 'sawtooth', voices: [-5, 5], cutoff: 2300, cutStart: 900, cutT: 0.12, q: 1.6, a: 0.07, d: 0.4, s: 0.85, r: 0.18, gain: 0.26, vib: 30, glide: o.glide }),
  // 琶音鐘聲
  bell: (t, d, n) => fm(CH.arp, t, Math.min(d, 0.3), n, { ratio: 3.5, index: 1.8, idxEnd: 0.2, idxT: 0.3, a: 0.002, d: 0.4, s: 0, r: 0.4, gain: 0.22 }),
  // 琶音撥弦（較暗）
  harp: (t, d, n) => fm(CH.arp, t, Math.min(d, 0.3), n, { ratio: 2, index: 2.5, idxEnd: 0.2, idxT: 0.2, a: 0.002, d: 0.35, s: 0, r: 0.3, gain: 0.22 }),
  // FM 貝斯（起音帶「啪」的金屬感）+ 次低音
  bass: (t, d, n) => {
    fm(CH.bass, t, d, n, { ratio: 1, index: 3.2, idxEnd: 0.8, idxT: 0.08, a: 0.003, d: 0.25, s: 0.55, r: 0.05, gain: 0.42 });
    fm(CH.bass, t, d, n - 12, { ratio: 1, index: 0, a: 0.003, d: 0.3, s: 0.7, r: 0.05, gain: 0.2 });
  },
  // 弦樂墊底
  strings: (t, d, n) => sub(CH.pad, t, d, n, { wave: 'sawtooth', voices: [-12, 0, 12], cutoff: 1500, q: 0.5, a: 0.35, d: 0.5, s: 0.85, r: 0.5, gain: 0.16 }),
  // 銅管和弦短打
  stab: (t, d, n) => fm(CH.stab, t, Math.min(d, 0.14), n, { ratio: 1, index: 1.2, idxEnd: 2.6, idxT: 0.04, a: 0.006, d: 0.1, s: 0.5, r: 0.08, gain: 0.2 }),
  // 破音吉他（強力和弦用）
  gtr: (t, d, n) => sub(CH.gtr, t, d, n, { wave: 'sawtooth', voices: [-6, 6], cutoff: 2600, q: 0.7, a: 0.004, d: 0.3, s: 0.6, r: 0.06, gain: 0.22, shaper: dist() }),
};

// ---------- 鼓組 ----------
function kick(t, v = 1) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(165, t);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.95 * v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  o.connect(g).connect(CH.kick);
  o.start(t); o.stop(t + 0.35);
  noise(t, 0.012, { freq: 3000, q: 0.7, gain: 0.25 * v, bus: CH.kick });
}
function snare(t, v = 1) {
  noise(t, 0.17, { freq: 1900, q: 0.7, gain: 0.65 * v, bus: CH.snare });
  noise(t, 0.09, { freq: 5500, type: 'highpass', gain: 0.25 * v, bus: CH.snare });
  tone(t, 0.1, { f0: 200, f1: 150, type: 'triangle', gain: 0.45 * v, bus: CH.snare });
}
function hat(t, open = false, v = 1) { noise(t, open ? 0.24 : 0.035, { freq: 8200, type: 'highpass', gain: (open ? 0.35 : 0.3) * v, bus: CH.hat }); }
function clap(t, v = 1) { for (let i = 0; i < 3; i++) noise(t + i * 0.011, i === 2 ? 0.13 : 0.02, { freq: 1300, q: 1.2, gain: 0.45 * v, bus: CH.perc }); }
function tom(t, n, v = 1) { tone(t, 0.3, { f0: midi(n), f1: midi(n) * 0.62, gain: 0.7 * v, bus: CH.perc }); noise(t, 0.04, { freq: 900, q: 1, gain: 0.12 * v, bus: CH.perc }); }
function taiko(t, v = 1) { tone(t, 0.55, { f0: 95, f1: 55, gain: 0.95 * v, bus: CH.perc }); noise(t, 0.08, { freq: 500, type: 'lowpass', gain: 0.35 * v, bus: CH.perc }); }
function crash(t) { noise(t, 1.5, { freq: 4500, type: 'highpass', gain: 0.32, bus: CH.hat }); noise(t, 0.6, { freq: 7000, q: 0.5, gain: 0.15, bus: CH.hat }); }
function shaker(t, v = 1) { noise(t, 0.05, { freq: 6000, q: 1.5, gain: 0.16 * v, bus: CH.perc }); }
function gong(t) {
  for (const [r, gn] of [[1, 0.35], [1.48, 0.18], [2.13, 0.12], [2.9, 0.08]]) tone(t, 3.2, { f0: 98 * r, f1: 96 * r, gain: gn, bus: CH.perc });
  noise(t, 0.4, { freq: 300, type: 'lowpass', gain: 0.25, bus: CH.perc });
}

// 16 格節奏（x = 打、o = 開放鈸／重音、. = 空）。k 大鼓、s 小鼓、h 鈸、c 拍手、t 中鼓、w 太鼓、z 沙鈴
const DRUMS = {
  half: { k: 'x.........x.....', s: '........x.......', h: 'x...x...x...x...' },
  rock: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  drive: { k: 'x.....x.x.....x.', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' },
  four: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.o.x.o.x.o.x.o.' },
  samba: { k: 'x..x....x..x....', s: '......x.......x.', h: '', c: '....x.......x...', z: 'xxxxxxxxxxxxxxxx', t: '...x..x....x..x.' },
  gallop: { k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', t: '..........x..x.x' },
  breakb: { k: 'x.........x..x..', s: '....x..x.x..x...', h: 'x.x.x.x.x.x.x.xo', w: 'x.......x.......' },
  taiko: { w: 'x...x...x.x.x...', h: '', k: '' },
  temple: { k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.', t: '..............xx' },
};
// 段落最後一小節的過門（最後 4 格）
const FILL = { s: '............x.xx', t: '............xxxx' };

// 貝斯節奏：[格, 長度, 相對和弦根音的半音]
const BASS = {
  pedal: [[0, 16, 0]],
  half: [[0, 6, 0], [6, 2, 0], [8, 6, 7], [14, 2, 0]],
  drive: [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, 2, 0]),
  octave: [0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => [s, 2, i % 2 ? 12 : 0]),
  funk: [[0, 3, 0], [3, 1, 12], [6, 2, 0], [8, 1, 12], [10, 2, 7], [12, 2, 0], [14, 1, 10], [15, 1, 12]],
  samba: [[0, 3, 0], [3, 1, 0], [4, 4, 7], [8, 3, 0], [11, 1, 0], [12, 4, 7]],
  gallop: [[0, 1, 0], [2, 1, 0], [3, 1, 0], [4, 1, 7], [6, 1, 0], [7, 1, 0], [8, 1, 0], [10, 1, 0], [11, 1, 0], [12, 1, 7], [14, 1, 5], [15, 1, 7]],
};

// 琶音：和弦音索引（0 根音、1 三音、2 五音、3 八度），null = 休止；每格一個 16 分音符
const ARPS = {
  up16: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3],
  up8: [0, null, 1, null, 2, null, 3, null, 2, null, 1, null, 2, null, 3, null],
  koto: [3, 2, 0, null, 2, null, 1, 0, 3, 2, 0, null, 1, null, 2, 3],
  roll: [0, 2, 3, 2, 1, 2, 3, 2, 0, 2, 3, 2, 1, 2, 3, 2],
};
// 銅管短打位置
const STABS = {
  push: '......x.......x.',
  funk: 'x.....x...x..x..',
  off: '..x...x...x...x.',
  bossa: 'x..x..x...x..x..',
};
// 破音吉他強力和弦（x 長、m 悶音短打）
const GTR = {
  chug: 'mmmxmmmxmmmxmmxm',
  power: 'x.....x.x.......',
};

// ---------- 樂譜解析 ----------
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteNum(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('音符格式錯誤：' + s);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
function chord(name) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(name);
  const pc = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const q = m[3];
  let iv = [0, 4, 7];
  if (/^m(?!aj)/.test(q)) iv = [0, 3, 7];
  if (q.includes('dim')) iv = [0, 3, 6];
  if (q.includes('sus')) iv = [0, 5, 7];
  if (q === '5') iv = [0, 7, 12];
  return { pc, iv, name };
}
// 旋律：「音名:長度」（長度以 16 分音符計），- = 休止、~ = 延長上一個音，| 只是方便閱讀的小節線
function melody(str) {
  const out = [];
  let step = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') continue;
    const [n, l] = tok.split(':');
    const len = Number(l);
    if (n === '~') { out[out.length - 1].len += len; step += len; continue; }
    if (n !== '-') out.push({ step, len, n: noteNum(n) });
    step += len;
  }
  return { notes: out, steps: step };
}

// =====================================================================
// 曲目（全部原創）。每段：bars 小節數、chords 每小節一個和弦、drums/bass 節奏型、
// lead 旋律 + inst 樂器、arp 琶音、stab 銅管短打、gtr 吉他、pad 弦樂墊底、crash 段落開頭鈸
// =====================================================================
const SONGS_SRC = [
  {
    name: 'Neon Night Market（霓虹夜市）', bpm: 148, delay: 3, order: ['I', 'A', 'B', 'A', 'C'], loop: 1,
    sec: {
      I: { bars: 2, chords: 'Am G', drums: 'half', bass: 'pedal', arp: 'up16', arpInst: 'bell', pad: true },
      A: {
        bars: 8, chords: 'Am F G Em Am F G E', drums: 'drive', bass: 'octave', stab: 'push', pad: true, crash: true, inst: 'brass',
        lead: `E5:3 E5:1 D5:2 E5:2 A5:4 G5:2 E5:2 | F5:3 E5:1 D5:2 C5:2 D5:4 -:4 | D5:3 D5:1 C5:2 D5:2 G5:4 F5:2 D5:2 | E5:8 B4:4 -:4 |
               E5:3 E5:1 D5:2 E5:2 A5:4 B5:2 C6:2 | C6:3 B5:1 A5:2 G5:2 A5:4 F5:4 | G5:3 F5:1 E5:2 D5:2 E5:2 F5:2 G5:2 B5:2 | G#5:8 -:4 E5:2 G#5:2`,
      },
      B: {
        bars: 8, chords: 'Dm G C Am Dm G E E', drums: 'four', bass: 'funk', arp: 'up8', arpInst: 'bell', stab: 'off', pad: true, crash: true, inst: 'brass',
        lead: `A5:2 A5:2 -:2 F5:2 A5:2 C6:4 A5:2 | B5:4 G5:2 D5:2 G5:8 | G5:2 G5:2 -:2 E5:2 G5:2 C6:4 B5:2 | C6:4 A5:4 E5:8 |
               F5:2 F5:2 -:2 E5:2 F5:2 A5:4 D6:2 | D6:4 C6:2 B5:2 G5:4 B5:4 | B5:4 G#5:4 E5:4 D6:4 | C6:2 B5:2 A5:2 G#5:2 B5:8`,
      },
      C: { bars: 4, chords: 'Am F G E', drums: 'half', bass: 'half', arp: 'up16', arpInst: 'bell', pad: true, crash: true },
    },
  },
  {
    name: 'Sunset Roda（夕陽廣場）', bpm: 128, swing: 0.1, delay: 3, order: ['I', 'A', 'B', 'A'], loop: 1,
    sec: {
      I: { bars: 2, chords: 'D C', drums: 'samba', bass: 'pedal', stab: 'bossa' },
      A: {
        bars: 8, chords: 'D C G D D C G A', drums: 'samba', bass: 'samba', stab: 'bossa', crash: true, inst: 'square',
        lead: `F#5:2 A5:2 -:1 F#5:1 A5:2 B5:2 A5:2 F#5:4 | G5:2 E5:2 -:1 C5:1 E5:2 G5:4 E5:4 | D5:2 G5:2 -:1 B5:1 D6:2 B5:2 A5:2 G5:4 | A5:6 F#5:2 D5:8 |
               F#5:2 A5:2 -:1 F#5:1 A5:2 D6:4 C#6:2 B5:2 | C6:2 G5:2 -:1 E5:1 G5:2 C6:4 B5:2 A5:2 | B5:4 G5:2 B5:2 D6:4 B5:4 | A5:8 E5:4 C#5:4`,
      },
      B: {
        bars: 8, chords: 'Bm G D A Bm G Em A', drums: 'samba', bass: 'samba', arp: 'up8', arpInst: 'harp', pad: true, crash: true, inst: 'brass',
        lead: `D6:3 C#6:1 B5:4 F#5:4 B5:4 | G5:3 A5:1 B5:4 D6:8 | F#6:3 E6:1 D6:4 A5:8 | C#6:4 B5:2 A5:2 E5:8 |
               D6:3 C#6:1 B5:4 F#5:4 B5:2 C#6:2 | D6:4 B5:4 G5:4 B5:4 | E6:3 D6:1 B5:4 G5:2 A5:2 B5:4 | A5:4 C#6:4 E6:8`,
      },
    },
  },
  {
    name: 'Great Steppe（草原祭典）', bpm: 132, delay: 3, order: ['I', 'A', 'B', 'A'], loop: 1,
    sec: {
      I: { bars: 2, chords: 'Gm Gm', drums: 'taiko', bass: 'pedal', pad: true },
      A: {
        bars: 8, chords: 'Gm Gm F Gm Eb F Gm Gm', drums: 'gallop', bass: 'gallop', pad: true, crash: true, inst: 'fiddle',
        lead: `D5:4 F5:2 G5:2 F5:2 D5:2 C5:4 | Bb4:2 C5:2 D5:4 G4:8 | C5:4 D5:2 F5:2 G5:4 F5:4 | D5:12 -:4 |
               G5:4 Bb5:2 G5:2 F5:4 Eb5:4 | F5:4 G5:2 F5:2 D5:4 C5:4 | Bb4:4 C5:2 D5:2 F5:2 D5:2 C5:2 Bb4:2 | G4:12 -:4`,
      },
      B: {
        bars: 8, chords: 'Cm Cm Bb F Eb F Gm D', drums: 'gallop', bass: 'gallop', stab: 'push', pad: true, crash: true, inst: 'brass',
        lead: `G5:6 Eb5:2 G5:4 C6:4 | Bb5:4 G5:4 Eb5:8 | F5:6 D5:2 F5:4 Bb5:4 | A5:8 C6:4 A5:4 |
               G5:4 Bb5:4 Eb6:4 D6:4 | C6:4 A5:4 F5:4 C6:4 | D6:4 Bb5:4 G5:4 Bb5:4 | A5:4 F#5:4 D5:8`,
      },
    },
  },
  {
    name: 'Frozen Harbor（極光港口）', bpm: 160, delay: 3, order: ['I', 'A', 'B', 'A'], loop: 1,
    sec: {
      I: { bars: 2, chords: 'Bm Bm', drums: 'half', bass: 'drive', gtr: 'chug' },
      A: {
        bars: 8, chords: 'Bm G A F#m Bm G A F#', drums: 'drive', bass: 'drive', gtr: 'chug', arp: 'up16', arpInst: 'bell', crash: true, inst: 'square',
        lead: `F#5:2 F#5:2 B5:2 F#5:2 D6:3 C#6:1 B5:2 A5:2 | B5:4 G5:2 D5:2 G5:2 A5:2 B5:4 | A5:2 A5:2 E6:2 A5:2 C#6:3 B5:1 A5:2 G5:2 | F#5:8 C#5:4 E5:4 |
               F#5:2 F#5:2 B5:2 F#5:2 D6:3 C#6:1 B5:2 D6:2 | E6:4 D6:2 B5:2 G5:4 B5:4 | C#6:4 A5:2 E5:2 A5:2 B5:2 C#6:4 | A#5:8 F#5:4 C#6:4`,
      },
      B: {
        bars: 8, chords: 'G A Bm Bm G A F# F#', drums: 'four', bass: 'octave', gtr: 'power', pad: true, crash: true, inst: 'brass',
        lead: `D6:6 B5:2 G5:4 D6:4 | E6:6 C#6:2 A5:4 E6:4 | F#6:8 D6:4 B5:4 | C#6:2 D6:2 C#6:2 B5:2 A5:4 F#5:4 |
               G5:2 B5:2 D6:2 G6:2 F#6:4 D6:4 | E6:2 C#6:2 A5:2 E6:2 G6:4 E6:4 | F#6:4 E6:2 C#6:2 A#5:4 C#6:4 | F#6:12 -:4`,
      },
    },
  },
  {
    name: 'Moonlit Roofs（月下屋頂）', bpm: 152, delay: 3, order: ['I', 'A', 'B', 'A'], loop: 1,
    sec: {
      I: { bars: 2, chords: 'Em Em', drums: 'taiko', bass: 'pedal', arp: 'koto', arpInst: 'harp' },
      A: {
        bars: 8, chords: 'Em F Em Am Em F C B', drums: 'breakb', bass: 'funk', arp: 'koto', arpInst: 'harp', crash: true, inst: 'pluck',
        lead: `E5:2 F5:2 A5:2 B5:4 A5:2 F5:2 E5:2 | F5:4 E5:2 C5:2 A4:4 C5:4 | B4:2 C5:2 E5:2 F5:4 E5:2 C5:2 B4:2 | A4:12 -:4 |
               E5:2 F5:2 A5:2 B5:4 C6:2 B5:2 A5:2 | C6:4 B5:2 A5:2 F5:4 A5:4 | E5:4 F5:2 E5:2 C5:4 B4:4 | B4:12 -:4`,
      },
      B: {
        bars: 8, chords: 'Am Am F F C C B B', drums: 'breakb', bass: 'octave', pad: true, crash: true, inst: 'flute',
        lead: `A5:8 C6:4 B5:4 | A5:4 F5:4 E5:8 | F5:8 A5:4 C6:4 | B5:4 A5:4 F5:8 |
               E6:8 C6:4 B5:4 | C6:4 A5:4 E5:8 | F5:4 E5:4 D#5:8 | B4:4 D#5:4 F#5:4 B5:4`,
      },
    },
  },
  {
    name: 'Cloud Temple（雲海寺院）', bpm: 120, delay: 3, order: ['I', 'A', 'B', 'A'], loop: 1, gong: true,
    sec: {
      I: { bars: 2, chords: 'Dm Dm', drums: 'taiko', bass: 'pedal', arp: 'roll', arpInst: 'harp', pad: true },
      A: {
        bars: 8, chords: 'Dm C Bb C Dm C Bb A', drums: 'temple', bass: 'half', arp: 'up8', arpInst: 'harp', pad: true, crash: true, inst: 'fiddle',
        lead: `A5:4 C6:2 A5:2 G5:4 F5:4 | G5:4 A5:2 G5:2 E5:4 C5:4 | D5:4 F5:2 G5:2 F5:4 D5:4 | C5:8 E5:4 G5:4 |
               A5:4 C6:2 D6:2 C6:4 A5:4 | G5:4 E5:2 G5:2 C6:4 G5:4 | F5:4 D5:4 Bb4:4 D5:4 | E5:8 C#5:4 A4:4`,
      },
      B: {
        bars: 8, chords: 'Gm A Dm Dm Bb C A A', drums: 'rock', bass: 'drive', arp: 'up16', arpInst: 'harp', stab: 'push', pad: true, crash: true, inst: 'flute',
        lead: `D6:6 C6:2 Bb5:4 G5:4 | A5:6 G5:2 E5:4 C#5:4 | D5:4 F5:4 A5:4 D6:4 | F6:8 E6:4 D6:4 |
               D6:4 Bb5:4 F5:4 Bb5:4 | C6:4 G5:4 E5:4 G5:4 | A5:4 C#6:4 E6:4 G6:4 | A6:12 -:4`,
      },
    },
  },
];

// 預先解析樂譜（長度不對時在主控台警告，方便改譜）
const SONGS = SONGS_SRC.map((src) => {
  const sec = {};
  for (const [k, s] of Object.entries(src.sec)) {
    const out = { ...s, chordList: s.chords.split(/\s+/).map(chord) };
    if (s.lead) {
      out.mel = melody(s.lead);
      if (out.mel.steps !== s.bars * 16) console.warn(`[音樂] ${src.name} ${k} 段旋律長度 ${out.mel.steps}，應為 ${s.bars * 16}`);
      out.melAt = new Map(out.mel.notes.map((x, i) => [x.step, i]));
    }
    sec[k] = out;
  }
  return { ...src, sec };
});
export const SONG_NAMES = SONGS.map((s) => s.name);

let music = null;

// 某一格（16 分音符）要發出的所有聲音
function playStep(S, sec, bar, s16, t, step) {
  const ch = sec.chordList[bar % sec.chordList.length];
  const fill = bar === sec.bars - 1 && s16 >= 12 && sec.drums !== 'taiko';
  if (s16 === 0 && bar === 0 && sec.crash) crash(t);
  if (s16 === 0 && bar === 0 && S.gong) gong(t);
  // 鼓
  const D = DRUMS[sec.drums] || {};
  const on = (p) => p && p[s16] && p[s16] !== '.';
  if (on(D.k)) kick(t);
  if (fill) {
    if (FILL.s[s16] === 'x') snare(t, 0.85);
    if (FILL.t[s16] === 'x') tom(t, 50 - (s16 - 12) * 3, 0.9);
  } else {
    if (on(D.s)) snare(t);
    if (on(D.t)) tom(t, s16 < 8 ? 50 : 45, 0.7);
  }
  if (on(D.h)) hat(t, D.h[s16] === 'o', s16 % 2 ? 0.6 : 1);
  if (on(D.c)) clap(t);
  if (on(D.w)) taiko(t);
  if (on(D.z)) shaker(t, s16 % 4 === 0 ? 1 : 0.6);
  // 貝斯（E2～D#3，另疊一個低八度的次低音）
  const root = 40 + ((ch.pc - 4 + 12) % 12);
  for (const [s, len, iv] of BASS[sec.bass] || []) if (s === s16) INST.bass(t, len * step * 0.92, root + iv);
  // 和弦音（中音域 C4 附近）
  const mid = 60 + ch.pc - (ch.pc > 7 ? 12 : 0);
  const tones = [mid + ch.iv[0], mid + ch.iv[1], mid + ch.iv[2], mid + 12];
  if (sec.pad && s16 === 0) for (const n of tones.slice(0, 3)) INST.strings(t, 16 * step * 0.98, n);
  if (sec.arp) {
    const k = ARPS[sec.arp][s16];
    if (k !== null && k !== undefined) INST[sec.arpInst || 'bell'](t, step * 1.6, tones[k] + 12);
  }
  if (sec.stab && STABS[sec.stab][s16] === 'x') for (const n of tones.slice(0, 3)) INST.stab(t, step, n + 12);
  if (sec.gtr) {
    const c = GTR[sec.gtr][s16];
    const g0 = 40 + ((ch.pc - 4 + 12) % 12);
    if (c === 'x' || c === 'm') for (const n of [g0, g0 + 7, g0 + 12]) INST.gtr(t, c === 'm' ? step * 0.7 : step * 4, n);
  }
  // 主旋律
  if (sec.mel) {
    const i = sec.melAt.get(bar * 16 + s16);
    if (i !== undefined) {
      const note = sec.mel.notes[i];
      const prev = sec.mel.notes[i - 1];
      const legato = prev && prev.step + prev.len === note.step && Math.abs(prev.n - note.n) <= 4;
      INST[sec.inst || 'brass'](t, note.len * step * 0.94, note.n, { glide: legato && (sec.inst === 'fiddle' || sec.inst === 'square') ? prev.n : null });
    }
  }
}

function scheduleMusic() {
  if (!music) return;
  const S = SONGS[music.song];
  const step = 60 / (S.bpm * music.tempo) / 4;
  while (music.next < ctx.currentTime + 0.25) {
    const name = S.order[music.si];
    const sec = S.sec[name];
    const bar = Math.floor(music.step / 16), s16 = music.step % 16;
    const t = music.next + (s16 % 2 ? (S.swing || 0) * step : 0);
    if (!music.mute) playStep(S, sec, bar, s16, t, step);
    music.step++;
    music.next += step;
    if (music.step >= sec.bars * 16) {
      music.step = 0;
      music.si++;
      if (music.si >= S.order.length) music.si = S.loop;
    }
  }
}

export const audio = {
  unlock() {
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume();
  },
  sfx(name) {
    if (!GAME.sfx || !ctx || ctx.state !== 'running') return;
    const f = SFX[name];
    if (f) f(ctx.currentTime + 0.005);
  },
  shout() {
    if (!GAME.sfx || !ctx) return;
    noise(ctx.currentTime, 0.18, { freq: 700, sweep: 400, q: 4, gain: 0.12 });
  },
  playMusic(song) {
    if (!ctx) return;
    this.stopMusic();
    if (!GAME.bgm) return;
    const i = ((song % SONGS.length) + SONGS.length) % SONGS.length;
    const S = SONGS[i];
    delay.delayTime.setValueAtTime(Math.min(1.4, (60 / S.bpm / 4) * (S.delay || 3)), ctx.currentTime);
    music = { song: i, si: 0, step: 0, next: ctx.currentTime + 0.1, tempo: this.tempo || 1 };
    music.timer = setInterval(scheduleMusic, 50);
  },
  stopMusic() {
    if (music) { clearInterval(music.timer); music = null; }
  },
  get playing() { return music ? music.song : -1; },
  tempo: 1,                                   // DEV：速度倍率
  // DEV：調整各聲部音量
  setMix(name, v) {
    MIX[name] = v;
    if (!ctx) return;
    if (name === 'music') musicBus.gain.value = v;
    else if (CH[name]) CH[name].gain.value = v;
  },
  setVolume(v) { if (master) master.gain.value = v; },
  voice(text) {
    if (!GAME.voice || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.95;
      u.pitch = 0.55;
      u.volume = Math.min(1, GAME.volume + 0.2);
      speechSynthesis.speak(u);
    } catch { /* 部分瀏覽器不支援 */ }
  },
};
