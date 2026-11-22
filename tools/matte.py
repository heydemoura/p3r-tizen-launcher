# Cut the falling figure out of the user's 4K menu screenshot (refs/main.jpg).
# All coordinates are in the screenshot's 3840x2160 space.
import sys, json, numpy as np, cv2

SRC = 'refs/main.jpg'
bgr = cv2.imread(SRC)
H, W = bgr.shape[:2]
rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32)
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

def sm(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def poly_mask(pts):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 255)
    return m

# ---- water gradient G(y) used by the launcher background (1080p rows -> 4K rows)
GRAD = [(0, (8, 248, 255)), (60, (12, 231, 254)), (100, (13, 220, 255)), (150, (14, 201, 254)), (200, (13, 160, 254)),
        (260, (11, 138, 240)), (330, (8, 118, 220)), (400, (5, 100, 207)), (480, (3, 84, 198)), (560, (4, 74, 196)),
        (640, (6, 64, 196)), (720, (7, 56, 196)), (800, (8, 49, 196)), (850, (8, 45, 196)), (900, (9, 44, 196)),
        (950, (7, 40, 194)), (1000, (5, 33, 195)), (1050, (1, 22, 193)), (1080, (0, 15, 190))]
gy = np.array([p[0] * 2 for p in GRAD], np.float32)
grad = np.stack([np.interp(np.arange(H), gy, [p[1][c] for p in GRAD]) for c in range(3)], 1).astype(np.float32)  # H x 3
Gg = grad[:, 1][:, None]

