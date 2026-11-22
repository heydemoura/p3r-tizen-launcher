"""Rebuild the Home damage map after changing the pose atlas. Requires Pillow and NumPy.

Run python3 tools/home-damage.py, or pass --output /tmp/damage.js for comparison.
"""

import argparse
import base64
import json
from pathlib import Path

import numpy as np
from PIL import Image


def changed_rectangles(previous, current):
    """Join changed 2×2-tile blocks horizontally, then merge identical adjacent runs."""
    changed = np.any(previous != current, axis=2)
    rows, cols = changed.shape
    padded = np.pad(changed, ((0, rows % 2), (0, cols % 2)))
    blocks = padded.reshape((rows + 1) // 2, 2, (cols + 1) // 2, 2).any(axis=(1, 3))
    rectangles = []
    above = {}
    for y, row in enumerate(blocks):
        bounds = np.flatnonzero(np.diff(np.pad(row.astype(np.int8), 1)))
        runs = {}
        for start, end in bounds.reshape(-1, 2):
            key = (start, end)
            bottom = min((y + 1) * 2, rows)
            if key in above:
                index = above[key]
                rectangles[index][3] = bottom
            else:
                index = len(rectangles)
                rectangles.append([start * 2, y * 2, min(end * 2, cols), bottom])
            runs[key] = index
        above = runs
    return np.asarray(rectangles, dtype=np.uint8).tobytes()


def main():
    assets = Path(__file__).resolve().parents[1] / "assets" / "home-frames"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=assets / "damage.js")
    args = parser.parse_args()
    spec = json.loads((assets / "index.js").read_text().split("=", 1)[1].strip().rstrip(";"))
    tile = spec["tile"]
    cols = (spec["width"] + tile - 1) // tile
    rows = (spec["height"] + tile - 1) // tile
    if cols > 255 or rows > 255:
        parser.error("The damage format uses one byte per coordinate (255 tiles per axis).")
    with Image.open(assets / spec["map"]) as image:
        lookup = np.asarray(image.convert("RGB"))

    packed = bytearray()
    offsets = [0]
    previous = None
    for index in range(spec["frames"]):
        sheet_y, sheet_x = divmod(index, spec["posesAcross"])
        top, left = sheet_y * rows, sheet_x * cols
        pose = lookup[top:top + rows, left:left + cols]
        if pose.shape[:2] != (rows, cols):
            parser.error(f"The pose map does not contain a complete grid for pose {index}.")
        if previous is not None:
            packed.extend(changed_rectangles(previous, pose))
            offsets.append(len(packed) // 4)
        previous = pose

    rects = base64.b64encode(packed).decode("ascii")
    offsets_json = json.dumps(offsets, separators=(",", ":"))
    args.output.write_text(
        "// Rectangles that change between consecutive poses; each group stores x1, y1, x2, y2 in tiles.\n"
        f"const HOME_MOTION_DAMAGE = {{columns:{cols},rows:{rows},frames:{spec['frames']},"
        f'offsets:{offsets_json},rects:"{rects}"}};\n'
    )


if __name__ == "__main__":
    main()
