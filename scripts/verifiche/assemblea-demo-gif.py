#!/usr/bin/env python3
"""Assembla demo.gif dai frame in scripts/gif-frames/ (resize 800x500, Task 48).

Rigenera docs/assets/demo.gif con la stessa geometria dell'originale (800x500)
dai frame 1440x900 catturati da scripts/github-assets.py.
"""
from pathlib import Path

from PIL import Image

ROOT = Path("/home/z/my-project")
TMP = ROOT / "scripts" / "gif-frames"
OUT = ROOT / "docs" / "assets" / "demo.gif"

frames = sorted(TMP.glob("f*.png"))
if not frames:
    raise SystemExit("Nessun frame trovato in " + str(TMP))

imgs = []
for f in frames:
    im = Image.open(f).convert("RGB").resize((800, 500), Image.LANCZOS)
    imgs.append(im)

imgs[0].save(
    OUT,
    save_all=True,
    append_images=imgs[1:],
    duration=320,
    loop=0,
    optimize=True,
)
print(f"OK {OUT} — {len(imgs)} frame, {OUT.stat().st_size // 1024} KB")
