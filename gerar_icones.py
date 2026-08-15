#!/usr/bin/env python3
"""Gera os ícones do PWA do Canivete."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = "/workspace/canivete-dtxnet/public/icons"
os.makedirs(OUT, exist_ok=True)

INK = (46, 42, 36, 255)          # #2E2A24
GOLD = (240, 230, 211, 255)      # #F0E6D3
FONT_PATH = "/workspace/dogfood-output/fonts/DejaVuSerif-Bold.ttf"

def draw_icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if maskable:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size // 8, fill=INK)
        circle_d = size * 0.56
        cx, cy = size / 2, size / 2
        d.ellipse([cx - circle_d / 2, cy - circle_d / 2, cx + circle_d / 2, cy + circle_d / 2],
                  fill=INK, outline=GOLD, width=max(2, size // 60))
    else:
        margin = size * 0.06
        d.ellipse([margin, margin, size - margin, size - margin], fill=INK,
                  outline=GOLD, width=max(2, size // 55))

    font_size = int(size * 0.52)
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = d.textbbox((0, 0), "C", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - size * 0.02
    d.text((x, y), "C", font=font, fill=GOLD)
    return img

draw_icon(192).save(f"{OUT}/icon-192.png")
draw_icon(512).save(f"{OUT}/icon-512.png")
draw_icon(512, maskable=True).save(f"{OUT}/icon-maskable-512.png")
draw_icon(180).save(f"{OUT}/apple-touch-icon.png")

for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    print(f"{f}: {os.path.getsize(p):,} bytes")
print("Ícones gerados ✅")
