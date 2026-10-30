#!/usr/bin/env python3
"""產生 PWA／主畫面圖示：TORA 頭像 + 放射光背景 + KUMITE 標題字（跟遊戲標題同風格）

用法：python3 scripts/make_icons.py
輸出：assets/icons/
  icon-192.png、icon-512.png        manifest 一般圖示（purpose any）
  icon-maskable-512.png             Android 自適應圖示（重點縮在中央 80% 安全區）
  apple-touch-icon.png（180）        iPhone「加入主畫面」
  favicon-32.png、favicon-64.png     分頁小圖示
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from make_og import FONT_LOGO, ROOT, gradient_text

M = 1024                       # 先畫 1024 母版再縮小
OUT = ROOT / 'assets/icons'


def background(size):
    """深紫底 + 頭後方橘紅放射光（街機標題的爆炸感）"""
    img = Image.new('RGBA', (size, size), (10, 4, 16, 255))
    d = ImageDraw.Draw(img)
    cx, cy, r = size * 0.5, size * 0.4, size * 1.2
    n = 18
    for i in range(n):
        a0 = (i / n) * math.tau
        a1 = a0 + math.tau / n * 0.55
        col = (255, 106, 0, 255) if i % 2 else (196, 26, 0, 255)
        d.polygon([(cx, cy), (cx + math.cos(a0) * r, cy + math.sin(a0) * r), (cx + math.cos(a1) * r, cy + math.sin(a1) * r)], fill=col)
    # 外圈壓暗，讓中間的人物跳出來
    vig = Image.new('L', (size, size), 0)
    ImageDraw.Draw(vig).ellipse([size * -0.15, size * -0.25, size * 1.15, size * 1.05], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(size * 0.12))
    dark = Image.new('RGBA', (size, size), (10, 4, 16, 255))
    dark.putalpha(Image.eval(vig, lambda v: round((255 - v) * 0.85)))
    img.alpha_composite(dark)
    return img


def foreground(size, k=1.0):
    """人物 + 標題字；k = 內容縮放（自適應圖示要縮進安全區）"""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    p = Image.open(ROOT / 'assets/ui/portrait_tora.webp').convert('RGBA')
    ph = round(size * 1.05 * k)
    p = p.resize((round(p.width * ph / p.height), ph), Image.LANCZOS)
    # 頭部（原圖 x≈290）對齊畫面中線，身體延伸出底部
    px = round(size / 2 - 290 / 512 * p.width)
    py = round(size * (0.5 - 0.47 * k))
    # 黑色外框輪廓，縮小後人物邊緣才清楚
    sil = Image.new('RGBA', p.size, (20, 6, 4, 255))
    sil.putalpha(p.getchannel('A').filter(ImageFilter.MaxFilter(9)))
    layer.alpha_composite(sil, (px, py))
    layer.alpha_composite(p, (px, py))
    # 下方暗帶托住標題字
    band = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    y0 = size * (0.5 + 0.2 * k)
    for y in range(round(y0), size):
        a = min(1, (y - y0) / (size * 0.12 * k))
        bd.line([(0, y), (size, y)], fill=(10, 4, 16, round(215 * a)))
    layer.alpha_composite(band)
    font = ImageFont.truetype(FONT_LOGO, round(size * 0.24 * k))
    gradient_text(layer, (size // 2, round(size * (0.5 + 0.34 * k))), 'KUMITE', font, sw=max(2, round(size * 0.016 * k)))
    return layer


def compose(size, k=1.0, bleed=True):
    img = background(size) if bleed else Image.new('RGBA', (size, size), (0, 0, 0, 0))
    img.alpha_composite(foreground(size, k))
    return img


def save(img, name, px):
    out = OUT / name
    img.resize((px, px), Image.LANCZOS).convert('RGB').save(out, 'PNG', optimize=True)
    print(f'{out.relative_to(ROOT)} {px}x{px} {out.stat().st_size // 1024}KB')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    full = compose(M)
    save(full, 'icon-512.png', 512)
    save(full, 'icon-192.png', 192)
    save(full, 'apple-touch-icon.png', 180)
    save(compose(M, k=0.8), 'icon-maskable-512.png', 512)
    # 分頁小圖示：字太小看不清，只放頭像
    fav = background(M)
    p = Image.open(ROOT / 'assets/ui/portrait_tora.webp').convert('RGBA').crop((130, 0, 470, 340)).resize((M, M), Image.LANCZOS)
    fav.alpha_composite(p)
    save(fav, 'favicon-64.png', 64)
    save(fav, 'favicon-32.png', 32)


if __name__ == '__main__':
    main()
