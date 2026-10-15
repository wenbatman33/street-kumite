// 音效與音樂：全部用 Web Audio 即時合成（無外部音檔）；回合語音用瀏覽器 speechSynthesis
import { GAME } from './config.js';

let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;

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
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.32;
  musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

function noise(t, dur, { freq = 1200, q = 1, type = 'bandpass', gain = 0.5, sweep = null } = {}) {
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
  src.connect(f).connect(g).connect(sfxBus);
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

const SFX = {
  whiffL: (t) => noise(t, 0.09, { freq: 2400, sweep: 900, q: 1.2, gain: 0.18 }),
  whiffM: (t) => noise(t, 0.13, { freq: 1900, sweep: 600, q: 1.1, gain: 0.22 }),
  whiffH: (t) => noise(t, 0.2, { freq: 1500, sweep: 380, q: 0.9, gain: 0.28 }),
  hitL: (t) => { noise(t, 0.07, { freq: 2600, q: 0.7, gain: 0.45 }); tone(t, 0.08, { f0: 260, f1: 90, gain: 0.5 }); },
  hitM: (t) => { noise(t, 0.11, { freq: 1800, q: 0.7, gain: 0.55 }); tone(t, 0.13, { f0: 200, f1: 60, gain: 0.7 }); },
  hitH: (t) => { noise(t, 0.18, { freq: 1200, q: 0.6, gain: 0.7 }); tone(t, 0.22, { f0: 160, f1: 40, gain: 0.95 }); noise(t + 0.02, 0.25, { freq: 400, type: 'lowpass', gain: 0.4 }); },
  block: (t) => { noise(t, 0.06, { freq: 4200, q: 3, gain: 0.35 }); tone(t, 0.05, { f0: 900, f1: 500, type: 'square', gain: 0.08 }); },
  grab: (t) => noise(t, 0.08, { freq: 900, q: 2, gain: 0.3 }),
  land: (t) => { tone(t, 0.25, { f0: 120, f1: 35, gain: 0.8 }); noise(t, 0.3, { freq: 300, type: 'lowpass', gain: 0.45 }); },
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

// ---------- 背景音樂：簡易步進音序器 ----------
const SONGS = [
  // 霓虹夜市：小調、140 BPM
  { bpm: 142, root: 45, scale: [0, 3, 5, 7, 10], bass: [0, 0, 12, 0, 10, 0, 7, 5], lead: [12, -1, 15, 12, 17, -1, 15, 12, 10, -1, 12, 7, 10, 12, -1, -1], chords: [0, 0, 8, 10] },
  // 夕陽廣場：明亮、桑巴感
  { bpm: 128, root: 50, scale: [0, 2, 4, 7, 9], bass: [0, 7, 12, 7, 5, 12, 4, 7], lead: [12, 14, -1, 16, 19, -1, 16, 14, 12, -1, 9, 12, -1, 7, 9, -1], chords: [0, 5, 7, 5] },
  // 草原／寺院：五聲音階、沉穩
  { bpm: 116, root: 43, scale: [0, 2, 5, 7, 9], bass: [0, 0, 7, 0, 5, 0, 7, 12], lead: [14, -1, 12, 9, 12, -1, 7, -1, 9, 12, 14, -1, 17, 14, 12, -1], chords: [0, 0, 5, 7] },
  // 港口／屋頂：小調、快
  { bpm: 156, root: 47, scale: [0, 3, 5, 7, 10], bass: [0, 12, 0, 10, 0, 7, 0, 5], lead: [12, 15, 17, 15, 12, -1, 10, 12, 15, -1, 19, 17, 15, 12, 10, -1], chords: [0, 8, 3, 10] },
];
let music = null;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function scheduleMusic() {
  if (!music) return;
  const s = SONGS[music.song];
  const step = 60 / s.bpm / 4;
  while (music.next < ctx.currentTime + 0.2) {
    const i = music.step;
    const t = music.next;
    const bar = Math.floor(i / 16) % s.chords.length;
    const ch = s.chords[bar];
    // 鼓
    if (i % 4 === 0) tone(t, 0.18, { f0: 140, f1: 40, gain: 0.55, bus: musicBus });
    if (i % 8 === 4) { const n = ctx.createBufferSource(); n.buffer = noiseBuf; const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500; n.connect(f).connect(g).connect(musicBus); n.start(t); n.stop(t + 0.16); }
    if (i % 2 === 0) { const n = ctx.createBufferSource(); n.buffer = noiseBuf; const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; n.connect(f).connect(g).connect(musicBus); n.start(t); n.stop(t + 0.05); }
    // 貝斯（八分音符）
    if (i % 2 === 0) {
      const bn = s.root - 12 + ch + s.bass[(i / 2) % s.bass.length];
      tone(t, step * 1.8, { f0: midi(bn), f1: midi(bn), type: 'sawtooth', gain: 0.13, bus: musicBus });
    }
    // 主旋律
    const ln = s.lead[i % s.lead.length];
    if (ln >= 0 && bar % 2 === 1) tone(t, step * 1.6, { f0: midi(s.root + 12 + ch + ln), f1: midi(s.root + 12 + ch + ln), type: 'square', gain: 0.045, bus: musicBus });
    music.step++;
    music.next += step;
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
    music = { song: song % SONGS.length, step: 0, next: ctx.currentTime + 0.1 };
    music.timer = setInterval(scheduleMusic, 50);
  },
  stopMusic() {
    if (music) { clearInterval(music.timer); music = null; }
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
