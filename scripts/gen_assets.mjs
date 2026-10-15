#!/usr/bin/env node
// 透過 codex exec 內建 image_gen 批次生成角色 sprite 原圖（不需 OPENAI_API_KEY）
// 用法：node scripts/gen_assets.mjs [--jobs 4] [--only tora/idle,vera/ref,stage/market] [--force]
// 已存在的檔案會跳過，可中斷續跑。角色的 strip / portrait 會等 ref 設定圖完成後才排入，並附上 ref 當參考圖。
// 全部跑完後執行 python3 scripts/process_sprites.py
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const M = JSON.parse(readFileSync(resolve(__dirname, 'asset_manifest.json'), 'utf8'));
const rawDir = resolve(root, M.rawDir);
const logDir = resolve(__dirname, 'logs');
mkdirSync(logDir, { recursive: true });

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};
const jobs = Number(arg('--jobs', 4));
const only = arg('--only', '').split(',').filter(Boolean);
const force = process.argv.includes('--force');

// 動作名稱（給 image_gen 的英文標題）
const ACTION = {
  idle: 'idle fighting-stance breathing loop', walk: 'walking forward loop', crouch: 'crouching down',
  jump: 'vertical jump', lp: 'standing light jab', hp: 'standing heavy punch', lk: 'standing light kick',
  hk: 'standing heavy kick', crp: 'crouching jab', crk: 'crouching low kick', sweep: 'crouching leg sweep',
  jp: 'jumping punch', jk: 'jumping kick', block: 'blocking (standing and crouching)', hit: 'getting hit reactions',
  down: 'knockdown and getting back up', throw: 'grab and throw', win: 'victory pose',
};

const rulesText = M.rules.map((r) => `- ${r}`).join('\n');

function stripPrompt(cid, c, anim, s) {
  const [R, C] = s.grid;
  const N = R * C;
  const W = C * 512, H = R * 512;
  const label = ACTION[anim] || `special move "${anim}"`;
  const frames = s.frames.map((f, i) => `${i + 1}. ${f}`).join('\n');
  return { size: `${W}x${H}`, body:
`${M.style}.
Animation sprite sheet of ${c.desc}.
Action: ${label}. ${N} frames arranged in a grid of ${R} rows x ${C} columns (each cell about 512x512 pixels).
${M.stanceNote}
Rules:
${rulesText}
Frames (reading order):
${frames}` };
}

function buildItems() {
  const items = [];
  for (const [cid, c] of Object.entries(M.characters)) {
    const dir = resolve(rawDir, cid);
    const ref = resolve(dir, 'ref.png');
    items.push({ id: `${cid}/ref`, out: ref, size: '1024x1024', deps: [], body:
`${M.style}.
Character design reference: ONE single full-body view of ${c.desc}.
Pose: neutral fighting stance, seen from the side in a three-quarter view, FACING RIGHT, knees bent, both fists raised to guard the chin, left foot and left fist forward.
The whole background is ONE flat solid magenta color #FF00FF (pure chroma key); the character contains no magenta or pink. No shadow, no floor, no text. The character is centered with generous margins and fills about 75% of the image height.` });
    items.push({ id: `${cid}/portrait`, out: resolve(dir, 'portrait.png'), size: '1024x1024', deps: [ref], body:
`${M.style}.
${c.portrait}. Same face, hair, outfit and colors as the attached character reference.
The whole background is ONE flat solid magenta color #FF00FF; the character contains no magenta or pink. No text.` });
    for (const [anim, s] of Object.entries(c.strips)) {
      const p = stripPrompt(cid, c, anim, s);
      items.push({ id: `${cid}/${anim}`, out: resolve(dir, `${anim}.png`), size: p.size, deps: [ref], body: p.body });
    }
  }
  for (const [fid, f] of Object.entries(M.fx)) {
    const [R, C] = f.grid;
    const frames = f.frames.map((t, i) => `${i + 1}. ${t}`).join('\n');
    items.push({ id: `fx/${fid}`, out: resolve(rawDir, 'fx', `${fid}.png`), size: `${C * 512}x${R * 512}`, deps: [], body:
`${M.style}.
Animated special-effect sprite sheet: ${f.desc}. ${R * C} frames arranged in a grid of ${R} rows x ${C} columns (each cell about 512x512).
The whole background is ONE flat solid magenta color #FF00FF; the effect contains no magenta or pink. Each frame centered in its own cell with 15% margin, never touching the cell edges. No text, no grid lines.
Frames:
${frames}` });
  }
  for (const [sid, desc] of Object.entries(M.stages)) {
    items.push({ id: `stage/${sid}`, out: resolve(rawDir, 'stages', `${sid}.png`), size: '1536x1024', deps: [], body: desc });
  }
  return items;
}

