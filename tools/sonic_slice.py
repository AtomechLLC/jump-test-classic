"""Slice Sonic sheet rows: remove page+cell greens, then split sprite islands."""
import sys
from PIL import Image

sheet_path, x, y, w, h, prefix = sys.argv[1], *map(int, sys.argv[2:6]), sys.argv[6]
sheet = Image.open(sheet_path).convert('RGBA')
strip = sheet.crop((x, y, x + w, y + h))
px = strip.load()
W, H = strip.size

# collect green-ish background shades actually present (dominant colors)
def is_bg(p):
    r, g, b, a = p
    return a == 0 or (g > 60 and g > r + 25 and g > b + 25)  # any green shade

out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
opx = out.load()
for cy in range(H):
    for cx in range(W):
        p = px[cx, cy]
        if not is_bg(p):
            opx[cx, cy] = p

def col_empty(cx):
    return all(opx[cx, cy][3] == 0 for cy in range(H))

spans, start = [], None
for cx in range(W):
    if col_empty(cx):
        if start is not None and cx - start > 3:
            spans.append((start, cx))
        start = None
    else:
        if start is None:
            start = cx
if start is not None:
    spans.append((start, W))

for i, (a, b) in enumerate(spans):
    cell = out.crop((a, 0, b, H))
    bbox = cell.getbbox()
    if not bbox or (bbox[2]-bbox[0]) < 8 or (bbox[3]-bbox[1]) < 8:
        continue
    cell = cell.crop(bbox)
    name = f"{prefix}_{i:02d}.png"
    cell.save(name)
    print(f"{i:02d}: sheet-x {x+a}..{x+b} size {cell.size[0]}x{cell.size[1]} -> {name}")
