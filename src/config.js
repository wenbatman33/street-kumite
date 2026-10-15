// 全域設定：所有可在 DEV 工具調整的數值都集中在這裡（匯出後由 Claude baked 回本檔）

// 邏輯解析度（畫面依視窗等比縮放）
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const TICK = 1000 / 60;

// 版面（HUD 與舞台）
export const LAYOUT = {
  groundY: 652,          // 地面在畫面上的 y
  charH: 300,            // 角色站姿身高（世界單位）
  stageW: 1900,          // 舞台寬度
  edge: 46,              // 角色與畫面邊緣的最小距離
  startGap: 440,         // 回合開始時兩人距離
  shadowAlpha: 0.35,
  hud: {
    bar:    { x: 54, y: 34, w: 500, h: 26, skew: 14 },     // P1 血條（P2 左右鏡像）
    name:   { x: 136, y: 76, size: 22 },
    portrait: { x: 8, y: 14, size: 74 },
    timer:  { x: 640, y: 58, size: 54 },
    wins:   { x: 572, y: 76, r: 8, gap: 22 },               // 回合勝利標記（P1 由中央往左排）
    meter:  { x: 54, y: 684, w: 300, h: 14 },
    stun:   { x: 136, y: 64, w: 418, h: 5 },
    combo:  { x: 70, y: 250, size: 46 },
    msg:    { y: 300, size: 96 },
    sub:    { y: 380, size: 34 },
    frameData: { x: 640, y: 110, size: 15 },
    inputLog: { x: 14, y: 140, size: 18, rows: 18 },
  },
  colors: {
    hp: '#ffd23a', hpLow: '#ff4a2a', trail: '#e8262b', barBg: '#2a1012', meter: '#2fc6ff', meterFull: '#7dff6b',
    text: '#ffffff', outline: '#14080c', timer: '#ffe9a8', combo: '#ffcf33',
  },
  // 觸控虛擬按鍵（只在觸控裝置顯示）。x = 畫面寬比例、y = 畫面高比例；大小一律用「畫面高比例」，手機與平板分開設定
  touch: {
    mobile: {
      alpha: 0.6, menuAlpha: 0.35,
      stick: { x: 0.12, y: 0.7, r: 0.18, dead: 0.25, diag: 50, float: true },   // r = 半徑；diag = 斜角判定角度；float = 底座外按下時搖桿移到手指處
      buttons: { x: 0.835, y: 0.69, size: 0.155, gap: 0.02, tilt: 0.015, twin: 0.35 },   // size = 直徑；tilt = 每欄高低差；twin = 兩鍵中間同按的判定寬度
      sp: { x: 0.672, y: 0.875, size: 0.13 },
      pause: { x: 0.955, y: 0.1, size: 0.1 },
      reset: { x: 0.955, y: 0.27, size: 0.1 },
      fs: { x: 0.045, y: 0.1, size: 0.09 },
      // 選單畫面：六鍵收起來，改用小搖桿 + 確定／返回（放在畫面兩側黑邊，不擋選項）
      menuStick: { x: 0.045, y: 0.62, r: 0.1 },
      ok: { x: 0.955, y: 0.5, size: 0.15 },
      back: { x: 0.955, y: 0.75, size: 0.13 },
    },
    tablet: {
      alpha: 0.55, menuAlpha: 0.3,
      stick: { x: 0.13, y: 0.79, r: 0.125, dead: 0.25, diag: 50, float: true },
      buttons: { x: 0.83, y: 0.79, size: 0.105, gap: 0.016, tilt: 0.012, twin: 0.35 },
      sp: { x: 0.655, y: 0.9, size: 0.085 },
      pause: { x: 0.96, y: 0.06, size: 0.07 },
      reset: { x: 0.89, y: 0.06, size: 0.07 },
      fs: { x: 0.04, y: 0.06, size: 0.065 },
      menuStick: { x: 0.07, y: 0.935, r: 0.055 },
      ok: { x: 0.9, y: 0.935, size: 0.1 },
      back: { x: 0.8, y: 0.935, size: 0.085 },
    },
  },
};

