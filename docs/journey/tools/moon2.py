# Close lunar horizon with a procedural crater field over the real albedo map.
# python3 -I moon2.py <moon_1024.jpg> <out.webp>
import sys, numpy as np, cv2
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(11)
tex = np.array(Image.open(src).convert('L')).astype(np.float32) / 255
low = cv2.GaussianBlur(cv2.resize(tex, (2048, 1024), interpolation=cv2.INTER_CUBIC), (0, 0), 6)
TH, TW = low.shape
W, H = 2400, 700; R = 4100.0; top = 60.0
cx, cy = W * 0.5, top + R
y, x = np.mgrid[0:H, 0:W].astype(np.float32)
nx = (x - cx) / R; ny = (y - cy) / R; r2 = nx * nx + ny * ny
nz = np.sqrt(np.clip(1 - r2, 0, 1))
t = np.radians(76)
px = nx; py = ny * np.cos(t) - nz * np.sin(t); pz = ny * np.sin(t) + nz * np.cos(t)
lon = np.arctan2(px, pz); lat = np.arcsin(np.clip(py, -1, 1))
vis = r2 < 1.0004
# heightfield parametrisation: azimuthal-equidistant map centred in the visible cap (no seams, no wrap)
C = np.array([0.0, -0.80, 0.60]); C /= np.linalg.norm(C)
e1 = np.array([1.0, 0, 0]); e2 = np.cross(C, e1); e2 /= np.linalg.norm(e2)
dot = np.clip(nx * C[0] + ny * C[1] + nz * C[2], -1, 1); th = np.arccos(dot)
tx = nx - dot * C[0]; ty = ny - dot * C[1]; tz = nz - dot * C[2]
tn = np.sqrt(tx * tx + ty * ty + tz * tz) + 1e-9
a = th * (tx * e1[0] + ty * e1[1] + tz * e1[2]) / tn
b = th * (tx * e2[0] + ty * e2[1] + tz * e2[2]) / tn
j = W // 2; k = 1.0 / abs(a[H - 1, j + 1] - a[H - 1, j])
a0, a1, b0, b1 = a[vis].min(), a[vis].max(), b[vis].min(), b[vis].max()
GW = int((a1 - a0) * k) + 8; GH = int((b1 - b0) * k) + 8
print('grid', GW, GH)
gx = (a - a0) * k + 4; gy = (b - b0) * k + 4
# ---- heightfield
Hf = np.zeros((GH, GW), np.float32)
def crater(cxg, cyg, rad, depth, age=1.0):
    e = int(rad * 3.2) + 2
    x0, x1 = max(int(cxg) - e, 0), min(int(cxg) + e, GW); y0, y1 = max(int(cyg) - e, 0), min(int(cyg) + e, GH)
    if x0 >= x1 or y0 >= y1: return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    # slight ellipticity + irregular rim
    ang = np.arctan2(yy - cyg, xx - cxg)
    wob = 1 + 0.06 * np.sin(3 * ang + rng.uniform(0, 6)) + 0.04 * np.sin(5 * ang + rng.uniform(0, 6))
    r = np.hypot(xx - cxg, yy - cyg) / (rad * wob)
    bowl = np.where(r < 1, (r * r - 1) * depth, 0)
    rim = 0.32 * depth * np.exp(-((r - 1) / 0.22) ** 2)
    fall = np.clip((3.0 - r) / 1.2, 0, 1); fall = fall * fall * (3 - 2 * fall)
    ejecta = np.where(r > 1, 0.12 * depth * r ** -3.0, 0) * fall
    rim = rim * fall
    Hf[y0:y1, x0:x1] += (bowl + rim + ejecta) * age
    if rad > 60:  # central peak for big ones
        Hf[y0:y1, x0:x1] += 0.25 * depth * np.exp(-(r / 0.16) ** 2)
area = GW * GH
for rmin, rmax, dens, dep in [(140, 320, 2.2e-7, 0.45), (40, 140, 2.6e-6, 0.5), (12, 40, 3.2e-5, 0.55), (3.5, 12, 4.5e-4, 0.6), (1.6, 3.5, 1.2e-3, 0.5)]:
    n = int(area * dens)
    for _ in range(n):
        rad = rmin * (rmax / rmin) ** (rng.random() ** 1.6)
        crater(rng.uniform(0, GW), rng.uniform(0, GH), rad, rad * dep, rng.uniform(0.25, 1.0) ** 0.7)
