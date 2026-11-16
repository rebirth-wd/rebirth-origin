#!/usr/bin/env python3
"""Smoke-filled dog silhouette for <Dog/>.

    python3 docs/journey/tools/dog_silhouette.py [--shots DIR]

Inputs  docs/journey/source/dog.png (the labrador in a space suit), docs/journey/source/smoke.png (the fill)
Outputs src/assets/space/dog-<part>.webp, src/components/space/dog.json (contract: docs/journey/ASSETS.md)

Only the OUTLINE of the photo is used. The dog (suit, legs, tail, bubble helmet, back tank) is segmented with
GrabCut, then cleaned by hand: the helmet is an exact fitted ellipse, the dark legs/paws against Earth and the stars
are hand polygons, and the tether hose, the hose loop above the tank, the station, Earth and the stars are cut away.
The mask goes through a signed-distance field (smoothed, so no staircase survives the ~2.8x upscale) and becomes a
crisp ~2 px anti-aliased edge. RGB is smoke only (no photo pixel survives).
The outline is cut at the hips, shoulders and tail root into six parts; each limb reaches OV px under its
neighbours with a feathered edge, and the smoke is sampled once in rest-pose box coordinates so the texture is
continuous across the joints. The asserts at the end fail the run; with --shots the contact sheets are written.
"""
import io, json, math, sys
from pathlib import Path
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'docs/journey/source'
ASSET = ROOT / 'src/assets/space'
COMP = ROOT / 'src/components/space'

S = 2.8          # source px -> box px
PAD = 24         # box px around the silhouette
OV = 14          # box px each limb reaches under its neighbours (the brief asks for ~10)
EDGE = 2.0       # width (box px) of the anti-aliased silhouette edge
SDF_SIGMA = 3.2  # source px: smoothing of the signed distance (removes segmentation jaggies)
FAR_SHADE = 0.8  # far legs a touch darker for depth
WEBP_Q = 88
BUDGET = 300_000

# ---------------------------------------------------------------------------------------------------------------
# Hand-tuned geometry, in pixels of the source photo (1024 x 1030).
# ---------------------------------------------------------------------------------------------------------------
# GrabCut seed: probable-foreground hull and definite-foreground core
GC_OUTER = [(240, 140), (490, 140), (510, 280), (640, 300), (680, 330), (700, 400), (760, 420), (860, 380), (915, 385),
            (880, 470), (800, 520), (840, 640), (910, 770), (890, 790), (860, 780), (770, 690), (760, 800), (705, 800),
            (700, 690), (620, 640), (560, 560), (500, 580), (440, 640), (410, 690), (370, 680), (370, 620), (320, 600),
            (250, 660), (205, 650), (210, 600), (270, 520), (300, 430), (250, 380), (240, 260)]
