# usage: imgdiff.py a.png b.png [out_diff.png]  -> how different two renders are
import sys, numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int); b = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(int)
if a.shape != b.shape: print('size differs', a.shape, b.shape); sys.exit(1)
d = np.abs(a - b).max(axis=2)
ys, xs = np.nonzero(d > 24)
box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())) if len(xs) else None
print(f'{sys.argv[2]}: mean {d.mean():.3f}  >8: {(d>8).mean()*100:.3f}%  >24: {(d>24).mean()*100:.3f}%  >64: {(d>64).mean()*100:.4f}%  max {d.max()}  box>24 {box}')
if len(sys.argv) > 3: Image.fromarray(np.clip(d * 4, 0, 255).astype(np.uint8)).save(sys.argv[3])