// 每個舞台的背景擺放（scale=相對於鋪滿所需大小的倍率，y=背景往上移多少）
export const STAGES = {
  market: { name: 'NEON MARKET', nameZh: '霓虹夜市', img: 'assets/stages/market.webp', scale: 1.0, y: 0.80, parallax: 0.85, tint: 'rgba(20,10,40,0.10)', bgm: 0 },
  beach:  { name: 'SUNSET RODA', nameZh: '夕陽廣場', img: 'assets/stages/beach.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: 'rgba(40,10,0,0.05)', bgm: 1 },
  steppe: { name: 'GREAT STEPPE', nameZh: '草原祭典', img: 'assets/stages/steppe.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: '', bgm: 2 },
  harbor: { name: 'FROZEN HARBOR', nameZh: '極光港口', img: 'assets/stages/harbor.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: 'rgba(10,20,50,0.08)', bgm: 3 },
  rooftop: { name: 'MOONLIT ROOFS', nameZh: '月下屋頂', img: 'assets/stages/rooftop.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: 'rgba(20,10,40,0.08)', bgm: 3 },
  temple: { name: 'CLOUD TEMPLE', nameZh: '雲海寺院', img: 'assets/stages/temple.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: '', bgm: 2 },
  gym:    { name: 'UNDERGROUND RING', nameZh: '地下拳場', img: 'assets/stages/gym.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: 'rgba(0,0,0,0.08)', bgm: 0 },
  stadium: { name: 'NIGHT STADIUM', nameZh: '夜光拳館', img: 'assets/stages/stadium.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: '', bgm: 1 },
};

// 物理（角色個別值在角色檔覆寫）
export const PHYS = {
  gravity: 0.86,
  prejump: 4,
  landing: 4,
  pushDecay: 0.78,
  knockdownLie: 34,
  getup: 28,
  techWindow: 8,
  bufferTicks: 5,
  dizzyTicks: 150,
  stunDecay: 2.5,
  timerTicks: 46,        // 計時器每幾 tick 減 1
};

// 打擊感
export const FX = {
  hitstop: { L: 8, M: 10, H: 13, S: 12, SU: 16, KO: 30 },
  shake: { L: 0, M: 2, H: 5, KD: 7, KO: 12 },
  sparkScale: 1.0,
  koSlow: 3,             // KO 慢動作倍率
  superFlash: 44,        // 超必殺暗場 tick
  hitFlash: 3,
};

export const GAME = {
  roundsToWin: 2,
  time: 99,
  difficulty: 1,         // 0 EASY / 1 NORMAL / 2 HARD / 3 MASTER
  bgm: true,
  sfx: true,
  voice: true,
  volume: 0.7,
  quality: 'normal',     // 畫質：low 1280 / normal 1920 / high 2560 像素寬
  easySpecial: false,    // 觸控「簡易必殺」：多一顆 SP 鍵，SP + 方向直接出必殺技
};

// 按鍵配置。solo = 單人／訓練；p1/p2 = 本機雙人（同一鍵盤左右分邊）
export const KEYMAPS = {
  solo: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    LP: ['KeyU'], MP: ['KeyI'], HP: ['KeyO'], LK: ['KeyJ'], MK: ['KeyK'], HK: ['KeyL'],
    start: ['Escape', 'Enter'], select: ['Backspace', 'KeyR'],
  },
  p1: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    LP: ['KeyT'], MP: ['KeyY'], HP: ['KeyU'], LK: ['KeyG'], MK: ['KeyH'], HK: ['KeyJ'],
    start: ['Escape'], select: ['Backspace'],
  },
  p2: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    LP: ['KeyI', 'Numpad4'], MP: ['KeyO', 'Numpad5'], HP: ['KeyP', 'Numpad6'],
    LK: ['KeyK', 'Numpad1'], MK: ['KeyL', 'Numpad2'], HK: ['Semicolon', 'Numpad3'],
    start: ['Enter', 'NumpadEnter'], select: ['Backslash'],
  },
};

// 標準手把配置（Gamepad API standard mapping）
export const PADMAP = {
  LP: [2], MP: [3], HP: [5], LK: [0], MK: [1], HK: [7], start: [9], select: [8],
  up: [12], down: [13], left: [14], right: [15],
};

export const BUTTONS = ['LP', 'MP', 'HP', 'LK', 'MK', 'HK'];
