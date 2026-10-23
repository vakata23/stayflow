"""
Прави прозрачните варианти на логото от design/brand/logo-source.jpg (JPEG на кремав фон) —
всичко за public/brand/ и иконите на приложението. Пуска се с:  python scripts/make-logo-assets.py

Идеята: фонът е плосък крем, фигурите са едноцветни. За всеки пиксел се мери колко е „към цвета на
фигурата“ спрямо фона → това е прозрачността (чисти ръбове без JPEG ореол). Цветът не се взима от
пиксела, а е един чист цвят на блок (къщичка/надпис), та текстурата и шумът на JPEG-а да не личат.

Резултат:
  design/brand/*.png   мастери в пълна големина (не се качват в сайта)
  public/brand/*.png   леки версии за сайта:
    logo-mark.png        само знакът (къщичка + вълна), цвят на логото
    logo-full.png        знак + StayFlow + PROPERTY MANAGEMENT, както е подаден (вход)
    logo-horizontal.png  знак вляво, надпис вдясно (странична лента, горна лента на телефон)
И иконите: public/icon-512.png, icon-192.png, apple-touch-icon.png, favicon-32.png (крем знак върху цвят на логото).
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'brand' / 'logo-source.jpg'
OUT = ROOT / 'public' / 'brand'
MASTER = ROOT / 'design' / 'brand'
OUT.mkdir(parents=True, exist_ok=True)
MASTER.mkdir(parents=True, exist_ok=True)


def save_pair(image, name, web_width):
    """Мастер в пълна големина + лека версия за сайта (LANCZOS, прозрачността се пази)."""
    image.save(MASTER / name, optimize=True)
    h = int(round(image.height * web_width / image.width))
    small = image.resize((web_width, h), Image.LANCZOS)
    # едноцветно лого: палитра с прозрачност (≈64 нива на ръба) е в пъти по-лека от пълен RGBA и не личи на око
    small.quantize(colors=64, method=Image.FASTOCTREE, dither=Image.NONE).save(OUT / name, optimize=True)


img = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
H, W, _ = img.shape

# фон = медиана на рамката (плосък крем)
border = np.concatenate([img[:40].reshape(-1, 3), img[-40:].reshape(-1, 3), img[:, :40].reshape(-1, 3), img[:, -40:].reshape(-1, 3)])
BG = np.median(border, axis=0)
dist = np.linalg.norm(img - BG, axis=2)
ink = dist > 60

# блокове по редове: знак, надпис, подзаглавие
rows = np.where(ink.any(axis=1))[0]
blocks, start, prev = [], rows[0], rows[0]
for r in rows[1:]:
    if r - prev > 25:
        blocks.append((start, prev))
        start = r
    prev = r
blocks.append((start, prev))
assert len(blocks) == 3, f'очаквам 3 блока (знак, надпис, подзаглавие), има {len(blocks)}'


def block_color(a, b):
    """Чистият цвят на блока: средно от най-отдалечените от фона пиксели."""
    sub = dist[a:b + 1]
    top = np.argsort(sub.ravel())[-4000:]
    return img[a:b + 1].reshape(-1, 3)[top].mean(axis=0)


def block_alpha(a, b, pad=0):
    """Прозрачност 0..255 за блока: проекция върху оста фон→цвят, после изостряне на ръба."""
    fg = block_color(a, b)
    axis = fg - BG
    t = ((img - BG) @ axis) / float(axis @ axis)
    t = np.clip(t, 0, 1)
    t = np.clip((t - 0.14) / (0.86 - 0.14), 0, 1)  # по-чист ръб, без ореол от JPEG
    t[: max(a - pad, 0)] = 0
    t[b + 1 + pad:] = 0
    return (t * 255).astype(np.uint8), tuple(int(round(c)) for c in fg)


def tight(alpha, margin=0):
    ys, xs = np.where(alpha > 8)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return alpha[max(y0 - margin, 0):y1 + margin, max(x0 - margin, 0):x1 + margin]


def rgba(mask, color):
    out = np.zeros(mask.shape + (4,), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = color
    out[..., 3] = mask
    return Image.fromarray(out, 'RGBA')


(mark_a, mark_b), (word_a, word_b), (tag_a, tag_b) = blocks
mark_mask, TERRACOTTA = block_alpha(mark_a, mark_b, pad=8)
word_mask, DARK = block_alpha(word_a, word_b, pad=8)
tag_mask, _ = block_alpha(tag_a, tag_b, pad=8)

mark_t = tight(mark_mask)
word_t = tight(word_mask)

# ---------- знак
save_pair(rgba(mark_t, TERRACOTTA), 'logo-mark.png', 440)

# ---------- пълното лого (както е подадено: знак, надпис, подзаглавие на едно платно, на естествения му мащаб)
ys, xs = np.where((mark_mask > 8) | (word_mask > 8) | (tag_mask > 8))
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
full = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
for mask, color in ((mark_mask, TERRACOTTA), (word_mask, DARK), (tag_mask, TERRACOTTA)):
    full.alpha_composite(rgba(mask[y0:y1, x0:x1], color))
save_pair(full, 'logo-full.png', 640)

# ---------- хоризонтален вариант: знак вляво, надписът вдясно, вертикално по средата на знака
mh, mw = mark_t.shape
wh, ww = word_t.shape
gap = int(mw * 0.12)
canvas = Image.new('RGBA', (mw + gap + ww, max(mh, wh)), (0, 0, 0, 0))
canvas.alpha_composite(rgba(mark_t, TERRACOTTA), (0, (canvas.height - mh) // 2))
# надписът е с „y“ с опашка: центрираме по височината на малките букви, не по опашката
canvas.alpha_composite(rgba(word_t, DARK), (mw + gap, (canvas.height - wh) // 2 - int(wh * 0.05)))
save_pair(canvas, 'logo-horizontal.png', 1100)


# ---------- икони на приложението: крем знак върху цвета на логото
CREAM = (251, 240, 227)


def icon(size, mark_width_ratio):
    tile = Image.new('RGBA', (size, size), TERRACOTTA + (255,))
    target_w = int(size * mark_width_ratio)
    target_h = int(round(target_w * mark_t.shape[0] / mark_t.shape[1]))
    big = Image.fromarray(mark_t, 'L').resize((target_w, target_h), Image.LANCZOS)
    glyph = Image.new('RGBA', (target_w, target_h), CREAM + (255,))
    glyph.putalpha(big)
    tile.alpha_composite(glyph, ((size - target_w) // 2, (size - target_h) // 2))
    return tile


icon(512, 0.62).save(ROOT / 'public' / 'icon-512.png', optimize=True)
icon(192, 0.62).save(ROOT / 'public' / 'icon-192.png', optimize=True)
icon(180, 0.62).save(ROOT / 'public' / 'apple-touch-icon.png', optimize=True)
icon(32, 0.78).save(ROOT / 'public' / 'favicon-32.png', optimize=True)

print('фон', tuple(int(c) for c in BG), '· цвят на знака', TERRACOTTA, '· цвят на надписа', DARK)
print('знак', mark_t.shape[::-1], '· надпис', word_t.shape[::-1], '· пълно лого', full.size, '· хоризонтално', canvas.size)
for folder in (MASTER, OUT):
    for p in sorted(folder.glob('*.png')):
        print(folder.name, p.name, p.stat().st_size, 'B')
