// DEV 微調工具：F2 / ` / 右下角齒輪開關
// - 版面：HUD 元件可直接用滑鼠拖曳，滑桿即時生效
// - 角色 sprite：每個動畫的位移／縮放
// - 招式：時間軸、判定框、傷害等 frame data；可逐 tick 預覽並拖曳判定框
// - 狀態觸發：KO、時間到、暈眩、超必殺暗場、勝利姿勢…
// - 💾 匯出：把所有調整輸出成 JSON（下載 + 複製），交給 Claude baked 回原始碼
import GUI from 'lil-gui';
import { LAYOUT, STAGES, PHYS, FX, VIEW_W } from './config.js';
import { CHARS, refreshMove } from './chars/index.js';
import { view } from './render.js';
import { ASSETS } from './assets.js';
import { audio, MIX, SONG_NAMES } from './audio.js';
import { clearPixelCaches } from './pixel.js';
import { STAGE_FX, StageFX } from './stagefx.js';

const LS_KEY = 'streetkumite-dev-overrides';
// 覆寫檔版本：預設值有改動時加一，舊版覆寫檔載入時略過被改過的項目，新預設才會生效
const OVERRIDE_VERSION = 2;
const dirtyMoves = new Set();

export class DevTools {
  constructor(app) {
    this.app = app;
    this.open = false;
    this.paused = false;
    this.stepOnce = false;
    this.speed = 1;
    this.acc = 0;
    this.preview = { on: false, side: 0, char: 'tora', move: '5LP', tick: 1, hit: 0 };
    this.drag = null;
    this.gui = null;
    this.btn = document.getElementById('devBtn');
    this.btn.addEventListener('click', () => this.toggle());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F2' || e.code === 'Backquote') { e.preventDefault(); this.toggle(); }
      if (!this.open) return;
      if (e.code === 'Period') { this.paused = true; this.stepOnce = true; }
      if (e.code === 'KeyP' && e.shiftKey) this.paused = !this.paused;
    });
  }

  speedSteps() {
    if (this.preview.on) return 0;
    this.acc += this.speed;
    const n = Math.floor(this.acc);
    this.acc -= n;
    return n;
  }

  toggle() {
    this.open = !this.open;
    if (this.open && !this.gui) this.build();
    else if (this.open) this.buildTouch();
    if (this.gui) this.gui.show(this.open);
    view.devHud = this.open;
    if (!this.open) { this.preview.on = false; this.paused = false; if (this.app.touch) this.app.touch.profile = null; }
    this.btn.classList.toggle('on', this.open);
  }

  battle() { return this.app.battle && this.app.scene && this.app.scene.battle === this.app.battle ? this.app.battle : null; }

  // ---------- 建立面板 ----------
  build() {
    const gui = new GUI({ title: '🛠 DEV 微調（F2）', width: 330 });
    this.gui = gui;
    gui.domElement.style.zIndex = 50;

    // 匯出／匯入
    const io = {
      export: () => this.exportJSON(),
      import: () => this.importJSON(),
      clear: () => { localStorage.removeItem(LS_KEY); location.reload(); },
    };
    gui.add(io, 'export').name('💾 匯出 / 鎖定（JSON）');
    gui.add(io, 'import').name('📥 匯入 JSON');
    gui.add(io, 'clear').name('↺ 清除本機覆寫並重新載入');

    // 狀態
    const st = gui.addFolder('▶ 遊戲狀態 / 觸發');
    st.add(this, 'paused').name('暫停（. 逐格）').listen();
    st.add(this, 'speed', { '0.25x': 0.25, '0.5x': 0.5, '1x': 1, '2x': 2 }).name('速度');
    st.add(view, 'showBoxes').name('顯示判定框');
    const auto = { get v() { const b = this.self.battle(); return b ? b.autoBoxes : true; }, set v(x) { const b = this.self.battle(); if (b) b.autoBoxes = x; }, self: this };
    st.add(auto, 'v').name('判定框貼齊 sprite');
    const T = {
      ko2: () => this.withBattle((b) => { const f = b.fighters[1]; f.hp = 1; b.fighters[0].meter = 100; f.receive(b.fighters[0], { dmg: 999, hitstop: 'H', kd: true }, { x: b.fighters[0].x }); }),
      timeOver: () => this.withBattle((b) => { b.timer = 1; b.timerTick = 999; }),
      dizzy2: () => this.withBattle((b) => { const f = b.fighters[1]; f.setState('dizzy', { dizzyT: 180 }); }),
      super1: () => this.withBattle((b) => { const f = b.fighters[0]; f.meter = 100; f.startMove('super'); }),
      win1: () => this.withBattle((b) => { b.fighters[0].setState('win'); }),
      meter: () => this.withBattle((b) => { for (const f of b.fighters) f.meter = 100; }),
      low: () => this.withBattle((b) => { for (const f of b.fighters) { f.hp = Math.round(f.def.hp * 0.15); f.hpTrail = f.hp; } }),
      msg: () => this.withBattle((b) => b.say('K.O.', 120, '#ff3b2f', 'PERFECT')),
      combo: () => this.withBattle((b) => { b.comboShow[0] = { hits: 7, dmg: 345, t: 0 }; }),
      reset: () => this.withBattle((b) => b.resetPositions('center')),
    };
    st.add(T, 'ko2').name('P2 K.O.');
    st.add(T, 'timeOver').name('時間到');
    st.add(T, 'dizzy2').name('P2 暈眩');
    st.add(T, 'super1').name('P1 超必殺');
    st.add(T, 'win1').name('P1 勝利姿勢');
    st.add(T, 'meter').name('量表全滿');
    st.add(T, 'low').name('血量 15%');
    st.add(T, 'msg').name('顯示 K.O. 訊息');
    st.add(T, 'combo').name('顯示連段數');
    st.add(T, 'reset').name('重設位置');

    // 跳到各畫面（調整非戰鬥畫面的版面用）
    const go = gui.addFolder('🎬 跳到畫面');
    go.close();
    const J = { char: 'tora', opp: 'shen' };
    const scene = async (fn) => { const m = await import('./scenes.js'); this.app.go(fn(m)); };
    const ladder = () => { const L = Object.keys(CHARS).filter((id) => id !== J.char && id !== J.opp); L.push(J.opp); return L; };
    const setup = (n) => ({ mode: 'arcade', ladder: ladder(), stageNo: n, chars: [J.char, J.opp], stage: HOME_STAGE[J.opp] });
    go.add(J, 'char', Object.keys(CHARS)).name('自己');
    go.add(J, 'opp', Object.keys(CHARS)).name('對手');
    const S = {
      title: () => scene((m) => new m.TitleScene(this.app)),
      profile: () => scene((m) => new m.ProfileScene(this.app, new m.MenuScene(this.app))),
      prologue: () => scene((m) => new m.SelectScene(this.app, 'ladder')),
      vs: () => scene((m) => new m.VSScene(this.app, setup(0))),
      vsRival: () => scene((m) => new m.VSScene(this.app, setup(Object.keys(CHARS).length - 2))),
      win: () => scene((m) => new m.ResultScene(this.app, setup(0), 0)),
      lose: () => scene((m) => new m.ResultScene(this.app, setup(0), 1)),
      cont: () => scene((m) => new m.ContinueScene(this.app, setup(0))),
      ending: () => scene((m) => m.endingScene(this.app, setup(6))),
      credits: () => scene((m) => new m.CreditsScene(this.app, J.char)),
      demo: () => scene((m) => new m.BattleScene(this.app, { mode: 'demo', chars: [J.char, J.opp], stage: HOME_STAGE[J.opp] })),
    };
    go.add(S, 'title').name('標題');
    go.add(S, 'profile').name('格鬥家檔案');
    go.add(S, 'prologue').name('選角（街機）');
    go.add(S, 'vs').name('VS 一般');
    go.add(S, 'vsRival').name('VS 宿敵戰');
    go.add(S, 'win').name('結算：勝利台詞');
    go.add(S, 'lose').name('結算：落敗');
    go.add(S, 'cont').name('CONTINUE 倒數');
    go.add(S, 'ending').name('角色結局');
    go.add(S, 'credits').name('製作名單');
    go.add(S, 'demo').name('Demo 對戰');

    // 版面
    const lay = gui.addFolder('📐 版面 HUD（可直接拖曳）');
    lay.close();
    for (const [k, o] of Object.entries(LAYOUT.hud)) {
      const f = lay.addFolder(k);
      f.close();
      for (const p of Object.keys(o)) f.add(o, p, ...rangeFor(p)).listen().onChange(() => this.save());
    }
    const scr = lay.addFolder('🖼 各畫面（標題／選角／VS／劇情／結算）');
    scr.close();
    for (const [k, o] of Object.entries(LAYOUT.screens)) {
      const f = scr.addFolder(k);
      f.close();
      for (const p of Object.keys(o)) f.add(o, p, ...rangeFor(p)).listen().onChange(() => this.save());
    }
    const col = lay.addFolder('顏色');
    col.close();
    for (const k of Object.keys(LAYOUT.colors)) col.addColor(LAYOUT.colors, k).onChange(() => this.save());
    this.touchFolder = lay.addFolder('🎮 觸控按鍵（手機／平板分開設定）');
    this.touchFolder.close();
    this.buildTouch();

    // 舞台
    const stg = gui.addFolder('🏙 舞台 / 角色大小');
    stg.close();
    stg.add(LAYOUT, 'groundY', 400, 720, 1).name('地面 Y').onChange(() => this.save());
    stg.add(LAYOUT, 'charH', 180, 420, 1).name('角色身高').onChange(() => this.save());
    stg.add(LAYOUT, 'stageW', 1300, 3000, 10).name('舞台寬').onChange(() => this.save());
    stg.add(LAYOUT, 'edge', 0, 120, 1).name('畫面邊距').onChange(() => this.save());
    stg.add(LAYOUT, 'startGap', 150, 800, 1).name('開場距離').onChange(() => this.save());
    stg.add(LAYOUT, 'camZoom', 1, 1.6, 0.01).name('鏡頭拉近倍率').onChange(() => this.save());
    const mp = stg.addFolder('世界地圖位置');
    mp.close();
    mp.add(LAYOUT.map, 'x', -400, 400, 1).onChange(() => this.save());
    mp.add(LAYOUT.map, 'y', -400, 200, 1).onChange(() => this.save());
    mp.add(LAYOUT.map, 'w', 600, 2000, 1).name('寬').onChange(() => this.save());
    const sh = stg.addFolder('影子');
    sh.close();
    const SH = LAYOUT.shadow;
    sh.add(SH, 'cast', 0, 1, 0.01).name('投射影子濃度').onChange(() => this.save());
    sh.add(SH, 'contact', 0, 1, 0.01).name('腳底陰影濃度').onChange(() => this.save());
    sh.add(SH, 'contactW', 0.3, 2, 0.01).name('腳底陰影寬度').onChange(() => this.save());
    sh.add(SH, 'blur', 0, 10, 0.5).name('模糊').onChange(() => this.save());
    sh.add(SH, 'fade', 100, 800, 10).name('離地多高消失').onChange(() => this.save());
    sh.add(SH, 'squash', -0.5, 0.5, 0.01).name('預設壓扁（負=逆光）').onChange(() => this.save());
    sh.add(SH, 'skew', -1.5, 1.5, 0.01).name('預設斜度').onChange(() => this.save());
    for (const [id, s] of Object.entries(STAGES)) {
      const f = stg.addFolder(`背景 ${s.nameZh}`);
      f.close();
      f.add(s, 'scale', 0.5, 2, 0.01).onChange(() => this.save());
      f.add(s, 'y', 0.3, 1.2, 0.005).name('地面位於圖高').onChange(() => this.save());
      f.add(s, 'parallax', 0, 1, 0.01).onChange(() => this.save());
      if (!s.light) s.light = [LAYOUT.shadow.squash, LAYOUT.shadow.skew];
      f.add(s.light, 0, -0.5, 0.5, 0.01).name('影子壓扁（負=逆光）').onChange(() => this.save());
      f.add(s.light, 1, -1.5, 1.5, 0.01).name('影子斜度').onChange(() => this.save());
      if (s.floor !== undefined) f.add(s, 'floor', 0.3, 1, 0.005).name('地板起點（圖高比例）').onChange(() => this.save());
      if (s.dust) f.addColor(s, 'dust').name('揚塵顏色').onChange(() => this.save());
      (s.fg || []).forEach((fg, i) => {
        const ff = f.addFolder(`前景 ${i + 1}：${fg.id}`);
        ff.close();
        ff.add(fg, 'x', -200, 2100, 1).name('舞台位置').onChange(() => this.save());
        ff.add(fg, 'h', 40, 700, 1).name('高度').onChange(() => this.save());
        ff.add(fg, 'p', 0.5, 2.5, 0.01).name('捲動倍率').onChange(() => this.save());
        ff.add(fg, 'dy', -300, 300, 1).name('上下位移').onChange(() => this.save());
        ff.add(fg, 'at', ['top', 'bottom']).name('貼齊').onChange(() => this.save());
      });
      void id;
    }

    // 像素畫風
    const px = gui.addFolder('🟦 像素畫風');
    px.close();
    const PXL = LAYOUT.pixel;
    const repix = () => { clearPixelCaches(); this.save(); };
    px.add(PXL, 'size', 1, 4, 1).name('舞台像素倍率（1 = 關閉）').onChange(repix);
    px.add(PXL, 'charSize', 1, 4, 1).name('角色像素倍率（1 = 高解析）').onChange(repix);
    px.add(PXL, 'artSize', 1, 4, 1).name('頭像像素倍率').onChange(repix);
    px.add(PXL, 'sharpen', 0, 2, 0.05).name('銳化（保留細節）').onChange(repix);
    px.add(PXL, 'stageColors', 8, 128, 1).name('舞台色數').onChange(repix);
    px.add(PXL, 'charColors', 8, 128, 1).name('角色色數').onChange(repix);
    px.add(PXL, 'artColors', 8, 128, 1).name('頭像色數').onChange(repix);
    px.add(PXL, 'dither', 0, 24, 0.5).name('抖色強度').onChange(repix);
    px.add(PXL, 'sat', 0.5, 1.6, 0.01).name('彩度').onChange(repix);
    px.add(PXL, 'contrast', 0.6, 1.5, 0.01).name('對比').onChange(repix);
    px.add(PXL, 'floorScroll').name('地板透視捲動').onChange(() => this.save());

    // 舞台動態元素（天氣、觀眾）
    const sfx = gui.addFolder('🌏 舞台動態元素');
    sfx.close();
    const rebuild = () => { const b = this.battle(); if (b) b.stagefx = new StageFX(b.stage); this.save(); };
    sfx.add({ cheer: () => this.withBattle((b) => b.stagefx.cheer(1)) }, 'cheer').name('觸發觀眾歡呼（K.O. 反應）');
    for (const [id, D] of Object.entries(STAGE_FX)) {
      const f = sfx.addFolder(STAGES[id] ? STAGES[id].nameZh : id);
      f.close();
      for (const [k, v] of Object.entries(D)) {
        if (typeof v !== 'number') continue;
        f.add(D, k, 0, k === 'on' || k === 'flash' || k === 'eagle' || k === 'cloud' || k === 'aurora' || k === 'mist' || k === 'haze' || k === 'confetti' ? 1 : 200, k === 'flash' ? 0.05 : 1).name(FX_NAME[k] || k).onChange(rebuild);
      }
    }

    // 配樂：試聽、速度、各聲部音量
    const mu = gui.addFolder('🎵 配樂');
    mu.close();
    const songs = {};
    SONG_NAMES.forEach((n, i) => { songs[n] = i; });
    const M = {
      song: Math.max(0, audio.playing),
      play: () => { audio.unlock(); audio.playMusic(M.song); },
      stop: () => audio.stopMusic(),
    };
    mu.add(M, 'song', songs).name('曲目').onChange(() => M.play());
    mu.add(M, 'play').name('▶ 播放');
    mu.add(M, 'stop').name('■ 停止');
    mu.add(audio, 'tempo', 0.7, 1.3, 0.01).name('速度倍率（重播生效）');
    const mixName = { music: '音樂總音量', kick: '大鼓', snare: '小鼓', hat: '鈸', perc: '打擊', bass: '貝斯', lead: '主旋律', pad: '弦樂', arp: '琶音', stab: '銅管短打', gtr: '吉他' };
    for (const k of Object.keys(MIX)) mu.add(MIX, k, 0, k === 'music' ? 1 : 1.5, 0.01).name(mixName[k] || k).onChange((v) => { audio.setMix(k, v); this.save(); });

    // 物理與打擊感
    const ph = gui.addFolder('⚙ 物理 / 打擊感');
    ph.close();
    const fine = new Set(['gravity', 'pushDecay', 'fallMul', 'jumpMul']);
    for (const k of Object.keys(PHYS)) ph.add(PHYS, k, 0, fine.has(k) ? 2 : 200, fine.has(k) || k === 'stunDecay' ? 0.01 : 1).onChange(() => this.save());
    for (const k of Object.keys(FX.hitstop)) ph.add(FX.hitstop, k, 0, 40, 1).name(`頓幀 ${k}`).onChange(() => this.save());
    for (const k of Object.keys(FX.shake)) ph.add(FX.shake, k, 0, 30, 1).name(`震動 ${k}`).onChange(() => this.save());
    for (const k of Object.keys(FX.hitShake)) ph.add(FX.hitShake, k, 0, 20, 1).name(`受擊抖動 ${k}`).onChange(() => this.save());
    for (const k of Object.keys(FX.zoom)) ph.add(FX.zoom, k, 0, 0.3, 0.005).name(`鏡頭衝擊 ${k}`).onChange(() => this.save());
    ph.add(FX, 'sparkScale', 0.3, 3, 0.05).name('火花大小').onChange(() => this.save());
    ph.add(FX, 'superFlash', 0, 120, 1).name('超必殺暗場').onChange(() => this.save());
    ph.add(FX, 'koSlow', 1, 8, 1).name('KO 慢動作').onChange(() => this.save());

    // 角色
    this.charFolder = gui.addFolder('🥋 角色 / sprite');
    this.charFolder.close();
    this.buildChar();

    // 招式
    this.moveFolder = gui.addFolder('🎯 招式 frame data / 判定框');
    this.moveFolder.close();
    this.buildMove();
    this.gui.show(this.open);
  }

  // 觸控虛擬按鍵：選版型 → 滑桿微調，或在畫面上直接拖曳（位置以畫面寬／高比例儲存）
  buildTouch() {
    const f = this.touchFolder;
    const T = this.app.touch;
    if (!f || !T) return;
    [...f.children].forEach((c) => c.destroy());
    f.add(T, 'force').name('桌機強制顯示觸控層');
    f.add(T, 'edit').name('拖曳按鍵改位置');
    const sel = { profile: T.profileName() };
    const opts = {};
    for (const [k, v] of Object.entries(T.profiles)) opts[v] = k;
    f.add(sel, 'profile', opts).name('編輯版型').onChange((v) => { T.profile = v; this.buildTouch(); });
    if (T.profile !== sel.profile) T.profile = sel.profile;   // DEV 開著時畫面顯示正在編輯的版型
    const P = LAYOUT.touch[sel.profile];
    const save = () => this.save();
    f.add(P, 'alpha', 0.1, 1, 0.01).name('對戰透明度').onChange(save);
    f.add(P, 'menuAlpha', 0, 1, 0.01).name('選單透明度').onChange(save);
    const names = { stick: '對戰搖桿', buttons: '六鍵', sp: 'SP 簡易必殺鍵', pause: '暫停鍵', reset: '重設鍵（訓練）', fs: '全螢幕鍵', menuStick: '選單搖桿', ok: '選單確定鍵', back: '選單返回鍵' };
    const range = {
      x: [0, 1, 0.001], y: [0, 1, 0.001], r: [0.05, 0.4, 0.001], size: [0.03, 0.3, 0.001], gap: [0, 0.1, 0.001],
      tilt: [-0.1, 0.1, 0.001], twin: [0, 1, 0.01], dead: [0.05, 0.8, 0.01], diag: [20, 80, 1],
    };
    const label = { x: 'X（畫面寬比例）', y: 'Y（畫面高比例）', r: '半徑', size: '直徑', gap: '間距', tilt: '每欄高低差', twin: '兩鍵同按判定', dead: '死區', diag: '斜角判定角度', float: '浮動搖桿' };
    for (const [k, name] of Object.entries(names)) {
      const sub = f.addFolder(name);
      sub.close();
      for (const p of Object.keys(P[k])) {
        const c = typeof P[k][p] === 'boolean' ? sub.add(P[k], p) : sub.add(P[k], p, ...range[p]);
        c.name(label[p] || p).listen().onChange(save);
      }
    }
  }

  withBattle(fn) {
    const b = this.battle();
    if (!b) { alert('請先進入對戰或訓練模式'); return; }
    fn(b);
  }

  buildChar() {
    const f = this.charFolder;
    [...f.children].forEach((c) => c.destroy());
    const sel = { char: this.selChar || 'tora', anim: this.selAnim || 'idle' };
    f.add(sel, 'char', Object.keys(CHARS)).name('角色').onChange((v) => { this.selChar = v; this.buildChar(); });
    const c = CHARS[sel.char];
    for (const k of ['hp', 'walkF', 'walkB', 'jumpVy', 'jumpVx']) f.add(c, k, 0, k === 'hp' ? 2000 : 30, k === 'hp' ? 10 : 0.1).onChange(() => this.save());
    const atlas = ASSETS.chars[sel.char];
    const anims = atlas ? Object.keys(atlas.anims) : ['idle'];
    f.add(sel, 'anim', anims).name('動畫').onChange((v) => { this.selAnim = v; this.buildChar(); });
    const adj = c.spriteAdj[sel.anim] || (c.spriteAdj[sel.anim] = { dx: 0, dy: 0, s: 1 });
    f.add(adj, 'dx', -150, 150, 1).name('位移 X').onChange(() => this.save());
    f.add(adj, 'dy', -150, 150, 1).name('位移 Y').onChange(() => this.save());
    f.add(adj, 's', 0.5, 1.6, 0.01).name('縮放').onChange(() => this.save());
    f.open();
  }

  buildMove() {
    const f = this.moveFolder;
    [...f.children].forEach((c) => c.destroy());
    const P = this.preview;
    const c = CHARS[P.char];
    if (!c.moves[P.move]) P.move = '5LP';
    const m = c.moves[P.move];
    f.add(P, 'char', Object.keys(CHARS)).name('角色').onChange(() => { P.move = '5LP'; this.buildMove(); });
    f.add(P, 'move', Object.keys(c.moves)).name('招式').onChange(() => { P.tick = 1; P.hit = 0; this.buildMove(); });
    f.add(P, 'on').name('▶ 逐 tick 預覽（P1）').onChange((v) => { if (v) { this.paused = true; view.showBoxes = true; } }).listen();
    f.add(P, 'tick', 1, Math.max(2, m.total + 20), 1).name('預覽 tick').listen();
    const seqObj = { seq: m.seq.map((e) => (e[2] ? `${e[0]}:${e[1]}:${e[2]}` : `${e[0]}:${e[1]}`)).join(', ') };
    f.add(seqObj, 'seq').name('時間軸 格:tick').onFinishChange((v) => {
      const seq = v.split(',').map((s) => s.trim().split(':')).filter((x) => x.length >= 2).map(([a, b, an]) => (an ? [Number(a), Number(b), an] : [Number(a), Number(b)]));
      if (seq.length) { m.seq = seq; refreshMove(m); this.dirty(P.char, P.move); this.buildMove(); }
    });
    const info = { total: `總長 ${m.total}F／發生 ${m.firstActive}F／最後判定 ${m.lastActive}F` };
    f.add(info, 'total').name('資訊').disable();
    if (m.hits && m.hits.length) {
      f.add(P, 'hit', 0, m.hits.length - 1, 1).name('第幾段判定').onChange(() => this.buildMove());
      const h = m.hits[Math.min(P.hit, m.hits.length - 1)];
      const hf = f.addFolder(`判定 #${P.hit}`);
      const tt = { t0: h.t[0], t1: h.t[1] };
      hf.add(tt, 't0', 1, m.total, 1).name('開始 tick').onChange((v) => { h.t[0] = v; refreshMove(m); this.dirty(P.char, P.move); });
      hf.add(tt, 't1', 1, m.total + 30, 1).name('結束 tick').onChange((v) => { h.t[1] = v; refreshMove(m); this.dirty(P.char, P.move); });
      if (h.autoBox === undefined) h.autoBox = true;
      hf.add(h, 'autoBox').name('貼齊 sprite（關=用下方數值）').onChange(() => this.dirty(P.char, P.move)).listen();
      const bx = { x: h.box[0], y: h.box[1], w: h.box[2], h: h.box[3] };
      for (const k of ['x', 'y', 'w', 'h']) {
        hf.add(bx, k, k === 'y' ? -100 : k === 'x' ? -150 : 10, k === 'y' ? 400 : 400, 1).name(`box ${k}`).onChange((v) => {
          h.box[{ x: 0, y: 1, w: 2, h: 3 }[k]] = v; h.autoBox = false; this.dirty(P.char, P.move);
        }).listen();
      }
      this.boxCtl = bx;
      for (const k of ['dmg', 'chip', 'stun', 'hs', 'bs', 'push']) {
        if (h[k] === undefined) h[k] = 0;
        hf.add(h, k, 0, k === 'dmg' || k === 'stun' ? 400 : 60, k === 'push' ? 0.1 : 1).onChange(() => this.dirty(P.char, P.move));
      }
      hf.add(h, 'guard', ['mid', 'low', 'high']).onChange(() => this.dirty(P.char, P.move));
      hf.add(h, 'hitstop', ['L', 'M', 'H', 'S', 'SU']).onChange(() => this.dirty(P.char, P.move));
      if (h.kd === undefined) h.kd = false;
      hf.add(h, 'kd').name('擊倒').onChange(() => this.dirty(P.char, P.move));
    }
    if (m.proj) {
      const pf = f.addFolder('飛行道具');
      for (const k of ['t', 'x', 'y', 'vx', 'scale']) pf.add(m.proj, k, k === 'scale' ? 0.2 : 0, k === 'scale' ? 3 : 300, k === 'vx' || k === 'scale' ? 0.1 : 1).onChange(() => this.dirty(P.char, P.move));
    }
    if (m.jump) {
      const jf = f.addFolder('跳躍');
      for (const k of ['t', 'vy', 'vx']) jf.add(m.jump, k, -10, 40, 0.1).onChange(() => this.dirty(P.char, P.move));
    }
    f.open();
  }

  dirty(cid, mv) { dirtyMoves.add(`${cid}/${mv}`); this.save(); }

  // 預覽：把 P1 固定在指定招式的指定 tick
  applyPreview() {
    const b = this.battle();
    if (!b || !this.preview.on) return;
    const P = this.preview;
    const f = b.fighters[P.side];
    if (f.def.id !== P.char) return;
    const m = f.def.moves[P.move];
    f.state = 'move';
    f.move = m;
    f.moveName = P.move;
    f.seq = m.seq;
    f.mt = P.tick;
    f.hitDone = new Set();
    f.lockFailed = false;
    f.y = m.air ? 120 : 0;
    if (this.boxCtl && m.hits && m.hits[P.hit]) {
      const h = m.hits[P.hit];
      Object.assign(this.boxCtl, { x: h.box[0], y: h.box[1], w: h.box[2], h: h.box[3] });
    }
  }

  // ---------- 滑鼠 ----------
  pointerDown(x, y) {
    if (!this.open) return false;
    const b = this.battle();
    // 預覽中：拖判定框（右緣 = 改寬度，其餘 = 移動）
    if (b && this.preview.on) {
      const f = b.fighters[this.preview.side];
      const m = f.move;
      const h = m && m.hits && m.hits[this.preview.hit];
      if (h) {
        const r = f.hitRect(h);
        const sx0 = r.x0 - b.camX, sx1 = r.x1 - b.camX, sy0 = LAYOUT.groundY - r.y1, sy1 = LAYOUT.groundY - r.y0;
        if (x > sx0 - 8 && x < sx1 + 8 && y > sy0 - 8 && y < sy1 + 8) {
          // 先把目前（可能是自動）判定轉成手動數值
          const bx = f.facing > 0 ? r.x0 - f.x : f.x - r.x1;
          h.box = [Math.round(bx), Math.round(r.y0 - f.y), Math.round(r.x1 - r.x0), Math.round(r.y1 - r.y0)];
          h.autoBox = false;
          const edge = f.facing > 0 ? Math.abs(x - sx1) < 12 : Math.abs(x - sx0) < 12;
          this.drag = { type: edge ? 'boxW' : 'box', h, f, x, y, box: h.box.slice() };
          return true;
        }
      }
    }
    for (const r of view.hudRects.slice().reverse()) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && LAYOUT.hud[r.key]) {
        const o = LAYOUT.hud[r.key];
        this.drag = { type: 'hud', o, x, y, ox: o.x, oy: o.y };
        return true;
      }
    }
    // 拖角色
    if (b) {
      for (const f of b.fighters) {
        const sx = f.x - b.camX;
        if (Math.abs(x - sx) < 50 && y > LAYOUT.groundY - f.y - 300 && y < LAYOUT.groundY - f.y) {
          this.drag = { type: 'fighter', f, x, ox: f.x };
          return true;
        }
      }
    }
    return false;
  }

  pointerMove(x, y) {
    const d = this.drag;
    if (!d) return;
    if (d.type === 'hud') {
      if (d.o.x !== undefined) d.o.x = Math.round(d.ox + (x - d.x));
      if (d.o.y !== undefined) d.o.y = Math.round(d.oy + (y - d.y));
    } else if (d.type === 'fighter') {
      d.f.x = d.ox + (x - d.x);
    } else if (d.type === 'box') {
      d.h.box[0] = Math.round(d.box[0] + (x - d.x) * d.f.facing);
      d.h.box[1] = Math.round(d.box[1] - (y - d.y));
    } else if (d.type === 'boxW') {
      d.h.box[2] = Math.max(10, Math.round(d.box[2] + (x - d.x) * d.f.facing));
    }
  }

  pointerUp() {
    if (!this.drag) return;
    if (this.drag.type === 'box' || this.drag.type === 'boxW') this.dirty(this.preview.char, this.preview.move);
    else this.save();
    this.drag = null;
  }

  // ---------- 匯出 / 儲存 ----------
  snapshot() {
    const chars = {};
    for (const [id, c] of Object.entries(CHARS)) {
      const moves = {};
      for (const key of dirtyMoves) {
        const [cid, mv] = key.split('/');
        if (cid !== id) continue;
        const m = c.moves[mv];
        moves[mv] = { seq: m.seq, hits: m.hits, proj: m.proj, jump: m.jump };
      }
      const adj = {};
      for (const [a, v] of Object.entries(c.spriteAdj)) if (v.dx || v.dy || (v.s && v.s !== 1)) adj[a] = v;
      chars[id] = { hp: c.hp, walkF: c.walkF, walkB: c.walkB, jumpVy: c.jumpVy, jumpVx: c.jumpVx, spriteAdj: adj, moves };
    }
    const stages = {};
    for (const [id, s] of Object.entries(STAGES)) stages[id] = { scale: s.scale, y: s.y, parallax: s.parallax, light: s.light, floor: s.floor, dust: s.dust, fg: s.fg };
    return { version: OVERRIDE_VERSION, LAYOUT, STAGES: stages, STAGE_FX, PHYS, FX, MIX, chars };
  }

  save() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.snapshot())); } catch { /* 無痕模式 */ }
    }, 300);
  }

  exportJSON() {
    const json = JSON.stringify(this.snapshot(), null, 2);
    try { navigator.clipboard.writeText(json); } catch { /* 無剪貼簿權限 */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'streetkumite-tuning.json';
    a.click();
    showModal('已匯出（並複製到剪貼簿）。把這份 JSON 貼給 Claude，說「我調好了，鎖定」即可寫回原始碼。', json);
  }

  importJSON() {
    showModal('貼上 JSON 後按「套用」', '', (txt) => {
      try { applyOverrides(JSON.parse(txt)); this.save(); location.reload(); } catch (e) { alert('JSON 格式錯誤：' + e.message); }
    });
  }
}

