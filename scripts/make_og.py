#!/usr/bin/env python3
"""產生社群分享預覽圖（Facebook / LINE / X 的 og:image），1200x630

用法：python3 scripts/make_og.py
輸出：assets/og-image.jpg
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630
FONT_LOGO = '/System/Library/Fonts/Supplemental/Impact.ttf'
FONT_TC = '/System/Library/Fonts/STHeiti Medium.ttc'
ROSTER = ['tora', 'vera', 'baatar', 'skye', 'kagero', 'shen', 'drake', 'kanya']


def cover(im, w, h):
    """等比放大裁切到剛好 w x h"""
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def portrait(cid, h):
    im = Image.open(ROOT / f'assets/ui/portrait_{cid}.webp').convert('RGBA')
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def outlined(draw, xy, text, font, fill, stroke, sw, anchor='mm'):
    draw.text(xy, text, font=font, fill=fill, stroke_width=sw, stroke_fill=stroke, anchor=anchor)


def gradient_text(base, xy, text, font, stroke=(20, 6, 4), sw=10):
    """橘紅漸層字 + 黑色外框（跟遊戲標題同風格）"""
    layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    outlined(d, (xy[0] + 5, xy[1] + 7), text, font, (0, 0, 0, 160), (0, 0, 0, 160), sw)   # 陰影
    outlined(d, xy, text, font, stroke, stroke, sw)
    base.alpha_composite(layer)
    mask = Image.new('L', base.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=font, fill=255, anchor='mm')
    bb = mask.getbbox()
    grad = Image.new('RGBA', base.size)
    gd = ImageDraw.Draw(grad)
    stops = [(0, (255, 247, 194)), (0.45, (255, 178, 30)), (0.55, (255, 106, 0)), (1, (196, 26, 0))]
    for y in range(bb[1], bb[3] + 1):
        t = (y - bb[1]) / max(1, bb[3] - bb[1])
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                u = (t - t0) / (t1 - t0)
                gd.line([(bb[0], y), (bb[2], y)], fill=tuple(round(a + (b - a) * u) for a, b in zip(c0, c1)) + (255,))
                break
    base.paste(grad, (0, 0), mask)


def main():
    bg = Image.open(ROOT / 'assets/stages/market.webp').convert('RGB')
    bg = cover(bg, W, H)
    bg = ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(2))).enhance(0.55)
    img = bg.convert('RGBA')

    # 左右兩位主角大頭
    left = portrait('tora', 560)
    img.alpha_composite(left, (-40, H - left.height + 30))
    right = portrait('vera', 560).transpose(Image.FLIP_LEFT_RIGHT)
    img.alpha_composite(right, (W - right.width + 40, H - right.height + 30))

    # 中央暗帶，讓標題清楚
    band = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    for x in range(W):
        a = max(0, 1 - abs(x - W / 2) / 360)
        bd.line([(x, 0), (x, H)], fill=(8, 4, 16, round(170 * a)))
    img.alpha_composite(band)

    logo = ImageFont.truetype(FONT_LOGO, 118)
    gradient_text(img, (W // 2, 128), 'STREET', logo)
    gradient_text(img, (W // 2, 250), 'KUMITE', logo)
    d = ImageDraw.Draw(img)
    tc = ImageFont.truetype(FONT_TC, 40)
    outlined(d, (W // 2, 345), '街 頭 拳 鬥', tc, (255, 255, 255), (20, 6, 4), 6)
    sub = ImageFont.truetype(FONT_TC, 26)
    outlined(d, (W // 2, 398), '原創 8 人網頁格鬥遊戲，瀏覽器直接玩', sub, (255, 233, 168), (20, 6, 4), 5)

    # 底部 8 人頭像列
    size, gap = 92, 10
    total = len(ROSTER) * size + (len(ROSTER) - 1) * gap
    x0, y0 = (W - total) // 2, H - size - 34
    for i, cid in enumerate(ROSTER):
        x = x0 + i * (size + gap)
        tile = Image.new('RGBA', (size, size), (18, 10, 24, 255))
        p = portrait(cid, round(size * 1.25))
        tile.alpha_composite(p, ((size - p.width) // 2, -4))
        frame = Image.new('RGBA', (size + 6, size + 6), (255, 178, 30, 255))
        img.alpha_composite(frame, (x - 3, y0 - 3))
        img.alpha_composite(tile, (x, y0))

    out = ROOT / 'assets/og-image.jpg'
    img.convert('RGB').save(out, 'JPEG', quality=88, optimize=True, progressive=True)
    print(f'{out} {out.stat().st_size // 1024}KB')


if __name__ == '__main__':
    main()
