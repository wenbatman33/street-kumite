#!/usr/bin/env python3
"""角色 sprite 後處理：洋紅去背 → 連通區塊切格 → 腳底/重心錨點 → 依站姿參考格統一縮放 → 打包 atlas

用法：python3 scripts/process_sprites.py [--only tora,vera,stages,fx,hurt] [--review]
只依賴 Pillow。輸出：
  assets/sprites/<角色>/atlas.json + <角色>_<n>.webp   遊戲用 atlas
  assets/ui/portrait_<角色>.webp                        頭像
  assets/ui/portrait_<角色>_hurt.webp                   落敗頭像
  assets/stages/<舞台>.webp                             舞台背景
  assets_src/review/<角色>/<動作>.png                  檢查用接觸表（錨點、身高線）
  assets_src/review/report.json                         每張 strip 的檢驗結果
"""
import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
M = json.loads((ROOT / 'scripts/asset_manifest.json').read_text())
RAW = ROOT / M['rawDir']
OUT_SPR = ROOT / 'assets/sprites'
OUT_UI = ROOT / 'assets/ui'
OUT_STAGE = ROOT / 'assets/stages'
REVIEW = ROOT / 'assets_src/review'

STAND_H = 360          # 站姿身高（atlas 像素）
FX_H = 150             # 飛行道具高度
PAGE = 2048            # atlas 頁面尺寸
PAD = 2                # 每格間距
T0, T1 = 48, 110       # 去背：與色鍵的距離 ≤T0 全透明、≥T1 全不透明
DS = 4                 # 連通區塊分析的降採樣倍率