GC_CORE = [(320, 420), (560, 400), (700, 470), (760, 600), (700, 620), (560, 540), (420, 560), (330, 520)]
HELMET_GUESS = (367, 262, 118)
# added (dark fur / cuffs the segmentation misses against the stars and Earth)
ADD = [
    # near hind leg below the trouser cuff, down to the paw
    [(806, 664), (820, 652), (836, 632), (844, 642), (850, 647), (856, 658), (868, 680), (880, 704), (890, 726),
     (897, 744), (899, 758), (896, 770), (890, 776), (882, 779), (874, 774), (866, 760), (860, 740), (854, 720),
     (846, 704), (836, 690), (824, 677), (812, 674)],
    # fillet from the helmet bubble to the tank where the hose loop was (no hose stub)
    [(462, 350), (474, 322), (486, 330), (500, 334), (514, 333), (526, 331), (526, 352)],
    # the Earth highlight between the far hind cuff and the near hind trouser: closed, so the far leg's front edge
    # runs straight up into the near trouser (a keyhole notch there reads as a glitch)
    [(724, 652), (744, 634), (752, 640), (747, 676), (724, 676)],
    # tail tip: the fur plume ends in a soft point, not a blunt end
    [(872, 400), (896, 391), (909, 389), (904, 402), (897, 420), (880, 418)],
    # far front paw: the shaded underside of the forearm and the pads
    [(214, 640), (213, 650), (222, 656), (240, 657), (256, 653), (266, 644), (276, 630), (290, 614), (306, 602),
     (322, 594), (338, 588), (330, 576), (300, 590), (270, 610), (240, 630)],
    # near front paw: underside and pads
    [(382, 668), (383, 678), (392, 683), (412, 681), (430, 676), (440, 664), (444, 646), (452, 626), (464, 608),
     (480, 596), (500, 588), (496, 578), (470, 590), (440, 615), (410, 645)],
]
# removed (tether hose, the hose loop between helmet and tank)
ERASE = [
    # tether: everything below the belly line between the near front leg and the far hind thigh
    [(503, 590), (530, 581), (558, 572), (584, 575), (598, 581), (606, 594), (611, 616), (617, 640), (640, 700),
     (640, 1030), (300, 1030), (445, 700), (447, 650), (456, 626), (470, 606), (488, 594)],
    # hose loop above the shoulders (the helmet ellipse is re-added afterwards)
    [(478, 268), (540, 268), (536, 300), (527, 322), (515, 330), (500, 330), (488, 320)],
]
# parts: name, parent, z, cut polyline (both ends outside the silhouette; the part is what lies on the seeds' side),
#        pivot, seeds
PARTS = [
    ('body', None, 2, None, None, [(400, 450), (367, 262), (600, 350), (600, 480)]),
    ('leg-front-far', 'body', 0, [(292, 512), (366, 584)], (322, 528), [(250, 610)]),
    ('leg-front-near', 'body', 3, [(394, 592), (452, 492), (528, 586)], (466, 512), [(410, 650), (470, 560)]),
    ('leg-hind-far', 'body', 1, [(594, 586), (660, 596), (706, 592), (716, 620), (738, 656), (756, 686)], (660, 604), [(650, 640), (725, 780)]),
    ('leg-hind-near', 'body', 4, [(782, 503), (722, 540), (705, 592), (716, 620), (738, 656), (756, 686)], (748, 540), [(790, 600), (890, 760)]),
    ('tail', 'body', 1, [(741, 428), (781, 508)], (762, 470), [(850, 430)]),
]
FAR = {'leg-front-far', 'leg-hind-far'}
# smoke: centre (smoke px) and magnification (box px per smoke px). Pink / magenta / violet with blue lower left.
SMOKE = dict(c=(560, 302), mag=3.3)
# idle amplitudes the dog really uses (dog.ts): legs <= 4 deg, tail <= 6 deg (the stable silhouette is built from these)
IDLE_MAX = {'leg-front-far': 4.2, 'leg-front-near': 4.2, 'leg-hind-far': 4.2, 'leg-hind-near': 4.2, 'tail': 6.5}


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def disk(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def largest(m):
    lab, n = ndi.label(m)
    if n <= 1:
        return m
    return lab == (np.argmax(ndi.sum(m, lab, range(1, n + 1))) + 1)


def poly(shape, pts, upscale=1):
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.round(np.array(pts, np.float64) * upscale).astype(np.int32)], 1)
    return m.astype(bool)


# ------------------------------------------------------------------ segmentation (source resolution)
def helmet_ellipse(gc):
    """fit an ellipse to the glass edge (upper and left arc only: the right side has the ear bolt, the bottom the collar)"""
    cx, cy, r = HELMET_GUESS
    e = cv2.morphologyEx(gc.astype(np.uint8), cv2.MORPH_GRADIENT, disk(1)) > 0
    ys, xs = np.nonzero(e)
    d = np.hypot(xs - cx, ys - cy)
    ang = np.degrees(np.arctan2(ys - cy, xs - cx))            # 0 = right, -90 = up
    keep = (np.abs(d - r) < 16) & (((ang > -175) & (ang < -20)) | (ang > 150) | (ang < -175)) & (ys < 330)
    pts = np.stack([xs[keep], ys[keep]], 1).astype(np.float32)
    (ex, ey), (ea, eb), et = cv2.fitEllipse(pts)
    return (ex, ey), (ea, eb), et, len(pts)