# gentle rolling terrain
def fbm(scales):
    acc = np.zeros((GH, GW), np.float32)
    for sc, amp in scales:
        z = rng.standard_normal((GH // sc + 3, GW // sc + 3)).astype(np.float32)
        acc += cv2.resize(z, (GW + 2 * sc, GH + 2 * sc), interpolation=cv2.INTER_CUBIC)[sc:sc + GH, sc:sc + GW] * amp
    return acc
Hf += fbm([(500, 70), (160, 12), (40, 1.4), (12, 0.4)])
# real crater micro-structure from the lunar map, tiled across the field (bump + albedo detail)
texu = cv2.resize(tex, (3072, 1536), interpolation=cv2.INTER_CUBIC)[160:1376]   # drop polar smear
hpt = texu - cv2.GaussianBlur(texu, (0, 0), 10)
reps = (int(np.ceil(GH / hpt.shape[0])), int(np.ceil(GW / hpt.shape[1])))
detail = np.tile(hpt, reps)[:GH, :GW]
Hf += detail * 5.0
# ---- shading in grid space: low sun from the left (west) and slightly behind the horizon
hx = cv2.Sobel(Hf, cv2.CV_32F, 1, 0, ksize=3) / 8; hy = cv2.Sobel(Hf, cv2.CV_32F, 0, 1, ksize=3) / 8
sun = np.array([-0.82, -0.25, 0.52]); sun /= np.linalg.norm(sun)
nrm = np.sqrt(hx * hx + hy * hy + 1)
lam_local = np.clip((-hx * sun[0] - hy * sun[1] + sun[2]) / nrm, 0, 1) / sun[2]
# cheap cast shadows: march toward the sun along x
sh = np.ones_like(Hf); hmax = Hf.copy(); slope = sun[2] / np.hypot(sun[0], sun[1])
for k in range(1, 60):
    shifted = np.roll(Hf, k, axis=1) - k * slope
    sh = np.minimum(sh, np.clip(1 - (shifted - Hf) / 2.0, 0.15, 1))
local = lam_local * sh
mx = gx.astype(np.float32); my = gy.astype(np.float32)
local_s = cv2.remap(local, mx, my, cv2.INTER_AREA if False else cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
det_s = cv2.remap(detail, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
# ---- albedo from the real map (low frequencies only: maria vs highlands)
u = lon / (2 * np.pi) + 0.45; v = lat / np.pi + 0.5
alb = cv2.remap(low, ((u % 1) * TW).astype(np.float32), (np.clip(v, 0, .999) * TH).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
alb = 0.58 + (alb - alb[vis].mean()) * 0.7 + det_s * 0.4
# ---- global sphere lighting + limb
L = np.array([-0.72, -0.40, 0.57]); L /= np.linalg.norm(L)
lam = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
fore = np.clip(nz * 5, 0, 1)                         # relief flattens toward the limb
shade = (0.06 + 0.94 * lam ** 0.8) * (1 + (local_s - 1) * (0.35 + 0.65 * fore))
lum = alb * shade * 1.08
lum *= 0.62 + 0.38 * np.clip(1 - (y - top) / H, 0, 1) ** 0.7
rng2 = np.random.default_rng(3)
lum += rng2.normal(0, 0.0, lum.shape).astype(np.float32)   # film grain, tiny
col = np.dstack([lum * 0.95 + 0.01, lum * 0.93 + 0.012, lum * 1.0 + 0.03])
d = (np.sqrt(r2) - 1) * R
alpha = np.clip(0.5 - d / 1.3, 0, 1)
img = np.dstack([np.clip(col, 0, 1) * 255, alpha * 255]).astype(np.uint8)
Image.fromarray(img, 'RGBA').save(out, 'WEBP', quality=56, method=6, alpha_quality=60)
Image.fromarray(img, 'RGBA').save('/home/claude/work-a/moon-full.png')
Image.fromarray(img, 'RGBA').resize((1300, 380)).save('/home/claude/work-a/moon-prev.png')