# ---- 1. remove UI that sits on top of the figure --------------------------------
work = rgb.copy()
# wallet box (white card with a thin border) -> plain white
work[104:314, 328:849] = 255
work[314:320, 328:819] = 255
# floating confetti shards: pink / magenta / purple. Inpaint them from their surroundings.
shard = ((R - G) > 28) & (B > 110) & (R > 70)
# keep the small red accents of the ribbon (they have low blue) - already excluded by B > 110
shard_u8 = cv2.dilate(shard.astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
# the selected-menu wedge is far to the right of the figure; never touch x > 1560 there
shard_u8[:, 1600:] = 0
work_u8 = np.clip(work, 0, 255).astype(np.uint8)
inp = cv2.inpaint(cv2.cvtColor(work_u8, cv2.COLOR_RGB2BGR), shard_u8, 9, cv2.INPAINT_TELEA)
work = cv2.cvtColor(inp, cv2.COLOR_BGR2RGB).astype(np.float32)
R, G, B = work[..., 0], work[..., 1], work[..., 2]
# very light pink haze left by translucent shards over white, and jpeg noise -> pure white
near_white = (np.minimum(np.minimum(R, G), B) > 222) | ((R > 205) & (B > 205) & (G > 172) & (R - G > 8))
work[near_white] = 255
R, G, B = work[..., 0], work[..., 1], work[..., 2]

# --- hand repairs where a shard or the wallet card covered real line art ---
def P(pts): return np.array(pts, np.int32)
wu = np.clip(work, 0, 255).astype(np.uint8)
# (a) face / hair-spike edge under a magenta shard: white above the edge line
cv2.fillPoly(wu, [P([(846, 1500), (846, 1541), (1002, 1637), (1002, 1580)])], (255, 255, 255), cv2.LINE_AA)
EDGE_FIX = poly_mask([(846, 1544), (1002, 1640), (1002, 1700), (846, 1650)]) > 0
# (b) earphone cord under a magenta shard
cv2.polylines(wu, [P([(1036, 1462), (1039, 1498), (1049, 1534), (1066, 1562), (1090, 1588)])], False, (14, 52, 192), 19, cv2.LINE_AA)
# (c) top of the ribbon loop hidden by the wallet card
cv2.fillPoly(wu, [P([(819, 316), (822, 306), (830, 300), (840, 296), (851, 295), (851, 316)])], (0, 0, 0), cv2.LINE_AA)
work = wu.astype(np.float32)
R, G, B = work[..., 0], work[..., 1], work[..., 2]

# ---- 2. geometry ------------------------------------------------------------------
# left limit of the figure: right of the giant title letters, then down the cheek outline
F_LEFT = [(856, 0), (856, 290), (814, 290), (814, 324), (562, 324), (562, 1196), (584, 1196), (556, 1209), (541, 1225), (531, 1250), (524, 1287),
          (519, 1300), (508, 1329), (497, 1354), (480, 1400), (468, 1437), (463, 1454), (461, 1504), (462, 1550), (440, 1560),
          (440, 1900), (520, 1950), (640, 2030), (700, 2110), (730, 2160)]
# loose right limit, ~35px outside the true silhouette
L_RIGHT = [(1000, 2160), (1000, 1960), (1340, 1935), (1425, 1850), (1425, 1500), (1405, 1420), (1400, 1250), (1385, 1120),
           (1385, 1040), (1400, 950), (1420, 860), (1445, 790), (1478, 720), (1515, 640), (1535, 560), (1548, 480), (1560, 420),
           (1600, 410), (1662, 290), (1742, 160), (1836, 0)]
PF = poly_mask(F_LEFT + L_RIGHT) > 0
# opaque core: the torso (keeps cords and the "see-through" cyan band solid over the white wedge)
CORE = [(856, 0),  (1750, 0), (1650, 170), (1500, 165), (1478, 400), (1470, 500), (1450, 580), (1425, 650), (1385, 720),
        (1360, 790), (1340, 860), (1322, 950), (1310, 1040), (1300, 1250), (1320, 1340), (1325, 1400), (700, 1400),
        (562, 1196), (562, 324), (814, 324), (814, 290), (856, 290)]
core = poly_mask(CORE)
CORD = poly_mask([(1010, 1380), (1078, 1380), (1078, 1480), (1130, 1560), (1205, 1640), (1150, 1685), (1070, 1605), (1010, 1500)]) > 0
S = cv2.GaussianBlur(core.astype(np.float32) / 255, (0, 0), 6)
S = sm(S, 0.5, 0.95)
# hair zone: left of the cheek, over the title letters -> keep hair colours only
HZ = (poly_mask([(0, 1196)] + F_LEFT[6:] + [(0, 2160)]) > 0) | (poly_mask([(440, 1560), (760, 1560), (760, 2160), (440, 2160)]) > 0)

# ---- 3. colour keys ----------------------------------------------------------------
k_white = sm(R, 120, 190)                      # white / pale shading vs. blue water
k_cyan = sm(G - Gg, 75, 125) * (yy > 760)      # bright cyan bits lower down (water is dark there)
k_dark = sm(118 - B, 0, 40)                    # ink lines
k_cord = sm(G - Gg, 10, 24) * CORD
sat = np.maximum(np.maximum(R, G), B) - np.minimum(np.minimum(R, G), B)
k_desat = sm(115 - sat, 0, 50)             # grey transitions around ink lines
K = np.maximum(np.maximum(np.maximum(np.maximum(k_white, k_cyan), k_dark), k_cord), k_desat)
a_f = np.maximum(K, S) * PF
a_f[EDGE_FIX] = 0
# torso edge where two shards straddled the silhouette: enforce the smooth traced edge
E2 = [(1491, 480), (1489, 500), (1484, 520), (1477, 540), (1468, 560), (1460, 580), (1449, 600), (1440, 620), (1431, 640),
      (1423, 660), (1416, 680), (1405, 700), (1395, 720), (1389, 740), (1384, 760), (1379, 780), (1374, 800), (1369, 820)]
def aa_mask(pts):
    m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [np.array(pts, np.int32)], 255, cv2.LINE_AA); return m.astype(np.float32) / 255