const HOME_STAGE = { tora: 'market', vera: 'beach', baatar: 'steppe', skye: 'harbor', kagero: 'rooftop', shen: 'temple', drake: 'gym', kanya: 'stadium' };
const FX_NAME = { on: '開啟', rain: '雨滴數', snow: '雪花數', petals: '櫻花瓣數', seeds: '草籽數', leaves: '落葉數', gulls: '海鷗數', eagle: '老鷹', cloud: '雲影', aurora: '極光', mist: '山嵐', haze: '煙霧', flash: '閃光燈頻率', confetti: 'K.O. 彩紙', lanterns3: '天燈數' };

function rangeFor(p) {
  if (/S$/.test(p) && p !== 'size') return [0.2, 2.5, 0.01];   // logoS 等縮放倍率
  if (p === 'textSize') return [10, 60, 1];
  if (/[XW]$/.test(p)) return [-200, VIEW_W, 1];               // portraitX、boxW…
  if (/H$/.test(p)) return [100, 1000, 1];                      // portraitH、boxH
  if (p === 'size' || p === 'r') return [4, 200, 1];
  if (p === 'skew') return [-60, 60, 1];
  if (p === 'rows') return [1, 40, 1];
  if (p === 'gap') return [0, 80, 1];
  if (p === 'w' || p === 'x') return [0, VIEW_W, 1];
  return [0, 720, 1];
}

