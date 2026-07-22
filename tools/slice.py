"""Segment sprite cells out of a sheet strip.

Usage: slice.py <sheet.png> <x> <y> <w> <h> <outprefix>
Crops the strip, finds connected sprite cells separated by columns of
"separator" color (the sheet page background = most common corner color of the
full sheet), then within each cell removes the cell background color
(top-left pixel of the cell) and trims to the sprite bounding box.
Writes outprefix_00.png, _01.png ... and prints each cell's info.
"""
import sys
from PIL import Image
from collections import Counter

sheet_path, x, y, w, h, prefix = sys.argv[1], *map(int, sys.argv[2:6]), sys.argv[6]
sheet = Image.open(sheet_path).convert('RGBA')
page_bg = sheet.getpixel((0, 0))
strip = sheet.crop((x, y, x + w, y + h))
px = strip.load()
W, H = strip.size

def col_is_sep(cx):
    return all(px[cx, cy] == page_bg or px[cx, cy][3] == 0 for cy in range(H))

# find cell column spans
spans, start = [], None
for cx in range(W):
    if col_is_sep(cx):
        if start is not None:
            spans.append((start, cx)); start = None
    else:
        if start is None:
            start = cx
if start is not None:
    spans.append((start, W))

for i, (a, b) in enumerate(spans):
    cell = strip.crop((a, 0, b, H))
    cw, ch = cell.size
    cpx = cell.load()
    # cell background = most common pixel in the cell border ring
    ring = [cpx[cx, cy] for cx in range(cw) for cy in (0, ch - 1)] + \
           [cpx[cx, cy] for cy in range(ch) for cx in (0, cw - 1)]
    cell_bg = Counter(ring).most_common(1)[0][0]
    out = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    opx = out.load()
    for cy in range(ch):
        for cx in range(cw):
            p = cpx[cx, cy]
            if p != cell_bg and p != page_bg and p[3] > 0:
                opx[cx, cy] = p
    bbox = out.getbbox()
    if not bbox:
        continue
    out = out.crop(bbox)
    name = f"{prefix}_{i:02d}.png"
    out.save(name)
    print(f"{i:02d}: strip-x {a}..{b} sheet-x {x+a}..{x+b} size {out.size[0]}x{out.size[1]} bg {cell_bg} -> {name}")