def source_mask():
    rgb = np.array(Image.open(SRC / 'dog.png').convert('RGB'))
    H, W = rgb.shape[:2]
    m = np.full((H, W), cv2.GC_BGD, np.uint8)
    cv2.fillPoly(m, [np.array(GC_OUTER, np.int32)], cv2.GC_PR_FGD)
    cv2.fillPoly(m, [np.array(GC_CORE, np.int32)], cv2.GC_FGD)
    cv2.circle(m, HELMET_GUESS[:2], HELMET_GUESS[2] - 8, cv2.GC_FGD, -1)
    cv2.setRNGSeed(7)
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), m, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    gc = (m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)
    gc = largest(gc)
    ell = helmet_ellipse(gc)
    # hand corrections
    for p in ERASE:
        gc &= ~poly(gc.shape, p)
    # the helmet is exactly the fitted ellipse above the collar
    em = np.zeros(gc.shape, np.uint8)
    cv2.ellipse(em, ell[:3], 1, -1)
    em = em.astype(bool)
    big = np.zeros(gc.shape, np.uint8)
    (ex, ey), (ea, eb), et = ell[:3]
    cv2.ellipse(big, ((ex, ey), (ea * 1.12, eb * 1.12), et), 1, -1)
    yy = np.arange(gc.shape[0])[:, None]
    zone = big.astype(bool) & (yy < ey + 0.30 * eb)
    gc = np.where(zone, em, gc)                       # (the ear bolt goes too: a clean bubble reads best)
    gc |= em
    for p in ADD:                                     # after the helmet, so the helmet-to-tank fillet survives
        gc |= poly(gc.shape, p)
    gc = cv2.morphologyEx(gc.astype(np.uint8), cv2.MORPH_OPEN, disk(2)).astype(bool)   # specks, 1 px spurs
    gc = largest(gc)
    gc = cv2.morphologyEx(gc.astype(np.uint8), cv2.MORPH_CLOSE, disk(3)).astype(bool)  # nicks closed
    gc = ndi.binary_fill_holes(gc)
    return gc, ell


def sdf(m, sigma):
    d = np.where(m, ndi.distance_transform_edt(m) - 0.5, -(ndi.distance_transform_edt(~m) - 0.5)).astype(np.float32)
    return cv2.GaussianBlur(d, (0, 0), sigma)