function deepAssign(dst, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') deepAssign(dst[k], v);
    else dst[k] = v;
  }
}

// 啟動時套用本機覆寫（DEV 調整過但尚未 baked 的數值）
export function applyOverrides(o) {
  if (!o) {
    try { o = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { o = null; }
  }
  if (!o) return false;
  // v1 → v2：頓幀、震動改了預設值（輕中重拉開、必殺技分 SL/SM/SH）
  if ((o.version || 1) < 2 && o.FX) { delete o.FX.hitstop; delete o.FX.shake; }
  if (o.LAYOUT) deepAssign(LAYOUT, o.LAYOUT);
  if (o.PHYS) deepAssign(PHYS, o.PHYS);
  if (o.FX) deepAssign(FX, o.FX);
  if (o.MIX) for (const [k, v] of Object.entries(o.MIX)) if (k in MIX) audio.setMix(k, v);
  if (o.STAGES) for (const [id, s] of Object.entries(o.STAGES)) if (STAGES[id]) Object.assign(STAGES[id], s);
  if (o.STAGE_FX) for (const [id, s] of Object.entries(o.STAGE_FX)) if (STAGE_FX[id]) Object.assign(STAGE_FX[id], s);
  if (o.chars) {
    for (const [id, c] of Object.entries(o.chars)) {
      const d = CHARS[id];
      if (!d) continue;
      for (const k of ['hp', 'walkF', 'walkB', 'jumpVy', 'jumpVx']) if (c[k] !== undefined) d[k] = c[k];
      if (c.spriteAdj) Object.assign(d.spriteAdj, c.spriteAdj);
      for (const [mv, m] of Object.entries(c.moves || {})) {
        if (!d.moves[mv]) continue;
        for (const k of ['seq', 'hits', 'proj', 'jump']) if (m[k]) d.moves[mv][k] = m[k];
        refreshMove(d.moves[mv]);
        dirtyMoves.add(`${id}/${mv}`);
      }
    }
  }
  return true;
}

function showModal(msg, content, onApply) {
  const wrap = document.createElement('div');
  wrap.className = 'dev-modal';
  wrap.innerHTML = `<div class="box"><p></p><textarea spellcheck="false"></textarea><div class="row"><button class="ok">${onApply ? '套用' : '關閉'}</button>${onApply ? '<button class="cancel">取消</button>' : ''}</div></div>`;
  wrap.querySelector('p').textContent = msg;
  const ta = wrap.querySelector('textarea');
  ta.value = content;
  wrap.querySelector('.ok').onclick = () => { if (onApply) onApply(ta.value); wrap.remove(); };
  const c = wrap.querySelector('.cancel');
  if (c) c.onclick = () => wrap.remove();
  document.body.appendChild(wrap);
  ta.focus();
  ta.select();
}