m_out = aa_mask(E2 + [(x + 110, y) for x, y in reversed(E2)])
m_in = aa_mask(E2 + [(x - 26, y) for x, y in reversed(E2)])
a_f = np.maximum(a_f, m_in) * (1 - m_out)
# sliver of open water beside the white spike: anything not white there is water
sl = np.zeros((H, W), bool); sl[60:402, 1493:1562] = True
a_f[sl & (R < 190)] = 0

hair = sm(B - R, 95, 150) * sm(B, 120, 165)    # cyan + deep blue hair; drops black, white, grey, navy
hb = (hair > 0.5).astype(np.uint8)
# fill pale highlight streaks enclosed by hair
ff = hb.copy(); ffm = np.zeros((H + 2, W + 2), np.uint8)
inv = (1 - hb).astype(np.uint8)
cv2.floodFill(inv, ffm, (0, 0), 0)             # background reachable from the corner
holes = (inv > 0) & ((B - R) > 45) & (B > 150)
hair = np.where(holes, 1.0, hair)
a_h = hair * HZ

alpha = np.clip(np.maximum(a_f, a_h), 0, 1)
deep = sm(125 - G, 0, 30) * sm(B, 110, 150) * sm(150 - R, 0, 40) * HZ
work = work * (1 - deep[..., None]) + grad[:, None, :] * deep[..., None]
alpha[:, 1900:] = 0
# close hairline gaps around ink lines
ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
alpha = np.maximum(alpha, cv2.erode(cv2.dilate(alpha, ker), ker))
# tidy: drop specks, keep the big connected body
ab = (alpha > 0.35).astype(np.uint8)
n, lab, stats, _ = cv2.connectedComponentsWithStats(ab, 8)
keep = np.zeros(n, bool)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] > 1500: keep[i] = True
alpha *= cv2.dilate(keep[lab].astype(np.uint8), np.ones((9, 9), np.uint8))

out = np.dstack([np.clip(work, 0, 255), alpha * 255]).astype(np.uint8)
out = out[:, :1900]
cv2.imwrite('assets/hero-full.png', cv2.cvtColor(out, cv2.COLOR_RGBA2BGRA), [cv2.IMWRITE_PNG_COMPRESSION, 9])
# The app ships the figure at 1.5x its on-screen size (1425x1620): the largest it is ever drawn from, and the TV opens
# it in about half the time of the full cut-out. Colour is weighted by coverage while resizing, so the soft edge keeps its colours.
from PIL import Image
Image.open('assets/hero-full.png').convert('RGBa').resize((1425, 1620), Image.LANCZOS).convert('RGBA').save('assets/hero.png', optimize=True)

# ---- debug composites ----------------------------------------------------------------
a = out[..., 3:4].astype(np.float32) / 255
mag = np.zeros_like(out[..., :3]); mag[...] = (255, 0, 255)
c1 = (out[..., :3] * a + mag * (1 - a)).astype(np.uint8)
cv2.imwrite('work/hero_magenta.jpg', cv2.cvtColor(cv2.resize(c1, (950, 1080), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2BGR))
bgim = np.repeat(grad[:, None, :], 1900, 1)
wedge = poly_mask([(0, 0), (1470, 0), (1450, 300), (1400, 560), (1300, 900), (1250, 1100), (1100, 1195), (900, 1250), (650, 1300),
                   (620, 1900), (600, 1950), (480, 2000), (400, 2160), (0, 2160)])[:, :1900, None] / 255.0
bgim = bgim * (1 - wedge) + 255 * wedge
c2 = (out[..., :3] * a + bgim * (1 - a)).astype(np.uint8)
cv2.imwrite('work/hero_on_bg.jpg', cv2.cvtColor(cv2.resize(c2, (950, 1080), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2BGR))
cv2.imwrite('work/hero_on_bg_full.png', cv2.cvtColor(c2, cv2.COLOR_RGB2BGR))
print('ok', out.shape, 'alpha mean', float(alpha.mean()))
