#!/usr/bin/env node
// 落敗頭像（鼻青臉腫、嘴角流血）：以現有頭像為參考圖，透過 codex exec 內建 image_gen 生成
// 用法：node scripts/gen_hurt_portraits.mjs [--jobs 2] [--only tora,vera] [--model gpt-6.1-sol]；已存在的會跳過
// 參考圖：assets_src/raw/<角色>/portrait_ref.png（現有頭像貼在洋紅底）；輸出：assets_src/raw/<角色>/portrait_hurt.png
// 跑完後執行 python3 scripts/process_sprites.py --only hurt
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const M = JSON.parse(readFileSync(resolve(__dirname, 'asset_manifest.json'), 'utf8'));
const rawDir = resolve(root, M.rawDir);
const logDir = resolve(__dirname, 'logs');
mkdirSync(logDir, { recursive: true });
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const jobs = Number(arg('--jobs', 2));
// ChatGPT 帳號登入的 codex 已不支援 gpt-5.5，預設改用 gpt-6.1-sol（可用 --model 或環境變數 CODEX_MODEL 覆寫）
const model = arg('--model', process.env.CODEX_MODEL || 'gpt-6.1-sol');
const only = arg('--only', '').split(',').filter(Boolean);

const items = Object.entries(M.characters)
  .filter(([cid]) => !only.length || only.includes(cid))
  .map(([cid, c]) => ({
    cid,
    ref: resolve(rawDir, cid, 'portrait_ref.png'),
    out: resolve(rawDir, cid, 'portrait_hurt.png'),
    body: `${M.style}.
Head-and-shoulders bust portrait of ${c.desc}.
Same character, same framing, same three-quarter view facing right and same size as the attached portrait reference, but right after LOSING a brutal street fight:
bruised and swollen face, one black eye swollen half shut, cuts on the cheek and eyebrow, blood trickling from the corner of the mouth and from the nose, sweat, messy hair, torn and dirty clothes, gritted teeth in pain, defeated exhausted expression.
Same face, hair, outfit and colors as the attached reference.
The whole background is ONE flat solid magenta color #FF00FF; the character contains no magenta or pink. No text.`,
  }))
  .filter((it) => existsSync(it.ref) && !existsSync(it.out));

function run(it) {
  const text = `請用內建 image_gen 工具產生一張 1024x1024 的 PNG 圖片。
附件圖是此角色目前的頭像：臉、髮型、服裝、配色、構圖必須與附件一致，只改成落敗受傷的樣子。
請把下面三引號內的英文完整作為 image_gen 的 prompt：
"""
${it.body}
"""
產生後把圖片檔原封不動複製到絕對路徑 ${it.out}（不要縮放、不要裁切）。完成後只回報 OK。`;
  const logFile = resolve(logDir, `${it.cid}__portrait_hurt.log`);
  return new Promise((ok) => {
    const t0 = Date.now();
    const p = spawn('codex', ['exec', '--skip-git-repo-check', '-m', model, '--sandbox', 'workspace-write', '-C', root, text, '-i', it.ref], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    p.stdout.on('data', (b) => { log += b; });
    p.stderr.on('data', (b) => { log += b; });
    // 逾時一律結束子程序，不留孤兒
    const timer = setTimeout(() => p.kill('SIGKILL'), 9 * 60 * 1000);
    const end = () => {
      clearTimeout(timer);
      writeFileSync(logFile, text + '\n\n=== codex output ===\n' + log.slice(-6000));
      console.log(`${existsSync(it.out) ? '[ok]' : '[miss]'} ${it.cid} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      ok();
    };
    p.on('close', end);
    p.on('error', (e) => { log += String(e); end(); });
  });
}

console.log(`待生成 ${items.length} 張，同時 ${jobs} 個`);
const queue = items.slice();
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { for (let it; (it = queue.shift());) await run(it); }));
console.log('=== 完成 ===');