# ------------------------------------------------------------------ smoke
def smoke_source():
    s = np.array(Image.open(SRC / 'smoke.png').convert('RGB'))
    s = cv2.bilateralFilter(s, 5, 10, 3).astype(np.float32) / 255     # de-block only, keep the wisps
    y = (s @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
    y2 = 0.10 + 0.90 * np.power(np.clip(y, 0, 1), 0.92)               # lift the darkest gaps a little
    s = s * (y2 / np.maximum(y, 1e-4))
    g = (s @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
    s = g + (s - g) * 1.12                                            # a touch richer
    return np.clip(s, 0, 1)


def render_smoke(W, H):
    src = smoke_source()
    sh, sw = src.shape[:2]
    cx, cy = SMOKE['c']; k = SMOKE['mag']
    A = np.array([[1 / k, 0, cx - W / 2 / k], [0, 1 / k, cy - H / 2 / k]], np.float64)   # box px -> smoke px
    corners = A @ np.array([[0, W, 0, W], [0, 0, H, H], [1, 1, 1, 1]])
    assert corners[0].min() >= 0 and corners[0].max() <= sw and corners[1].min() >= 0 and corners[1].max() <= sh, \
        f'smoke crop leaves smoke.png: {corners.round(1)}'
    img = cv2.warpAffine(src, A, (W, H), flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
    bl = cv2.GaussianBlur(img, (0, 0), 0.9 * k)
    img = img + 0.45 * (img - bl)                      # restore the wisp edges the upscale softened
    return np.clip(img, 0, 1), corners


# ------------------------------------------------------------------ figure
def build():
    m, ell = source_mask()
    d = sdf(m, SDF_SIGMA)
    ys, xs = np.nonzero(m)
    t = np.array([PAD - S * xs.min(), PAD - S * ys.min()])
    W = int(math.ceil(S * (xs.max() + 1) + t[0] + PAD))
    H = int(math.ceil(S * (ys.max() + 1) + t[1] + PAD))
    A = np.array([[S, 0, t[0]], [0, S, t[1]]])
    P = lambda p: (S * p[0] + t[0], S * p[1] + t[1])
    # sample source pixel centres: box = S * (src + 0.5) + t - 0.5  (keeps the edge where the mask said it is)
    A_px = np.array([[S, 0, t[0] + 0.5 * S - 0.5], [0, S, t[1] + 0.5 * S - 0.5]])
    dist = cv2.warpAffine(d, A_px, (W, H), flags=cv2.INTER_CUBIC, borderValue=-50.0) * S
    alpha = smoothstep(-EDGE / 2, EDGE / 2, dist).astype(np.float32)
    inside = alpha > 0.004

    # ---- cut into parts along the joint polylines
    bar = np.zeros((H, W), np.uint8)
    for (_, _, _, cut, _, _) in PARTS:
        if cut:
            pts = np.round(np.array([P(c) for c in cut])).astype(np.int32)
            cv2.polylines(bar, [pts], False, 1, 3, cv2.LINE_8)
    lab, n = ndi.label(inside & (bar == 0))
    own = np.full((H, W), -1, np.int32)
    for i, (name, _, _, _, _, seeds) in enumerate(PARTS):
        for sp in seeds:
            x, y = (int(round(v)) for v in P(sp))
            l = lab[y, x]
            assert l > 0, f'{name}: seed {sp} is not inside the silhouette'
            prev = np.unique(own[lab == l])
            assert set(prev.tolist()) <= {-1, i}, f'{name}: cut lines leak into {[PARTS[j][0] for j in prev if j >= 0]}'
            own[lab == l] = i
    stray = inside & (own < 0) & (bar == 0)
    sl, sn = ndi.label(stray)
    if sn:
        sizes = ndi.sum(stray, sl, range(1, sn + 1))
        assert sizes.max() < 400, f'an unseeded region of {int(sizes.max())} px (a cut line closes off a piece)'
    idx = ndi.distance_transform_edt(own < 0, return_distances=False, return_indices=True)
    own = np.where(inside, own[idx[0], idx[1]], -1)

    # ---- paint order (as the nested DOM paints it: children with z < parent z under it, the rest over it)
    rank = {}
    body_z = PARTS[0][2]
    under = sorted([i for i, p in enumerate(PARTS) if p[1] and p[2] < body_z], key=lambda i: PARTS[i][2])
    over = sorted([i for i, p in enumerate(PARTS) if p[1] and p[2] >= body_z], key=lambda i: PARTS[i][2])
    for r, i in enumerate(under + [0] + over):
        rank[i] = r
    # neighbours: parent, children and touching siblings
    touch = {}
    for i in range(len(PARTS)):
        dil = cv2.dilate((own == i).astype(np.uint8), disk(4)).astype(bool)
        touch[i] = {int(j) for j in np.unique(own[dil]) if j >= 0 and j != i}

    rim = ndi.distance_transform_edt(alpha > 0.5)     # box px from the outline, inwards
    smoke, corners = render_smoke(W, H)
    out = []
    for i, (name, par, z, cut, piv, seeds) in enumerate(PARTS):
        mine = own == i
        dd = ndi.distance_transform_edt(~mine)
        w = mine.astype(np.float32)
        for j in touch[i]:
            # under a neighbour that paints above: reach across fully for OV, then taper over another OV
            # (hidden at rest, fills the joint when it turns, and its end never shows as a step in the outline)
            # over a neighbour that paints below: fade out across OV so the cut never shows as a line
            if rank[j] > rank[i]:
                # far enough that the taper never surfaces at the rim at 8 deg (hidden at rest)
                r0, r1 = 2 * OV, 4 * OV
                w = np.where((own == j) & (dd <= r1), np.maximum(w, 1 - smoothstep(r0, r1, dd)), w)
            else:
                # (not at the rim: a soft tongue there would show as a faint sliver once the part below turns away)
                fade = (1 - smoothstep(0.35 * OV, OV, dd)) * smoothstep(3, 3 + 2 * OV, rim)
                w = np.where((own == j) & (dd <= OV), np.maximum(w, fade), w)
        a = alpha * w
        yy, xx = np.nonzero(a > 1 / 255)
        bx0, by0, bx1, by1 = int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1
        col = smoke[by0:by1, bx0:bx1]
        if name in FAR:   # darker for depth, easing in over 70 px from the joint so no straight shading edge shows
            din = ndi.distance_transform_edt(own == i)[by0:by1, bx0:bx1]
            col = col * (1 - (1 - FAR_SHADE) * smoothstep(0, 70, din))[..., None]
        rgba = np.dstack([col * 255, a[by0:by1, bx0:bx1] * 255])
        ideal = np.dstack([np.zeros((by1 - by0, bx1 - bx0, 3)), (alpha * mine)[by0:by1, bx0:bx1] * 255])
        pv = P(piv) if piv else (float(np.mean(np.nonzero(mine)[1])), float(np.mean(np.nonzero(mine)[0])))
        out.append(dict(name=name, parent=par, z=z, file=f'dog-{name}.webp', box=[bx0, by0, bx1, by1],
                        pivot=[round(pv[0], 2), round(pv[1], 2)],
                        rgba=np.clip(np.round(rgba), 0, 255).astype(np.uint8),
                        ideal=np.clip(np.round(ideal), 0, 255).astype(np.uint8)))
    cuts = [[P(c) for c in cut] for (_, _, _, cut, _, _) in PARTS if cut]
    return dict(W=W, H=H, alpha=alpha, own=own, parts=out, cuts=cuts, ell=ell, mask=m, smoke=smoke, corners=corners, P=P)


# ------------------------------------------------------------------ helpers shared by asserts / sheets
def rot_about(p, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    T = np.array([[1, 0, p[0]], [0, 1, p[1]], [0, 0, 1]]); Ti = np.array([[1, 0, -p[0]], [0, 1, -p[1]], [0, 0, 1]])
    return T @ R @ Ti


def paint_order(parts):
    root = [p for p in parts if p['parent'] is None][0]
    kids = [p for p in parts if p['parent'] == root['name']]
    return sorted([p for p in kids if p['z'] < root['z']], key=lambda p: p['z']) + [root] + \
        sorted([p for p in kids if p['z'] >= root['z']], key=lambda p: p['z'])


def assemble(fig, view, size, angles=None, bg=None, key='img'):
    """premultiplied RGBA float canvas; view: 3x3 box px -> canvas px; angles: {part: deg}"""
    angles = angles or {}
    acc = np.zeros((size[1], size[0], 4), np.float32)
    if bg is not None:
        acc[..., :3] = np.array(bg, np.float32) / 255; acc[..., 3] = 1
    for p in paint_order(fig['parts']):
        im = p[key].astype(np.float32) / 255
        im[..., :3] *= im[..., 3:]
        bx0, by0 = p['box'][:2]
        G = rot_about(p['pivot'], angles.get(p['name'], 0.0))
        M = (view @ G @ np.array([[1, 0, bx0], [0, 1, by0], [0, 0, 1]]))[:2]
        w = cv2.warpAffine(im, M, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        acc = w + acc * (1 - w[..., 3:])
    return acc


def opaque_window(full, margin=3):
    """largest 16:10 rect inside the boolean map `full` (box px), centred as well as possible"""
    full = cv2.erode(full.astype(np.uint8), disk(margin))
    lo, hi, best = 16, full.shape[1], None
    while lo <= hi:
        w = (lo + hi) // 2; h = int(round(w / 1.6))
        e = cv2.erode(full, np.ones((h, w), np.uint8), anchor=(0, 0), borderType=cv2.BORDER_CONSTANT, borderValue=0)
        if e.any():
            ys, xs = np.nonzero(e)
            k = np.argmin((xs - xs.mean()) ** 2 + (ys - ys.mean()) ** 2)
            best = (int(xs[k]), int(ys[k]), w, h); lo = w + 1
        else:
            hi = w - 1
    return best


def contour_path(mask, eps=0.6):
    """SVG path of a boolean mask (box px). Outer rings clockwise on screen, holes counter-clockwise, so the
    default nonzero fill rule (and isPointInFill) leaves the holes empty."""
    cs, hier = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    d = []
    for i, c in enumerate(cs):
        if cv2.contourArea(c) < 30:
            continue
        hole = hier[0][i][3] >= 0
        c = cv2.approxPolyDP(c, eps, True)[:, 0, :].astype(np.float64)
        area = 0.5 * np.sum(c[:, 0] * np.roll(c[:, 1], -1) - np.roll(c[:, 0], -1) * c[:, 1])   # > 0: clockwise on screen
        if (area > 0) == hole:
            c = c[::-1]
        d.append('M' + ' '.join(f'{x:.1f} {y:.1f}' for x, y in c) + 'Z')
    return ''.join(d)


# ------------------------------------------------------------------ main
def main(shots=None):
    fig = build()
    W, H = fig['W'], fig['H']
    for f in sorted(ASSET.glob('dog-*.webp')):
        if f.name not in {p['file'] for p in fig['parts']}:
            f.unlink()
    total = 0
    for p in fig['parts']:
        buf = io.BytesIO()
        Image.fromarray(p['rgba'], 'RGBA').save(buf, 'WEBP', quality=WEBP_Q, method=6, alpha_quality=100)
        (ASSET / p['file']).write_bytes(buf.getvalue())
        p['bytes'] = len(buf.getvalue()); total += p['bytes']
        p['img'] = np.array(Image.open(ASSET / p['file']).convert('RGBA'))   # asserts run on the shipped pixels
    by = {p['name']: p for p in fig['parts']}
    body = by['body']
    for p in fig['parts']:
        bx0, by0, bx1, by1 = p['box']; pw, ph = bx1 - bx0, by1 - by0
        if p['parent']:
            qx0, qy0, qx1, qy1 = by[p['parent']]['box']; qw, qh = qx1 - qx0, qy1 - qy0
        else:
            qx0, qy0, qw, qh = 0, 0, W, H
        p['css'] = dict(left=round((bx0 - qx0) / qw * 100, 3), top=round((by0 - qy0) / qh * 100, 3),
                        width=round(pw / qw * 100, 3), height=round(ph / qh * 100, 3),
                        ox=round((p['pivot'][0] - bx0) / pw * 100, 3), oy=round((p['pivot'][1] - by0) / ph * 100, 3))

    # rest union and the stable silhouette (covered in every idle pose: dog.json `silhouette`, used for the cover size)
    view = np.eye(3)
    rest = assemble(fig, view, (W, H))[..., 3]
    names = [p['name'] for p in fig['parts'] if p['parent']]
    stable = rest > 0.5
    for sgn in [(1, 1), (-1, -1), (1, -1), (-1, 1)]:
        ang = {n: IDLE_MAX[n] * (sgn[0] if ('front' in n or n == 'tail') else sgn[1]) for n in names}
        stable &= assemble(fig, view, (W, H), ang)[..., 3] > 0.5
    stable = largest(stable)
    stable = ndi.binary_fill_holes(stable)          # the dog has no real holes; any pocket is filled
    # body window: largest 16:10 rect, 100% opaque in the body part alone
    bfull = np.zeros((H, W), bool)
    bx0, by0, bx1, by1 = body['box']
    bfull[by0:by1, bx0:bx1] = body['img'][..., 3] >= 255
    win = opaque_window(bfull & stable)
    cx, cy = win[0] + win[2] / 2, win[1] + win[3] / 2
    path = contour_path(stable)
    meta = dict(
        viewBox=[0, 0, W, H], body=[round(cx / W * 100, 2), round(cy / H * 100, 2)], silhouette=path,
        source='dog.png', scale=S, window=list(win),
        parts=[{k: p[k] for k in ('name', 'parent', 'z', 'file', 'box', 'pivot', 'css')} for p in fig['parts']],
    )
    (COMP / 'dog.json').write_text(json.dumps(meta, indent=1) + '\n')

    if shots:
        contact_sheets(fig, Path(shots), win, stable)

    # ================================================================ asserts
    meta = json.loads((COMP / 'dog.json').read_text())
    # 1. no hole at the joints with every joint at +-8 deg (all one way, and front vs hind opposite):
    #    the rest silhouette, cut at the joints into rigid pieces and posed, is the shape that must be covered;
    #    any uncovered component of it larger than 6 px^2 is a hole (a seam opening at a joint)
    pad = int(0.25 * max(W, H))
    size = (W + 2 * pad, H + 2 * pad)
    pv = np.array([[1, 0, pad], [0, 1, pad], [0, 0, 1]], float)
    worst = 0
    for case, f in [('+8', lambda n: 8), ('-8', lambda n: -8), ('alt', lambda n: 8 if ('front' in n or n == 'tail') else -8),
                    ('alt2', lambda n: -8 if ('front' in n or n == 'tail') else 8)]:
        ang = {n: f(n) for n in names}
        u = assemble(fig, pv, size, ang)[..., 3] > 0.5
        ideal = assemble(fig, pv, size, ang, key='ideal')[..., 3] > 0.5
        ideal = cv2.erode(ideal.astype(np.uint8), disk(1)).astype(bool)   # ignore the 1 px resampled rim
        # holes = posed rigid pieces left uncovered, or pockets enclosed by the union INSIDE the rest silhouette
        # (two limbs swinging together can pinch an outside notch shut: that is background, not a seam)
        restm = np.zeros_like(u); restm[pad:pad + H, pad:pad + W] = rest > 0.5
        hm = (ideal & ~u) | (ndi.binary_fill_holes(u) & ~u & restm)
        lab, n = ndi.label(hm)
        big = int(ndi.sum(hm, lab, range(1, n + 1)).max()) if n else 0
        worst = max(worst, big)
        if shots and big > 6:
            Image.fromarray(np.dstack([ideal * 80, u * 160, hm * 255]).astype(np.uint8)).save(Path(shots) / f'holes-{case}.png')
            print('holes', case, [(int(c[1].start) - pad, int(c[0].start) - pad, int(ndi.sum(hm, lab, i + 1)))
                                  for i, c in enumerate(ndi.find_objects(lab)) if ndi.sum(hm, lab, i + 1) > 6])
    assert worst <= 6, f'hole of {worst} px^2 at a joint with +-8 deg'
    # 2. the body window is 16:10 and 100% opaque in the body part alone (decoded WebP), centred on `body`
    x0, y0, ww, hh = meta['window']
    assert abs(ww / hh - 1.6) < 0.01, 'body window is not 16:10'
    assert body['img'][y0 - by0:y0 + hh - by0, x0 - bx0:x0 + ww - bx0, 3].min() == 255, 'body window not fully opaque'
    assert abs((x0 + ww / 2) / W * 100 - meta['body'][0]) < 0.05 and abs((y0 + hh / 2) / H * 100 - meta['body'][1]) < 0.05
    # 3. the silhouette path really contains the window (what journey.ts checks with isPointInFill)
    chk = np.zeros((H, W), np.uint8)
    for sub in meta['silhouette'].split('Z')[:-1]:
        nums = np.array(sub[1:].split(), float).reshape(-1, 2)
        a2 = 0.5 * np.sum(nums[:, 0] * np.roll(nums[:, 1], -1) - np.roll(nums[:, 0], -1) * nums[:, 1])
        cv2.fillPoly(chk, [np.round(nums).astype(np.int32)], 1 if a2 > 0 else 0)
    assert chk[y0:y0 + hh, x0:x0 + ww].min() == 1, 'silhouette path does not contain the body window'
    iou = (chk.astype(bool) & stable).sum() / (chk.astype(bool) | stable).sum()
    assert iou > 0.995, f'silhouette path drifts from the stable mask (IoU {iou:.4f})'
    # 4. weight
    assert total < BUDGET, f'dog parts are {total} bytes'

    print(f'box {W}x{H}  scale {S}  helmet ellipse c=({fig["ell"][0][0]:.1f},{fig["ell"][0][1]:.1f}) axes=({fig["ell"][1][0]:.1f},{fig["ell"][1][1]:.1f}) '
          f'angle {fig["ell"][2]:.1f} from {fig["ell"][3]} edge px')
    print('smoke crop (smoke px corners x / y):', fig['corners'].round(0).tolist())
    print('parts', {p['name']: (p['box'][2] - p['box'][0], p['box'][3] - p['box'][1], p['bytes']) for p in fig['parts']})
    print(f'body window {meta["window"]}  body {meta["body"]}  viewBox {meta["viewBox"]}  path {len(meta["silhouette"])} chars, '
          f'{meta["silhouette"].count("M")} rings, IoU {iou:.4f}')
    print(f'part bytes {total}  worst joint hole px^2 {worst}')
    print('OK dog')


# ------------------------------------------------------------------ contact sheets (review only)
BG = (3, 4, 10)


def flat(acc):
    a = acc; bg = np.array(BG, np.float32) / 255
    return np.clip(np.round((a[..., :3] + bg * (1 - a[..., 3:])) * 255), 0, 255).astype(np.uint8)


def label(img, text, scale=1.0):
    cv2.putText(img, text, (int(16 * scale), int(40 * scale)), cv2.FONT_HERSHEY_SIMPLEX, 1.1 * scale, (200, 200, 220), max(1, int(2 * scale)))
    return img


def fit(img, w):
    h = int(round(img.shape[0] * w / img.shape[1]))
    return np.array(Image.fromarray(img).resize((w, h), Image.LANCZOS))


def contact_sheets(fig, out, win, stable):
    out.mkdir(parents=True, exist_ok=True)
    W, H = fig['W'], fig['H']
    names = [p['name'] for p in fig['parts'] if p['parent']]
    pad = int(0.08 * max(W, H))
    size = (W + 2 * pad, H + 2 * pad)
    view = np.array([[1, 0, pad], [0, 1, pad], [0, 0, 1]], float)
    rest = flat(assemble(fig, view, size, bg=BG))
    Image.fromarray(rest).save(out / 'rest-full.png')
    poses = []
    for a in (8, -8):
        ang = {n: (a * 1.5 if n == 'tail' else a) for n in names}
        poses.append(label(fit(flat(assemble(fig, view, size, ang, bg=BG)), 900), f'legs {a:+d}, tail {a * 1.5:+.0f} deg'))
    alt = {n: (8 if ('front' in n or n == 'tail') else -8) for n in names}
    poses.append(label(fit(flat(assemble(fig, view, size, alt, bg=BG)), 900), 'front/tail +8, hind -8'))
    r900 = label(fit(rest, 900), 'rest 900 px')
    r260 = fit(rest, 260)
    tile = np.zeros_like(r900); tile[:] = BG
    tile[80:80 + r260.shape[0], 40:40 + 260] = r260
    cv2.putText(tile, 'rest 260 px', (40, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (200, 200, 220), 2)
    # 4x edge zooms: helmet top, front paw, tail tip, hind paw
    restb = flat(assemble(fig, np.eye(3), (W, H), bg=BG))
    P = fig['P']
    zooms = []
    for (sx, sy) in [(330, 150), (225, 650), (895, 395), (890, 776)]:
        x, y = (int(v) for v in P((sx, sy)))
        c = restb[max(y - 56, 0):y + 56, max(x - 56, 0):x + 56]
        c = np.pad(c, ((0, 112 - c.shape[0]), (0, 112 - c.shape[1]), (0, 0)))
        zooms.append(cv2.resize(c, None, fx=4, fy=4, interpolation=cv2.INTER_NEAREST))
    zrow = np.hstack(zooms)                                  # 1792 wide
    zrow = fit(zrow, 1800)
    row1 = np.hstack([r900, tile])
    row2 = np.hstack(poses[:2])
    hmax = max(row1.shape[0], row2.shape[0])
    sheet = np.vstack([np.pad(row1, ((0, 0), (0, 1800 - row1.shape[1]), (0, 0))),
                       np.pad(row2, ((0, 0), (0, 1800 - row2.shape[1]), (0, 0))),
                       np.pad(np.hstack([poses[2], np.zeros_like(poses[2])]), ((0, 0), (0, 0), (0, 0))),
                       np.pad(label(zrow.copy(), '4x edges: helmet, front paw, tail tip, hind paw'), ((0, 0), (0, 1800 - zrow.shape[1]), (0, 0)))])
    Image.fromarray(sheet).save(out / 'contact-sheet.png')
    Image.fromarray(zrow).save(out / 'edges-4x.png')
    # cut map + body window + stable outline
    own = fig['own']; rng = np.random.default_rng(3); cols = rng.integers(60, 255, (len(fig['parts']), 3))
    cm = np.zeros(own.shape + (3,), np.uint8); cm[own >= 0] = cols[own[own >= 0]]
    for p in fig['parts']:
        cv2.circle(cm, tuple(int(v) for v in p['pivot']), 12, (255, 255, 255), -1)
    x, y, w, h = win
    cv2.rectangle(cm, (x, y), (x + w, y + h), (255, 255, 255), 4)
    e = cv2.morphologyEx(stable.astype(np.uint8), cv2.MORPH_GRADIENT, disk(2)) > 0
    cm[e] = (255, 0, 0)
    Image.fromarray(fit(cm, 1000)).save(out / 'cuts.png')
    # outline over the source photo (did we follow the dog?)
    src = np.array(Image.open(SRC / 'dog.png').convert('RGB'))
    m = fig['mask']
    ov = (src * 0.55).astype(np.uint8)
    e = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_GRADIENT, disk(1)) > 0
    ov[e] = (0, 255, 120)
    Image.fromarray(ov).crop((180, 110, 940, 820)).resize((1520, 1420), Image.LANCZOS).save(out / 'outline-on-source.png')


if __name__ == '__main__':
    shots = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
    main(shots)