# ---------- 去背 ----------
def border_key(im):
    """取四邊像素的中位數當色鍵（AI 給的洋紅未必是純 #FF00FF）"""
    w, h = im.size
    px = im.load()
    samples = []
    for x in range(0, w, 4):
        samples += [px[x, 0], px[x, h - 1]]
    for y in range(0, h, 4):
        samples += [px[0, y], px[w - 1, y]]
    # 角色貼到圖邊（頭像常見）時，只用像洋紅的邊緣像素算中位數
    mag = [s for s in samples if s[0] > 170 and s[2] > 170 and s[1] < 100]
    if len(mag) >= len(samples) * 0.1:
        samples = mag
    return tuple(sorted(s[i] for s in samples)[len(samples) // 2] for i in range(3))


def remove_key(im):
    im = im.convert('RGB')
    key = border_key(im)
    diff = ImageChops.difference(im, Image.new('RGB', im.size, key))
    r, g, b = diff.split()
    d = ImageChops.lighter(ImageChops.lighter(r, g), b)
    alpha = d.point(lambda v: 0 if v <= T0 else 255 if v >= T1 else int((v - T0) * 255 / (T1 - T0)))
    # 邊緣色鍵溢色：半透明像素做反混色、外圈 2px 做去洋紅
    edge = alpha.filter(ImageFilter.MinFilter(5))
    rgb = list(im.get_flattened_data())
    al = list(alpha.get_flattened_data())
    eg = list(edge.get_flattened_data())
    kr, kg, kb = key
    out = []
    for i, (c, a) in enumerate(zip(rgb, al)):
        if a == 0:
            out.append((0, 0, 0, 0))
            continue
        cr, cg, cb = c
        if a < 255:
            f = a / 255
            cr = (cr - (1 - f) * kr) / f
            cg = (cg - (1 - f) * kg) / f
            cb = (cb - (1 - f) * kb) / f
        if a < 255 or eg[i] < 255:
            ex = min(cr, cb) - cg
            if ex > 0:
                cr -= ex * 0.85
                cb -= ex * 0.85
        out.append((max(0, min(255, int(cr))), max(0, min(255, int(cg))), max(0, min(255, int(cb))), a))
    rgba = Image.new('RGBA', im.size)
    rgba.putdata(out)
    return rgba, key


# ---------- 連通區塊 ----------
def components(alpha):
    """在降採樣遮罩上做 8 連通標記（先膨脹，讓分離的特效/手腳併入同一塊）"""
    w, h = alpha.size
    sw, sh = w // DS, h // DS
    small = alpha.resize((sw, sh), Image.BOX).point(lambda v: 255 if v > 24 else 0)
    dil = small.filter(ImageFilter.MaxFilter(5))
    sp = list(small.get_flattened_data())
    dp = list(dil.get_flattened_data())
    labels = [0] * (sw * sh)
    comps = []
    for start in range(sw * sh):
        if not dp[start] or labels[start]:
            continue
        lid = len(comps) + 1
        q = deque([start])
        labels[start] = lid
        x0 = y0 = 10 ** 9
        x1 = y1 = -1
        area = sx = sy = 0
        while q:
            i = q.popleft()
            x, y = i % sw, i // sw
            if sp[i]:
                area += 1
                sx += x
                sy += y
                x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= sh:
                    continue
                for dx in (-1, 0, 1):
                    nx = x + dx
                    if nx < 0 or nx >= sw:
                        continue
                    j = ny * sw + nx
                    if dp[j] and not labels[j]:
                        labels[j] = lid
                        q.append(j)
        if area:
            comps.append({'id': lid, 'area': area, 'bbox': (x0, y0, x1, y1), 'c': (sx / area, sy / area)})
        else:
            comps.append({'id': lid, 'area': 0, 'bbox': (0, 0, 0, 0), 'c': (0, 0)})
    return comps, labels, (sw, sh)


def split_spanning(comps, labels, size_small, grid, issues):
    """單一區塊橫跨多格（特效黏到鄰格角色）→ 依格線切成多塊"""
    R, C = grid
    sw, sh = size_small
    cw, chh = sw / C, sh / R
    out = []
    next_id = max([c['id'] for c in comps] + [0]) + 1
    for c in comps:
        x0, y0, x1, y1 = c['bbox']
        if c['area'] == 0 or (int(x0 / cw) == int(min(x1, sw - 1) / cw) and int(y0 / chh) == int(min(y1, sh - 1) / chh)):
            out.append(c)
            continue
        parts = {}
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                i = y * sw + x
                if labels[i] != c['id']:
                    continue
                cell = (min(R - 1, int(y / chh)), min(C - 1, int(x / cw)))
                p = parts.setdefault(cell, {'n': 0, 'sx': 0, 'sy': 0, 'b': [x, y, x, y], 'px': []})
                p['n'] += 1; p['sx'] += x; p['sy'] += y
                b = p['b']; b[0] = min(b[0], x); b[1] = min(b[1], y); b[2] = max(b[2], x); b[3] = max(b[3], y)
                p['px'].append(i)
        big = [p for p in parts.values() if p['n'] >= c['area'] * 0.15]
        if len(big) <= 1:
            out.append(c)
            continue
        issues.append('split_merged')
        # 主要切塊各自成為新區塊；越格的小碎片（特效尖端）歸回面積最大的那塊
        big.sort(key=lambda p: -p['n'])
        for p in parts.values():
            if p not in big:
                tgt = big[0]
                tgt['n'] += p['n']; tgt['sx'] += p['sx']; tgt['sy'] += p['sy']; tgt['px'] += p['px']
                b, q = tgt['b'], p['b']
                tgt['b'] = [min(b[0], q[0]), min(b[1], q[1]), max(b[2], q[2]), max(b[3], q[3])]
        for p in big:
            nid = next_id
            next_id += 1
            for i in p['px']:
                labels[i] = nid
            out.append({'id': nid, 'area': p['n'], 'bbox': tuple(p['b']), 'c': (p['sx'] / p['n'], p['sy'] / p['n'])})
    return out


def assign_cells(comps, size_small, grid, issues):
    """把區塊分配到格子：主區塊（夠大）優先依閱讀順序，不合就依重心所在格"""
    R, C = grid
    N = R * C
    sw, sh = size_small
    real = [c for c in comps if c['area'] > 0]
    if not real:
        issues.append('no_content')
        return [[] for _ in range(N)]
    amax = max(c['area'] for c in real)
    srt = sorted(real, key=lambda c: -c['area'])
    # 前 N 大區塊明顯大於第 N+1 塊 → 直接視為 N 個角色（避免發光特效格讓正常格被誤判成碎片）
    if len(srt) >= N and srt[N - 1]['area'] > amax * 0.05 and (len(srt) == N or srt[N]['area'] < srt[N - 1]['area'] * 0.5):
        majors = srt[:N]
    else:
        majors = [c for c in real if c['area'] >= amax * 0.18]
    mid = {c['id'] for c in majors}
    minors = [c for c in real if c['id'] not in mid and c['area'] >= max(6, amax * 0.004)]
    cells = [[] for _ in range(N)]

    def cell_of(pt):
        cx = min(C - 1, max(0, int(pt[0] / (sw / C))))
        cy = min(R - 1, max(0, int(pt[1] / (sh / R))))
        return cy * C + cx

    by_grid = [[] for _ in range(N)]
    for c in majors:
        by_grid[cell_of(c['c'])].append(c)
    grid_ok = all(len(b) == 1 for b in by_grid)
    if grid_ok:
        cells = [list(b) for b in by_grid]
    elif len(majors) == N:
        # AI 沒照格線放，但數量正確 → 依閱讀順序（先分列再依 x）
        srt = sorted(majors, key=lambda c: c['c'][1])
        rows = [sorted(srt[r * C:(r + 1) * C], key=lambda c: c['c'][0]) for r in range(R)]
        cells = [[c] for row in rows for c in row]
        issues.append('reading_order_fallback')
    else:
        cells = [list(b) for b in by_grid]
        issues.append(f'majors={len(majors)}/{N}')
        for i, b in enumerate(by_grid):
            if not b:
                issues.append(f'empty_cell_{i}')
    # 次要區塊（汗珠、特效碎片）併入距離最近的主區塊所在格
    for m in minors:
        best, bd = None, 1e18
        for i, b in enumerate(cells):
            for c in b:
                x0, y0, x1, y1 = c['bbox']
                dx = max(x0 - m['c'][0], 0, m['c'][0] - x1)
                dy = max(y0 - m['c'][1], 0, m['c'][1] - y1)
                d = dx * dx + dy * dy
                if d < bd:
                    best, bd = i, d
        if best is not None and bd < (sw / C * 0.25) ** 2:
            cells[best].append(m)
    return cells


def extract(rgba, labels, size_small, comp_list):
    """依區塊標記從原圖切出該格（排除鄰格侵入的像素），並裁到不透明範圍"""
    sw, sh = size_small
    ids = {c['id'] for c in comp_list}
    if not ids:
        return None
    x0 = min(c['bbox'][0] for c in comp_list) - 2
    y0 = min(c['bbox'][1] for c in comp_list) - 2
    x1 = max(c['bbox'][2] for c in comp_list) + 3
    y1 = max(c['bbox'][3] for c in comp_list) + 3
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(sw, x1), min(sh, y1)
    mw, mh = x1 - x0, y1 - y0
    m = Image.new('L', (mw, mh), 0)
    mp = m.load()
    for yy in range(mh):
        row = (y0 + yy) * sw
        for xx in range(mw):
            if labels[row + x0 + xx] in ids:
                mp[xx, yy] = 255
    m = m.filter(ImageFilter.MaxFilter(3)).resize((mw * DS, mh * DS), Image.NEAREST)
    crop = rgba.crop((x0 * DS, y0 * DS, x1 * DS, y1 * DS))
    a = ImageChops.multiply(crop.getchannel('A'), m)
    crop.putalpha(a)
    bb = a.point(lambda v: 255 if v > 10 else 0).getbbox()
    if not bb:
        return None
    touches = x0 == 0 or y0 == 0 or x1 == sw or y1 == sh
    return crop.crop(bb), touches


# ---------- 量測 ----------
def measure(im):
    """foot=(身體柱中心 x, 腳底 y)；mass=重心；reach=最前端（右側）肢體的 x 與其 y 範圍"""
    w, h = im.size
    a = im.getchannel('A').point(lambda v: 1 if v > 128 else 0)
    ap = a.load()
    cols = [0] * w
    rows = [0] * h
    for y in range(h):
        for x in range(w):
            if ap[x, y]:
                cols[x] += 1
                rows[y] += 1
    total = sum(cols) or 1
    cmax = max(cols) or 1
    strong = [(x, c) for x, c in enumerate(cols) if c >= cmax * 0.55]
    fx = sum(x * c for x, c in strong) / (sum(c for _, c in strong) or 1)
    mx = sum(x * c for x, c in enumerate(cols)) / total
    my = sum(y * c for y, c in enumerate(rows)) / total
    # 最右端 12% 寬度內的不透明像素 y 範圍（推算攻擊判定用）
    band = max(4, int(w * 0.12))
    ys = [y for y in range(h) for x in range(w - band, w) if ap[x, y]]
    ry0, ry1 = (min(ys), max(ys)) if ys else (0, h)
    return {'fx': fx, 'fy': h, 'cx': mx, 'cy': my, 'rx': w, 'ry0': ry0, 'ry1': ry1}


def thumb_sig(im):
    t = Image.new('RGBA', im.size, (0, 0, 0, 255))
    t.alpha_composite(im)
    return list(t.convert('L').resize((24, 24)).get_flattened_data())


def sig_diff(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


# ---------- 單張 strip ----------
def process_strip(path, grid, mode, issues):
    src = Image.open(path)
    rgba, key = remove_key(src)
    comps, labels, ssize = components(rgba.getchannel('A'))
    real = [c for c in comps if c['area'] > 0]
    big = sorted(real, key=lambda c: -c['area'])
    if len([c for c in big if c['area'] > big[0]['area'] * 0.18]) < grid[0] * grid[1]:
        comps = split_spanning(comps, labels, ssize, grid, issues)
    cells = assign_cells(comps, ssize, grid, issues)
    frames = []
    for i, cl in enumerate(cells):
        r = extract(rgba, labels, ssize, cl)
        if r is None:
            frames.append(None)
            continue
        im, touches = r
        if touches:
            issues.append(f'touches_edge_{i}')
        frames.append(im)
    return frames, key, src.size


def scale_frames(frames, s):
    out = []
    for im in frames:
        if im is None:
            out.append(None)
            continue
        w, h = im.size
        out.append(im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS))
    return out


def review_sheet(frames, metas, path, title):
    """檢查用接觸表：每格畫腳底錨點（紅）、重心（藍）、站姿身高線（綠）"""
    cw = max([f.size[0] for f in frames if f] + [64]) + 20
    ch = max([f.size[1] for f in frames if f] + [64]) + 40
    sheet = Image.new('RGBA', (cw * len(frames), ch), (40, 40, 48, 255))
    d = ImageDraw.Draw(sheet)
    for i, (f, m) in enumerate(zip(frames, metas)):
        ox = i * cw
        d.rectangle([ox, 0, ox + cw - 1, ch - 1], outline=(90, 90, 100))
        d.text((ox + 4, 2), f'{title}#{i}', fill=(255, 255, 255))
        if not f:
            continue
        base = ch - 10
        px = ox + 10
        py = base - f.size[1]
        sheet.alpha_composite(f, (px, py))
        d.line([ox, base, ox + cw, base], fill=(255, 220, 0))
        d.line([ox, base - STAND_H, ox + cw, base - STAND_H], fill=(0, 200, 0))
        fx = px + m['fx']
        d.line([fx, base - 12, fx, base + 6], fill=(255, 0, 0), width=3)
        d.ellipse([px + m['cx'] - 4, py + m['cy'] - 4, px + m['cx'] + 4, py + m['cy'] + 4], outline=(0, 160, 255), width=2)
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert('RGB').save(path)


# ---------- atlas 打包 ----------
def pack(entries, prefix, outdir):
    """簡易 shelf packing：依高度排序，填入 PAGE×PAGE 頁面"""
    order = sorted(range(len(entries)), key=lambda i: -entries[i]['im'].size[1])
    pages = [Image.new('RGBA', (PAGE, PAGE), (0, 0, 0, 0))]
    x = y = shelf = 0
    for i in order:
        im = entries[i]['im']
        w, h = im.size
        if x + w + PAD > PAGE:
            x, y, shelf = 0, y + shelf + PAD, 0
        if y + h + PAD > PAGE:
            pages.append(Image.new('RGBA', (PAGE, PAGE), (0, 0, 0, 0)))
            x = y = shelf = 0
        pages[-1].alpha_composite(im, (x, y))
        entries[i]['rect'] = (len(pages) - 1, x, y, w, h)
        x += w + PAD
        shelf = max(shelf, h)
    names = []
    outdir.mkdir(parents=True, exist_ok=True)
    for n, pg in enumerate(pages):
        bb = pg.getbbox() or (0, 0, 1, 1)
        pg = pg.crop((0, 0, PAGE, min(PAGE, bb[3] + 1)))
        name = f'{prefix}_{n}.webp'
        pg.save(outdir / name, 'WEBP', quality=92, method=6)
        names.append(name)
    return names


def process_character(cid, report):
    c = M['characters'][cid]
    src = RAW / cid
    entries = []
    anims = {}
    strips = {**M.get('templates', {}), **c['strips']}
    for anim, spec in strips.items():
        p = src / f'{anim}.png'
        if not p.exists():
            report[f'{cid}/{anim}'] = {'pass': False, 'issues': ['missing']}
            continue
        issues = []
        frames, key, size = process_strip(p, spec['grid'], 'foot', issues)
        valid = [f for f in frames if f]
        if not valid:
            report[f'{cid}/{anim}'] = {'pass': False, 'issues': issues + ['no_frames']}
            continue
        # 縮放基準：第 1 格是站姿參考（walk 例外，用全部格的中位數）
        if anim == 'walk' or not frames[0]:
            hs = sorted(f.size[1] for f in valid)
            ref_h = hs[len(hs) // 2] / 0.98
        else:
            ref_h = frames[0].size[1]
        s = STAND_H / ref_h
        frames = scale_frames(frames, s)
        metas = [measure(f) if f else None for f in frames]
        # 重複格檢查
        sigs = [thumb_sig(f) if f else None for f in frames]
        dups = 0
        for i in range(1, len(sigs)):
            if sigs[i] and sigs[i - 1] and sig_diff(sigs[i], sigs[i - 1]) < 2.0:
                dups += 1
        if dups >= max(2, len(frames) // 2):
            issues.append(f'duplicate_frames={dups}')
        hard = [x for x in issues if x.startswith(('majors', 'empty', 'no_', 'duplicate'))]
        report[f'{cid}/{anim}'] = {'pass': not hard, 'issues': issues, 'frames': len(valid),
                                   'scale': round(s, 3), 'key': key, 'raw': list(size)}
        review_sheet(frames, metas, REVIEW / cid / f'{anim}.png', anim)
        lst = []
        for f, m in zip(frames, metas):
            if f is None:
                lst.append(None)
                continue
            e = {'im': f, 'meta': m}
            entries.append(e)
            lst.append(e)
        anims[anim] = lst
    # 飛行道具（重心錨點）
    for fid, f in M['fx'].items():
        if not fid.startswith(cid + '_'):
            continue
        p = RAW / 'fx' / f'{fid}.png'
        if not p.exists():
            continue
        issues = []
        frames, key, size = process_strip(p, f['grid'], 'mass', issues)
        valid = [x for x in frames if x]
        hs = sorted(x.size[1] for x in valid)
        s = f.get('h', FX_H) / hs[len(hs) // 2]
        frames = scale_frames(frames, s)
        metas = [measure(x) if x else None for x in frames]
        report[f'fx/{fid}'] = {'pass': len(valid) == len(frames), 'issues': issues, 'frames': len(valid)}
        review_sheet(frames, metas, REVIEW / cid / f'{fid}.png', fid)
        lst = []
        for x, m in zip(frames, metas):
            if x is None:
                continue
            e = {'im': x, 'meta': m}
            entries.append(e)
            lst.append(e)
        anims[fid.split('_', 1)[1]] = lst
    if not entries:
        return
    outdir = OUT_SPR / cid
    pages = pack(entries, cid, outdir)
    atlas = {'char': cid, 'standH': STAND_H, 'pages': pages, 'anims': {}}
    for anim, lst in anims.items():
        out = []
        for e in lst:
            if e is None:
                out.append(None)
                continue
            pg, x, y, w, h = e['rect']
            m = e['meta']
            out.append({'p': pg, 'x': x, 'y': y, 'w': w, 'h': h,
                        'fx': round(m['fx'], 1), 'fy': m['fy'], 'cx': round(m['cx'], 1), 'cy': round(m['cy'], 1),
                        'rx': m['rx'], 'ry0': m['ry0'], 'ry1': m['ry1']})
        atlas['anims'][anim] = out
    (outdir / 'atlas.json').write_text(json.dumps(atlas, separators=(',', ':')))
    print(f'[atlas] {cid}: {len(entries)} 格、{len(pages)} 頁 → {outdir}')


def process_portrait(cid, report, name='portrait', out=None):
    p = RAW / cid / f'{name}.png'
    if not p.exists():
        return
    rgba, _ = remove_key(Image.open(p))
    comps, labels, ssize = components(rgba.getchannel('A'))
    big = [c for c in comps if c['area'] > 0]
    big.sort(key=lambda c: -c['area'])
    r = extract(rgba, labels, ssize, big[:1] + [c for c in big[1:] if c['area'] > big[0]['area'] * 0.05])
    if not r:
        return
    im = r[0]
    im.thumbnail((512, 512), Image.LANCZOS)
    OUT_UI.mkdir(parents=True, exist_ok=True)
    out = out or f'portrait_{cid}.webp'
    im.save(OUT_UI / out, 'WEBP', quality=90, method=6)
    report[f'{cid}/{name}'] = {'pass': True, 'size': im.size}
    print(f'[{name}] {cid} {im.size}')


def process_stages(report):
    for sid in M['stages']:
        p = RAW / 'stages' / f'{sid}.png'
        if not p.exists():
            continue
        im = Image.open(p).convert('RGB')
        OUT_STAGE.mkdir(parents=True, exist_ok=True)
        im.save(OUT_STAGE / f'{sid}.webp', 'WEBP', quality=86, method=6)
        report[f'stage/{sid}'] = {'pass': True, 'size': im.size}
        print(f'[stage] {sid} {im.size}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    args = ap.parse_args()
    only = [x for x in args.only.split(',') if x]
    rp = REVIEW / 'report.json'
    report = json.loads(rp.read_text()) if rp.exists() else {}
    for cid in M['characters']:
        if only and cid not in only:
            continue
        process_character(cid, report)
        process_portrait(cid, report)
    if not only or 'stages' in only:
        process_stages(report)
    # 舞台前景物件：洋紅去背、取最大連通區塊、長邊縮到 768
    if not only or 'props' in only:
        for pid in M.get('props', {}):
            src = RAW / 'props' / f'{pid}.png'
            if not src.exists():
                continue
            rgba, _ = remove_key(Image.open(src))
            bbox = rgba.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
            if not bbox:
                continue
            im = rgba.crop(bbox)
            im.thumbnail((768, 768), Image.LANCZOS)
            (ROOT / 'assets/stages/fg').mkdir(parents=True, exist_ok=True)
            im.save(ROOT / 'assets/stages/fg' / f'{pid}.webp', 'WEBP', quality=88, method=6)
            report[f'prop/{pid}'] = {'pass': True, 'size': im.size}
            print(f'[prop] {pid} {im.size}')
    # 世界地圖
    if not only or 'extra' in only:
        src = RAW / 'ui' / 'worldmap.png'
        if src.exists():
            im = Image.open(src).convert('RGB')
            im.save(OUT_UI / 'worldmap.webp', 'WEBP', quality=88, method=6)
            print(f'[extra] worldmap {im.size}')
    # 落敗頭像（scripts/gen_hurt_portraits.mjs 產生）
    if not only or 'hurt' in only:
        for cid in M['characters']:
            process_portrait(cid, report, 'portrait_hurt', f'portrait_{cid}_hurt.webp')
    REVIEW.mkdir(parents=True, exist_ok=True)
    rp.write_text(json.dumps(report, ensure_ascii=False, indent=1))
    bad = {k: v for k, v in report.items() if not v.get('pass')}
    print(f'=== 檢驗：{len(report) - len(bad)} 通過 / {len(bad)} 未通過 ===')
    for k, v in bad.items():
        print(f'  ✗ {k}: {v.get("issues")}')


if __name__ == '__main__':
    main()
