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
  // 影子：腳底接觸陰影 + 角色剪影投射在地上（squash = 壓扁比例，正值往後方地面延伸、負值往鏡頭方向；skew = 斜向）
  shadow: { contact: 0.6, contactW: 1, cast: 0.5, squash: -0.12, skew: 0.25, blur: 3, fade: 420 },   // squash/skew 為預設值，舞台有 light 時以舞台為準
  // 像素畫風：舞台、角色、頭像先畫在 1/size 的低解析畫布再硬邊放大（文字與血條維持高解析）
  // stageColors/charColors/artColors = 減色後的色數；dither = 抖色強度（0 = 不抖色）；floorScroll = 地板透視捲動
  // charSize/artSize：角色、頭像用較細的像素（保留臉部與服裝細節）；sharpen = 減色前銳化強度
  pixel: { size: 3, charSize: 2, artSize: 2, stageColors: 40, charColors: 64, artColors: 64, sharpen: 0.5, dither: 0, sat: 1.1, contrast: 1.06, floorScroll: true },
  map: { x: -5, y: -90, w: 1100 },   // 世界地圖圖片在畫面上的位置與寬度（等距圓柱投影，地點依經緯度換算）
  camZoom: 1.2,          // 對戰鏡頭拉近倍率（以地面為軸放大，角色佔滿畫面高度）
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
  // 各畫面版面（DEV 工具「畫面版面」可調）
  screens: {
    title:  { logoY: 230, logoS: 1, portraitX: 250, portraitY: 130, portraitH: 620, startY: 520 },
    select: { portraitX: 190, portraitY: 400, portraitH: 320, nameY: 396, slotY: 524, slot: 92 },
    vs:     { portraitX: 320, portraitY: 60, portraitH: 580, nameY: 536, quoteY: 640 },
    story:  { boxX: 100, boxY: 500, boxW: 1080, boxH: 168, textSize: 25, portraitX: 1010, portraitY: 70, portraitH: 520 },
    result: { winX: 300, winY: 100, winH: 520, loseX: 990, loseY: 150, loseH: 470, quoteY: 600, menuY: 300 },
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
// light = 影子方向 [壓扁, 斜度]：壓扁負值 = 逆光（影子落在腳前、往鏡頭方向），正值 = 順光（影子往後方地面延伸）
// floor = 地板在圖中開始的高度比例：以下每一列依遠近用不同速度捲動（越近越快，角色腳下與角色同速）
// dust = 落地、滑行揚起的塵土顏色（雪地、沙地、雨水…）
// fg = 前景物件（畫在角色前面）：x = 舞台位置、h = 畫面高度、p = 捲動倍率（>1 比角色快）、at = 貼齊畫面上緣／下緣、dy = 上下位移
export const STAGES = {
  market: { name: 'NEON MARKET', nameZh: '霓虹夜市', img: 'assets/stages/market.webp', scale: 1.0, y: 0.80, parallax: 0.85, tint: 'rgba(20,10,40,0.10)', bgm: 0, light: [-0.13, 0.25], floor: 0.665, dust: '#a8c0e0', fg: [{ id: 'market_lanterns', x: 648, h: 140, p: 1.35, at: 'top', dy: 40 }, { id: 'market_lanterns', x: 1252, h: 140, p: 1.35, at: 'top', dy: 30 }, { id: 'market_cart', x: 605, h: 260, p: 1.45, at: 'bottom', dy: 50 }] },
  beach:  { name: 'SUNSET RODA', nameZh: '夕陽廣場', img: 'assets/stages/beach.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: 'rgba(40,10,0,0.05)', bgm: 1, light: [-0.12, 0.45], floor: 0.68, dust: '#e8c99a', fg: [{ id: 'beach_palm', x: 600, h: 330, p: 1.4, at: 'top', dy: -40 }, { id: 'beach_drums', x: 1295, h: 230, p: 1.45, at: 'bottom', dy: 40 }] },
  steppe: { name: 'GREAT STEPPE', nameZh: '草原祭典', img: 'assets/stages/steppe.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: '', bgm: 2, light: [0.18, 0.5], floor: 0.69, dust: '#b8946a', fg: [{ id: 'steppe_flags', x: 648, h: 110, p: 1.35, at: 'top', dy: 50 }, { id: 'steppe_flags', x: 1252, h: 110, p: 1.35, at: 'top', dy: 40 }, { id: 'steppe_cart', x: 605, h: 240, p: 1.45, at: 'bottom', dy: 40 }] },
  harbor: { name: 'FROZEN HARBOR', nameZh: '極光港口', img: 'assets/stages/harbor.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: 'rgba(10,20,50,0.08)', bgm: 3, light: [-0.12, -0.2], floor: 0.7, dust: '#f0f6ff', fg: [{ id: 'harbor_icicles', x: 648, h: 110, p: 1.35, at: 'top', dy: 40 }, { id: 'harbor_icicles', x: 1252, h: 110, p: 1.35, at: 'top', dy: 30 }, { id: 'harbor_crates', x: 1295, h: 250, p: 1.45, at: 'bottom', dy: 40 }] },
  rooftop: { name: 'MOONLIT ROOFS', nameZh: '月下屋頂', img: 'assets/stages/rooftop.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: 'rgba(20,10,40,0.08)', bgm: 4, light: [0.16, -0.45], floor: 0.73, dust: '#a0a0b0', fg: [{ id: 'rooftop_branch', x: 600, h: 240, p: 1.4, at: 'top', dy: 20 }, { id: 'rooftop_lantern', x: 1295, h: 280, p: 1.45, at: 'bottom', dy: 50 }] },
  temple: { name: 'CLOUD TEMPLE', nameZh: '雲海寺院', img: 'assets/stages/temple.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: '', bgm: 5, light: [0.18, 0.35], floor: 0.72, dust: '#d6cdb6', fg: [{ id: 'temple_bell', x: 1250, h: 300, p: 1.35, at: 'top', dy: -20 }, { id: 'temple_burner', x: 605, h: 250, p: 1.45, at: 'bottom', dy: 50 }] },
  gym:    { name: 'UNDERGROUND RING', nameZh: '地下拳場', img: 'assets/stages/gym.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: 'rgba(0,0,0,0.08)', bgm: 6, light: [-0.1, 0.12], floor: 0.75, dust: '#8a8078', fg: [{ id: 'gym_bag', x: 640, h: 360, p: 1.35, at: 'top', dy: -40 }, { id: 'gym_bag', x: 1260, h: 360, p: 1.35, at: 'top', dy: -60 }, { id: 'gym_stool', x: 1295, h: 220, p: 1.45, at: 'bottom', dy: 40 }] },
  // 拳帖四天王的舞台
  ruins:   { name: 'TITAN RUINS', nameZh: '泰坦神殿', img: 'assets/stages/ruins.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: '', bgm: 9, light: [0.15, 0.3], floor: 0.72, dust: '#d8d0c0', boss: true },
  pyramid: { name: 'SAND PHARAOH', nameZh: '金字塔', img: 'assets/stages/pyramid.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: '', bgm: 10, light: [-0.12, 0.3], floor: 0.72, dust: '#e0c890', boss: true },
  volcano: { name: 'MAGMA CRATER', nameZh: '熔岩火山口', img: 'assets/stages/volcano.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: '', bgm: 11, light: [-0.12, -0.25], floor: 0.72, dust: '#6a5a58', boss: true },
  summit:  { name: 'TIGER SUMMIT', nameZh: '拳帖之巔', img: 'assets/stages/summit.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: 'rgba(10,10,40,0.08)', bgm: 12, light: [0.15, -0.3], floor: 0.72, dust: '#b0a090', boss: true },
  stadium: { name: 'NIGHT STADIUM', nameZh: '夜光拳館', img: 'assets/stages/stadium.webp', scale: 1.0, y: 0.82, parallax: 0.85, tint: '', bgm: 7, light: [0.14, -0.3], floor: 0.73, dust: '#c9a87a', fg: [{ id: 'stadium_garland', x: 648, h: 100, p: 1.35, at: 'top', dy: 50 }, { id: 'stadium_garland', x: 1252, h: 100, p: 1.35, at: 'top', dy: 40 }, { id: 'stadium_drum', x: 605, h: 230, p: 1.45, at: 'bottom', dy: 40 }] },
};

// 物理（角色個別值在角色檔覆寫）
export const PHYS = {
  gravity: 0.86,
  fallMul: 1.12,         // 過最高點後的重力倍率（下落較快，跳躍不飄）
  jumpMul: 1.08,         // 一般跳躍初速倍率（跳得更高，用滿畫面上半部）
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
  // 頓幀與震動：L/M/H = 普通技，SL/SM/SH = 必殺技輕／中／重，S = 無強度的必殺（超必殺等）
  hitstop: { L: 6, M: 10, H: 15, S: 12, SL: 9, SM: 12, SH: 17, SU: 16, KO: 30 },
  shake: { L: 0, M: 2, H: 6, SL: 2, SM: 4, SH: 9, KD: 7, KO: 12 },
  sparkScale: 1.0,
  koSlow: 3,             // KO 慢動作倍率
  superFlash: 44,        // 超必殺暗場 tick
  hitFlash: 3,
  hitShake: { L: 2, M: 4, H: 6, SL: 4, SM: 6, SH: 8, SU: 8 },   // 頓幀中受擊者抖動幅度
  zoom: { H: 0.03, SM: 0.025, SH: 0.05, SU: 0.06, KO: 0.09, J: 0.04 },   // 重擊鏡頭衝擊縮放（J = 跳入重擊）
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
