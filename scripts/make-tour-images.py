"""PNG снимки на екраните (scripts/visual/tour-shots.mjs) -> public/demo/tour/*.webp (десктоп 1440 px, телефон 780 px)."""
import glob
import os
import sys

from PIL import Image

src = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'public', 'demo', 'tour')
os.makedirs(out, exist_ok=True)
total = 0
for f in sorted(glob.glob(os.path.join(src, '*.png'))):
    name = os.path.splitext(os.path.basename(f))[0]
    im = Image.open(f).convert('RGB')
    width = 780 if name.startswith("phone") else 1440
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    path = os.path.join(out, name + '.webp')
    im.save(path, 'WEBP', quality=80, method=6)
    total += os.path.getsize(path)
    print(name, im.size, os.path.getsize(path) // 1024, 'KB')
print('общо', total // 1024, 'KB')