function instruction(item) {
  const refNote = item.deps.length
    ? '附件圖是此角色的設定參考圖：角色的臉、髮型、服裝、配色、身材比例必須與參考圖完全一致。\n' : '';
  return `請用內建 image_gen 工具產生一張 ${item.size} 的 PNG 圖片。\n${refNote}` +
    `請把下面三引號內的英文完整作為 image_gen 的 prompt（可以補強但不可刪減任何規則）：\n"""\n${item.body}\n"""\n` +
    `產生後把圖片檔原封不動複製到絕對路徑 ${item.out}（不要縮放、不要裁切、不要另做任何處理）。完成後只回報 OK。`;
}

let all = buildItems();
if (only.length) all = all.filter((it) => only.some((o) => it.id === o || it.id.startsWith(o + '/') || it.id.startsWith(o)));
if (force) for (const it of all) if (existsSync(it.out)) unlinkSync(it.out);

let done = 0, skipped = 0, failed = 0;
const pending = [];
for (const it of all) {
  if (existsSync(it.out)) { skipped++; console.log(`[skip] ${it.id}`); } else pending.push(it);
}

function run(item) {
  mkdirSync(dirname(item.out), { recursive: true });
  const text = instruction(item);
  const logFile = resolve(logDir, item.id.replace(/\//g, '__') + '.log');
  writeFileSync(logFile, text + '\n\n=== codex output ===\n');
  const args = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', root, text];
  for (const d of item.deps) args.push('-i', d);
  return new Promise((ok) => {
    const t0 = Date.now();
    const p = spawn('codex', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    p.stdout.on('data', (b) => { log += b; });
    p.stderr.on('data', (b) => { log += b; });
    const timer = setTimeout(() => p.kill('SIGKILL'), 9 * 60 * 1000);
    p.on('close', () => {
      clearTimeout(timer);
      writeFileSync(logFile, text + '\n\n=== codex output ===\n' + log.slice(-6000));
      const sec = ((Date.now() - t0) / 1000).toFixed(0);
      if (existsSync(item.out)) { done++; console.log(`[ok] ${item.id} (${sec}s)`); }
      else { failed++; console.log(`[miss] ${item.id} (${sec}s) — 檔案未產生，見 ${logFile}`); }
      ok();
    });
    p.on('error', (e) => { clearTimeout(timer); failed++; console.log(`[fail] ${item.id}: ${e.message}`); ok(); });
  });
}

// 依相依性取下一個可執行的工作（ref 完成後才放行 strip）
const running = new Set();
function nextReady() {
  const i = pending.findIndex((it) => it.deps.every((d) => existsSync(d)));
  if (i < 0) return null;
  return pending.splice(i, 1)[0];
}
async function worker() {
  for (;;) {
    const it = nextReady();
    if (!it) {
      // 還有在等 ref 的工作，而 ref 仍在跑 → 稍等再看
      const waiting = pending.length && running.size;
      if (!waiting) return;
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    running.add(it.id);
    await run(it);
    running.delete(it.id);
  }
}
console.log(`待生成 ${pending.length} 張，同時 ${jobs} 個工作`);
await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, pending.length)) }, worker));
const left = pending.map((it) => it.id);
if (left.length) console.log(`未執行（相依的 ref 未產生）：${left.join(', ')}`);
console.log(`=== 完成 ${done} / 跳過 ${skipped} / 失敗 ${failed}（共 ${all.length}）===`);
