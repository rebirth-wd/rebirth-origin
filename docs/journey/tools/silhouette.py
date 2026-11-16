#!/usr/bin/env python3
"""Smoke-filled astronaut silhouettes for <Astronaut/>.

    python3 docs/journey/tools/silhouette.py astronauts [--shots DIR]

Inputs  docs/journey/source/astronaut-a.png (left figure), astronaut-b.png (right figure, mirrored), smoke.png
Outputs src/assets/space/astronaut-{left,right}-<part>.webp, src/assets/space/smoke-pink.webp,
        src/components/space/rig.json (contract: docs/journey/ASSETS.md)

Only the OUTLINE of each photo is used: alpha = "not white" + largest component + hole fill, smoothed through a
signed-distance field and upscaled to a crisp ~2 px anti-aliased edge. RGB is smoke only (no suit pixel survives).
Each figure is pre-rotated so its reaching arm points at the other figure; rotation 0 of both boxes is the clasp pose.
Limbs are cut along hand-placed lines at the joints, each part overlaps its neighbour by OV px across the cut, and
the smoke is sampled once per figure in rest-pose box coordinates, so the texture is continuous across the joints.
Asserts at the end fail the run; with --shots the contact sheets are written for visual review.
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

S = 1.6          # source px -> box px
PAD = 28         # box px around the silhouette
OV = 36          # box px a part reaches (fully, then tapering over another OV) under the neighbour above it
FADE = 20        # box px soft edge of a part over the neighbour below it
EDGE = 2.0       # width (box px) of the anti-aliased silhouette edge
TIP_INSET = 3.0  # box px: the hand point sits this far inside the fingertip, so the clasped hands overlap a little
WEBP_Q = 82
SMOKE_OUT = (2560, 1600)

# ---------------------------------------------------------------------------------------------------------------
# Joint table, in pixels of the ORIGINAL source photo (before the mirror of figure b).
#   cut:   a line across the limb at the joint (both ends outside the silhouette); the part is what lies distal of it
#   pivot: rotation centre (defaults to the middle of the cut)
#   seeds: points that lie inside the part
# z: paint order inside the parent (as Astronaut.astro: z-index = z - parent z; negative = under the parent).
#    Every child paints above its parent, so the parent reaches fully under it and fills the wedge a bend opens.
# ---------------------------------------------------------------------------------------------------------------
FIG = {
    'left': dict(
        src='astronaut-a.png', flip=False,
        arm_angle=12.0,            # direction (deg, screen axes: 0 = right, 90 = down) of shoulder -> hand at rest
        reach_from=(622, 300), reach_to=(835, 65),
        head=(470, 160), neck=(488, 300),
        erase=[],
        smoke=dict(c=(600, 300), mag=3.3, sat=1.05),                 # pink / magenta / violet
        parts=[
            ('torso', None, 2, None, None, [(480, 450), (470, 160), (520, 600)]),
            ('arm-other', 'torso', 3, [(330, 266), (353, 414)], None, [(250, 340), (120, 220)]),
            ('arm-reach-upper', 'torso', 4, [(610, 214), (647, 372)], None, [(665, 300)]),
            ('arm-reach-lower', 'arm-reach-upper', 5, [(708, 220), (742, 352)], None, [(780, 200), (830, 75)]),
            ('leg-a-upper', 'torso', 3, [(378, 632), (548, 702)], None, [(455, 760)]),
            ('leg-a-lower', 'leg-a-upper', 3, [(378, 846), (546, 856)], None, [(500, 1000), (515, 1130)]),
            ('leg-b-upper', 'torso', 3, [(548, 702), (686, 594)], None, [(650, 730)]),
            ('leg-b-lower', 'leg-b-upper', 3, [(600, 832), (764, 790)], None, [(680, 950), (700, 1060)]),
        ],
    ),
    'right': dict(
        src='astronaut-b.png', flip=True,
        arm_angle=168.0,
        reach_from=(662, 385), reach_to=(940, 330),
        head=(500, 190), neck=(500, 330),
        # tether wires and a wrist clip on the hanging arm, the hose loop beside the chest (suit detail, not outline)
        erase=[[(258, 524), (296, 524), (296, 568), (258, 568)], [(80, 516), (123, 516), (123, 542), (80, 542)],
               [(296, 492), (326, 484), (338, 560), (343, 614), (320, 614), (292, 560)]],
        smoke=dict(c=(232, 330), mag=3.45, flipv=True, hue=18, sat=1.05),  # blue / violet (mirrored, cooled)
        parts=[
            ('torso', None, 2, None, None, [(500, 500), (500, 190), (500, 760)]),
            ('arm-other', 'torso', 3, [(314, 276), (305, 498)], None, [(220, 500), (160, 720)]),
            ('arm-reach-upper', 'torso', 4, [(686, 286), (688, 488)], None, [(720, 420)]),
            ('arm-reach-lower', 'arm-reach-upper', 5, [(778, 300), (806, 515)], None, [(860, 380), (930, 330)]),
            ('leg-a-upper', 'torso', 3, [(300, 715), (492, 800)], None, [(400, 860)]),
            ('leg-a-lower', 'leg-a-upper', 3, [(300, 968), (474, 962)], None, [(400, 1080)]),
            ('leg-b-upper', 'torso', 3, [(492, 800), (700, 712)], None, [(590, 860)]),
            ('leg-b-lower', 'leg-b-upper', 3, [(520, 966), (700, 960)], None, [(600, 1080)]),
        ],
    ),
}
NAMES = ['torso', 'arm-reach-upper', 'arm-reach-lower', 'arm-other', 'leg-a-upper', 'leg-a-lower', 'leg-b-upper', 'leg-b-lower']


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


# ------------------------------------------------------------------ silhouette (source resolution)
def source_mask(F):
    rgb = np.array(Image.open(SRC / F['src']).convert('RGB')).astype(np.int16)
    m = (255 - rgb.min(-1)) > 4                      # background is pure white (255); anything else is figure
    m = largest(m)
    for poly in F['erase']:
        e = np.zeros(m.shape, np.uint8)
        cv2.fillPoly(e, [np.array(poly, np.int32)], 1)
        m &= e == 0
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, disk(3)).astype(bool)   # wires / specks off
    m = largest(m)
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, disk(1)).astype(bool)  # 1 px nicks closed
    m = ndi.binary_fill_holes(m)                      # visor, highlights, watermark: all inside
    return m


def sdf(m):
    """signed distance (source px), + inside, zero on the pixel-edge boundary, lightly smoothed (no staircase)"""
    d = np.where(m, ndi.distance_transform_edt(m) - 0.5, -(ndi.distance_transform_edt(~m) - 0.5)).astype(np.float32)
    return cv2.GaussianBlur(d, (0, 0), 1.25)


# ------------------------------------------------------------------ smoke
_smoke = {}


def smoke_source(hue=0.0, sat=1.0):
    """smoke.png de-blocked, darkest gaps lifted a little, hue rotated by `hue` deg (luma kept), saturation * sat"""
    key = (hue, sat)
    if key not in _smoke:
        s = np.array(Image.open(SRC / 'smoke.png').convert('RGB'))
        s = cv2.bilateralFilter(s, 5, 10, 3).astype(np.float32) / 255     # de-block only, keep the wisps
        to = np.array([[0.299, 0.587, 0.114], [0.596, -0.274, -0.322], [0.211, -0.523, 0.312]], np.float32)  # YIQ
        yiq = s @ to.T
        y = yiq[..., :1]
        y2 = 0.08 + 0.92 * np.power(np.clip(y, 0, 1), 0.95)               # lift the darkest gaps a little
        c, sn = math.cos(math.radians(hue)), math.sin(math.radians(hue))
        iq = yiq[..., 1:] @ np.array([[c, sn], [-sn, c]], np.float32) * sat * (y2 / np.maximum(y, 1e-4))
        _smoke[key] = np.clip(np.concatenate([y2, iq], -1) @ np.linalg.inv(to).T, 0, 1).astype(np.float32)
    return _smoke[key]


def smoke_map(cfg, W, H):
    """affine box px -> smoke px for one figure"""
    cx, cy = cfg['c']; k = cfg['mag']; f = -1 if cfg.get('flipv') else 1
    return np.array([[1 / k, 0, cx - W / 2 / k], [0, f / k, cy - f * H / 2 / k]], np.float64)


def render_smoke(cfg, W, H, rect=None, out=None):
    """smoke for box px rect (x, y, w, h) (default: whole box) rendered at out=(ow, oh) px"""
    src = smoke_source(cfg.get('hue', 0.0), cfg.get('sat', 1.0))
    sh, sw = src.shape[:2]
    m = smoke_map(cfg, W, H)
    x, y, w, h = rect or (0, 0, W, H)
    ow, oh = out or (w, h)
    sx, sy = w / ow, h / oh                            # dst px -> box px
    box_from_dst = np.array([[sx, 0, x], [0, sy, y], [0, 0, 1]])
    A = (np.vstack([m, [0, 0, 1]]) @ box_from_dst)[:2]  # dst px -> smoke px
    corners = A @ np.array([[0, ow, 0, ow], [0, 0, oh, oh], [1, 1, 1, 1]])
    assert corners[0].min() >= 0 and corners[0].max() <= sw and corners[1].min() >= 0 and corners[1].max() <= sh, \
        f'smoke crop leaves smoke.png: {corners.round(1)}'
    img = cv2.warpAffine(src, A, (ow, oh), flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
    mag = 1 / abs(A[0, 0])                                # dst px per smoke px
    if mag > 6:   # full-screen cover (smoke-pink): smooth away the smoke.png pixel grid instead of sharpening it
        return np.clip(cv2.GaussianBlur(img, (0, 0), 0.6 * mag), 0, 1)
    bl = cv2.GaussianBlur(img, (0, 0), 0.9 * mag)
    img = img + 0.45 * (img - bl)                      # restore the wisp edges the upscale softened
    return np.clip(img, 0, 1)


# ------------------------------------------------------------------ figure
def build(who):
    F = FIG[who]
    m = source_mask(F)
    Hs, Ws = m.shape
    fx = (lambda p: (Ws - 1 - p[0], p[1])) if F['flip'] else (lambda p: p)
    if F['flip']:
        m = m[:, ::-1].copy()
    d = sdf(m)
    a0, a1 = np.array(fx(F['reach_from']), float), np.array(fx(F['reach_to']), float)
    rot = F['arm_angle'] - math.degrees(math.atan2(a1[1] - a0[1], a1[0] - a0[0]))
    c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    L = S * np.array([[c, -s_], [s_, c]])
    ys, xs = np.nonzero(cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_GRADIENT, disk(1)))
    q = L @ np.vstack([xs, ys])
    t = -q.min(1) + PAD
    W, H = int(math.ceil(q[0].max() + t[0] + PAD)), int(math.ceil(q[1].max() + t[1] + PAD))
    A = np.hstack([L, t[:, None]])
    P = lambda p: tuple((A @ np.array([*fx(p), 1.0])).tolist())

    dist = cv2.warpAffine(d, A, (W, H), flags=cv2.INTER_CUBIC, borderValue=-50.0) * S
    alpha = smoothstep(-EDGE / 2, EDGE / 2, dist).astype(np.float32)
    inside = alpha > 0.004

    # ---- cut into parts along the joint lines
    parts = F['parts']
    bar = np.zeros((H, W), np.uint8)
    for (_, _, _, cut, _, _) in parts:
        if cut:
            cv2.line(bar, tuple(int(round(v)) for v in P(cut[0])), tuple(int(round(v)) for v in P(cut[1])), 1, 3, cv2.LINE_8)
    lab, n = ndi.label(inside & (bar == 0))
    own = np.full((H, W), -1, np.int32)
    for i, (name, _, _, _, _, seeds) in enumerate(parts):
        for sp in seeds:
            x, y = (int(round(v)) for v in P(sp))
            l = lab[y, x]
            assert l > 0, f'{who}/{name}: seed {sp} is not inside the silhouette'
            prev = np.unique(own[lab == l])
            assert set(prev.tolist()) <= {-1, i}, f'{who}/{name}: cut lines leak into {[parts[j][0] for j in prev if j >= 0]}'
            own[lab == l] = i
    idx = ndi.distance_transform_edt(own < 0, return_distances=False, return_indices=True)
    own = np.where(inside, own[idx[0], idx[1]], -1)

    # ---- paint order (as the nested DOM paints it)
    kids = {None: []}
    for i, p in enumerate(parts):
        kids.setdefault(p[1], []).append(i)
    order = []

    def paint(i, pz):
        ch = kids.get(parts[i][0], [])
        neg = sorted([k for k in ch if parts[k][2] < pz], key=lambda k: parts[k][2] - pz)
        pos = sorted([k for k in ch if parts[k][2] >= pz], key=lambda k: parts[k][2] - pz)
        for k in neg: paint(k, parts[k][2])
        order.append(i)
        for k in pos: paint(k, parts[k][2])
    for r in kids[None]:
        paint(r, parts[r][2])
    rank = {i: order.index(i) for i in range(len(parts))}
    byname = {p[0]: i for i, p in enumerate(parts)}

    smoke = render_smoke(F['smoke'], W, H)
    out = []
    for i, (name, par, z, cut, piv, seeds) in enumerate(parts):
        mine = own == i
        dd = ndi.distance_transform_edt(~mine)
        nb = [byname[par]] if par else []
        nb += [k for k, p in enumerate(parts) if p[1] == name or (par and p[1] == par and k != i)]   # children, siblings
        w = mine.astype(np.float32)
        for j in nb:
            # under a neighbour that paints above: reach across fully for OV, then taper over another OV (hidden at
            # rest, fills the joint when bent, and its end never shows as a step in the outline)
            # over a neighbour that paints below: a short soft edge (FADE px) across the cut, so the cut never shows as
            # a line at rest and no long feathered flap sticks out of the outline when the joint bends
            if rank[j] > rank[i]:
                w = np.where((own == j) & (dd <= 2 * OV), 1 - smoothstep(OV, 2 * OV, dd), w)
            else:
                w = np.where((own == j) & (dd <= FADE), 1 - smoothstep(0.3 * FADE, FADE, dd), w)
        a = alpha * w
        yy, xx = np.nonzero(a > 1 / 255)
        bx0, by0, bx1, by1 = int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1
        rgba = np.dstack([smoke[by0:by1, bx0:bx1] * 255, a[by0:by1, bx0:bx1] * 255])
        ideal = np.dstack([np.zeros((by1 - by0, bx1 - bx0, 3)), (alpha * mine)[by0:by1, bx0:bx1] * 255])
        rgba = np.clip(np.round(rgba), 0, 255).astype(np.uint8)
        if cut:
            pv = P(piv) if piv else tuple(((np.array(P(cut[0])) + P(cut[1])) / 2).tolist())
        else:
            pv = (float(np.mean(np.nonzero(mine)[1])), float(np.mean(np.nonzero(mine)[0])))
        out.append(dict(name=name, parent=par, z=z, file=f'astronaut-{who}-{name}.webp',
                        box=[bx0, by0, bx1, by1], pivot=[round(pv[0], 2), round(pv[1], 2)], rgba=rgba,
                        ideal=np.clip(np.round(ideal), 0, 255).astype(np.uint8)))

    # ---- hand tip: furthest silhouette pixel of the reaching hand along the arm, pulled in by TIP_INSET
    sh_ = np.array(P(F['reach_from']))
    dirv = np.array([math.cos(math.radians(F['arm_angle'])), math.sin(math.radians(F['arm_angle']))])
    hy, hx = np.nonzero((own == byname['arm-reach-lower']) & (alpha > 0.5))
    proj = (hx - sh_[0]) * dirv[0] + (hy - sh_[1]) * dirv[1]
    far = proj >= proj.max() - 1.0
    tip = np.array([hx[far].mean(), hy[far].mean()]) - dirv * TIP_INSET
    head, neck = np.array(P(F['head'])), np.array(P(F['neck']))
    cuts = {n: (P(c[0]), P(c[1])) for (n, _, _, c, _, _) in parts if c}
    return dict(who=who, W=W, H=H, rot=rot, cuts=cuts, alpha=alpha, own=own, parts=out, tip=tip, smoke_cfg=F['smoke'],
                headAngle=round(math.degrees(math.atan2(head[1] - neck[1], head[0] - neck[0])), 1))


def opaque_window(torso_a, box, W, H, margin=3):
    """largest 16:10 rect fully opaque in the torso part (box px)"""
    bx0, by0, bx1, by1 = box
    full = np.zeros((H, W), np.uint8)
    full[by0:by1, bx0:bx1] = torso_a >= 255
    full = cv2.erode(full, disk(margin))
    lo, hi, best = 16, 2000, None
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


# ------------------------------------------------------------------ assembly (same geometry as the nested DOM)
def rot_about(p, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    T = np.array([[1, 0, p[0]], [0, 1, p[1]], [0, 0, 1]]); Ti = np.array([[1, 0, -p[0]], [0, 1, -p[1]], [0, 0, 1]])
    return T @ R @ Ti


def paint_order(parts):
    by = {p['name']: p for p in parts}
    order = []

    def go(p, pz):
        ch = [q for q in parts if q['parent'] == p['name']]
        for q in sorted([q for q in ch if q['z'] < pz], key=lambda q: q['z']): go(q, q['z'])
        order.append(p)
        for q in sorted([q for q in ch if q['z'] >= pz], key=lambda q: q['z']): go(q, q['z'])
    for p in parts:
        if p['parent'] is None: go(p, p['z'])
    return order, by


def assemble(fig, view, size, angles=None, bg=None, key='img', only=None, glob_out=None):
    """premultiplied RGBA float canvas; view: 3x3 box px -> canvas px; angles: {part: deg}"""
    angles = angles or {}
    order, by = paint_order(fig['parts'])
    acc = np.zeros((size[1], size[0], 4), np.float32)
    if bg is not None:
        acc[..., :3] = np.array(bg, np.float32) / 255; acc[..., 3] = 1
    G = {}

    def glob(p):
        if p['name'] not in G:
            base = glob(by[p['parent']]) if p['parent'] else np.eye(3)
            G[p['name']] = base @ rot_about(p['pivot'], angles.get(p['name'], 0.0))
        return G[p['name']]
    if glob_out is not None:
        glob_out.update({p['name']: glob(p) for p in order})
    for p in order:
        if only is not None and p['name'] not in only:
            continue
        im = p[key].astype(np.float32) / 255
        im[..., :3] *= im[..., 3:]
        bx0, by0 = p['box'][:2]
        M = (view @ glob(p) @ np.array([[1, 0, bx0], [0, 1, by0], [0, 0, 1]]))[:2]
        w = cv2.warpAffine(im, M, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        acc = w + acc * (1 - w[..., 3:])
    return acc


def to_u8(acc):
    return np.clip(np.round(acc[..., :3] * 255), 0, 255).astype(np.uint8)


# ------------------------------------------------------------------ main
def astronauts(shots=None):
    figs = {who: build(who) for who in ('left', 'right')}
    for who in figs:
        old = sorted(ASSET.glob(f'astronaut-{who}-*.webp'))
        for f in old:
            if f.name not in {p['file'] for p in figs[who]['parts']}:
                f.unlink()
    total = 0
    meta = {}
    for who, fig in figs.items():
        W, H = fig['W'], fig['H']
        for p in fig['parts']:
            buf = io.BytesIO()
            Image.fromarray(p['rgba'], 'RGBA').save(buf, 'WEBP', quality=WEBP_Q, method=6, alpha_quality=100)
            (ASSET / p['file']).write_bytes(buf.getvalue())
            total += len(buf.getvalue())
            p['img'] = np.array(Image.open(ASSET / p['file']).convert('RGBA'))   # asserts run on the shipped pixels
        by = {p['name']: p for p in fig['parts']}
        for p in fig['parts']:
            bx0, by0, bx1, by1 = p['box']; pw, ph = bx1 - bx0, by1 - by0
            if p['parent']:
                qx0, qy0, qx1, qy1 = by[p['parent']]['box']; qw, qh = qx1 - qx0, qy1 - qy0
            else:
                qx0, qy0, qw, qh = 0, 0, W, H
            p['css'] = dict(left=round((bx0 - qx0) / qw * 100, 3), top=round((by0 - qy0) / qh * 100, 3),
                            width=round(pw / qw * 100, 3), height=round(ph / qh * 100, 3),
                            ox=round((p['pivot'][0] - bx0) / pw * 100, 3), oy=round((p['pivot'][1] - by0) / ph * 100, 3))
        t = by['torso']
        win = opaque_window(t['img'][..., 3], t['box'], W, H)
        fig['window'] = win
        cx, cy = win[0] + win[2] / 2, win[1] + win[3] / 2
        hp = by['arm-reach-lower']; hb = hp['box']
        meta[who] = dict(
            width=W, height=H, source=FIG[who]['src'], mirrored=FIG[who]['flip'], rotation=round(fig['rot'], 2), scale=S,
            parts=[{k: p[k] for k in ('name', 'parent', 'z', 'file', 'box', 'pivot', 'css')} for p in fig['parts']],
            chest=[round(cx / W * 100, 2), round(cy / H * 100, 2)],
            hand=[round(fig['tip'][0] / W * 100, 3), round(fig['tip'][1] / H * 100, 3)],
            headAngle=fig['headAngle'],
            handInPart=[round((fig['tip'][0] - hb[0]) / (hb[2] - hb[0]) * 100, 3), round((fig['tip'][1] - hb[1]) / (hb[3] - hb[1]) * 100, 3)],
        )
    L, R = figs['left'], figs['right']
    wl = L['window']
    meta['left']['smokeRect'] = dict(l=round(wl[0] / L['W'], 5), t=round(wl[1] / L['H'], 5), w=round(wl[2] / L['W'], 5), h=round(wl[3] / L['H'], 5))
    off = (L['tip'] - R['tip']) / L['W']
    rig = dict(clasp=dict(rightRelW=round(R['W'] / L['W'], 5), off=[round(float(off[0]), 5), round(float(off[1]), 5)]),
               left=meta['left'], right=meta['right'])
    (COMP / 'rig.json').write_text(json.dumps(rig, indent=1) + '\n')

    # smoke-pink.webp = the left smokeRect window, from the same smoke field
    sr = meta['left']['smokeRect']
    rect = (sr['l'] * L['W'], sr['t'] * L['H'], sr['w'] * L['W'], sr['h'] * L['H'])
    pink = render_smoke(L['smoke_cfg'], L['W'], L['H'], rect, SMOKE_OUT)
    pink8 = np.clip(np.round(pink * 255), 0, 255).astype(np.uint8)
    Image.fromarray(pink8).save(ASSET / 'smoke-pink.webp', 'WEBP', quality=78, method=6)
    avg = pink8.reshape(-1, 3).mean(0)

    # ================================================================ asserts
    rig = json.loads((COMP / 'rig.json').read_text())
    WL = rig['left']['width']
    # 1. clasp: hand tips (as the browser computes them from rig.json) coincide
    def hand_px(r, ox, oy, scale):
        return np.array([ox + r['hand'][0] / 100 * r['width'] * scale, oy + r['hand'][1] / 100 * r['height'] * scale])
    sc = rig['clasp']['rightRelW'] * WL / rig['right']['width']
    hl = hand_px(rig['left'], 0, 0, 1.0)
    hr = hand_px(rig['right'], rig['clasp']['off'][0] * WL, rig['clasp']['off'][1] * WL, sc)
    assert np.hypot(*(hl - hr)) <= 2, f'clasp: hand tips {hl} vs {hr}'
    # ... and the marker inside arm-reach-lower (handInPart, via the nested css boxes) lands on the same point
    for who in ('left', 'right'):
        r = rig[who]; byn = {p['name']: p for p in r['parts']}
        x, y, w, h = 0.0, 0.0, float(r['width']), float(r['height'])
        chain = []
        p = byn['arm-reach-lower']
        while p: chain.append(p); p = byn.get(p['parent'])
        for p in reversed(chain):
            c = p['css']; x, y, w, h = x + c['left'] / 100 * w, y + c['top'] / 100 * h, c['width'] / 100 * w, c['height'] / 100 * h
        mk = np.array([x + r['handInPart'][0] / 100 * w, y + r['handInPart'][1] / 100 * h])
        assert np.hypot(*(mk - hand_px(r, 0, 0, 1.0))) <= 2, f'{who}: handInPart disagrees with hand'
        ax, ay = (int(round(v)) for v in mk)
        assert figs[who]['alpha'][ay, ax] > 0.5, f'{who}: hand point is not on the silhouette'
    # 2. smokeRect is 100% opaque (torso part alone, decoded WebP)
    t = {p['name']: p for p in L['parts']}['torso']
    x0, y0 = math.floor(sr['l'] * L['W']), math.floor(sr['t'] * L['H'])
    x1, y1 = math.ceil((sr['l'] + sr['w']) * L['W']), math.ceil((sr['t'] + sr['h']) * L['H'])
    tb = t['box']
    assert t['img'][y0 - tb[1]:y1 - tb[1], x0 - tb[0]:x1 - tb[0], 3].min() == 255, 'smokeRect not fully opaque'
    assert abs(sr['w'] * L['W'] / (sr['h'] * L['H']) - 1.6) < 0.01, 'smokeRect is not 16:10'
    ch = rig['left']['chest']
    assert abs((sr['l'] + sr['w'] / 2) * 100 - ch[0]) < 0.05 and abs((sr['t'] + sr['h'] / 2) * 100 - ch[1]) < 0.05, 'chest is not the smokeRect centre'
    # clasp arrangement (asserted below)
    pad = 200
    offpx = np.array(rig['clasp']['off']) * WL
    cw = int(max(L['W'], offpx[0] + R['W']) - min(0, offpx[0])) + 2 * pad
    chh = int(max(L['H'], offpx[1] + R['H']) - min(0, offpx[1])) + 2 * pad
    ox, oy = pad - min(0, offpx[0]), pad - min(0, offpx[1])
    vl = np.array([[1, 0, ox], [0, 1, oy], [0, 0, 1]], float)
    vr = np.array([[1, 0, ox + offpx[0]], [0, 1, oy + offpx[1]], [0, 0, 1]], float)
    al = assemble(L, vl, (cw, chh)); ar = assemble(R, vr, (cw, chh))
    both = (al[..., 3] > 0.05) & (ar[..., 3] > 0.05)
    hx, hy = hl[0] + ox, hl[1] + oy
    if shots:
        contact_sheets(figs, rig, Path(shots), (al, ar, (hx, hy)))
    # 3. no hole at the joints with every joint at +-8 deg (all one way, and alternating parent/child).
    #    What a continuous body would cover at a joint: the parent piece plus the child piece swept from 0 to its
    #    angle (the wedge a bend opens), inside a 25 px band along the cut, less a 3 px rim (an outline that
    #    shifts by <= 3 px at a bent corner is not a hole). The shipped parts, posed, must cover all of it except
    #    components of <= 6 px^2.
    holes = {}
    for who, fig in figs.items():
        pad = int(0.3 * max(fig['W'], fig['H']))
        size = (fig['W'] + 2 * pad, fig['H'] + 2 * pad)
        view = np.array([[1, 0, pad], [0, 1, pad], [0, 0, 1]], float)
        names = [p['name'] for p in fig['parts'] if p['parent']]
        by = {p['name']: p for p in fig['parts']}
        depth = {n: 1 + (by[n]['parent'] != 'torso') for n in names}
        worst = 0
        for case, f in [('+8', lambda n: 8), ('-8', lambda n: -8), ('alt', lambda n: 8 if depth[n] == 1 else -8), ('alt2', lambda n: -8 if depth[n] == 1 else 8)]:
            ang = {n: f(n) for n in names}
            G = {}
            u = assemble(fig, view, size, ang, glob_out=G)[..., 3] > 0.5
            hm = ndi.binary_fill_holes(u) & ~u
            for n in names:
                par = by[n]['parent']
                c0, c1 = (view @ G[par] @ np.array([*c, 1.0]) for c in fig['cuts'][n])
                x0, y0 = int(min(c0[0], c1[0])) - 40, int(min(c0[1], c1[1])) - 40
                x1, y1 = int(max(c0[0], c1[0])) + 41, int(max(c0[1], c1[1])) + 41
                sub = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], float) @ view
                bs = (x1 - x0, y1 - y0)
                need = assemble(fig, sub, bs, ang, key='ideal', only={par})[..., 3]
                for k in range(7):
                    a2 = dict(ang); a2[n] = ang[n] * k / 6
                    need = np.maximum(need, assemble(fig, sub, bs, a2, key='ideal', only={n})[..., 3])
                band = np.zeros((bs[1], bs[0]), np.uint8)
                cv2.line(band, (int(c0[0]) - x0, int(c0[1]) - y0), (int(c1[0]) - x0, int(c1[1]) - y0), 1, 51)
                need = cv2.erode((need > 0.5).astype(np.uint8), disk(3)).astype(bool) & band.astype(bool)
                hm[y0:y1, x0:x1] |= need & ~u[y0:y1, x0:x1]
            lab, nl = ndi.label(hm)
            big = int(ndi.sum(hm, lab, range(1, nl + 1)).max()) if nl else 0
            worst = max(worst, big)
            if shots and big > 6:
                Path(shots).mkdir(parents=True, exist_ok=True)
                Image.fromarray(np.dstack([u * 120, hm * 255, hm * 255]).astype(np.uint8)).save(Path(shots) / f'holes-{who}-{case}.png')
                print('holes', who, case, [(int(c[1].start) - pad, int(c[0].start) - pad, int(ndi.sum(hm, lab, i + 1))) for i, c in enumerate(ndi.find_objects(lab)) if ndi.sum(hm, lab, i + 1) > 6])
        holes[who] = worst
        assert worst <= 6, f'{who}: hole of {worst} px^2 at a joint with +-8 deg'
    # 4. the two bodies only meet at the hands in the clasp arrangement
    yy, xx = np.nonzero(both)
    reach = float(np.hypot(xx - hx, yy - hy).max()) if len(xx) else 0.0
    assert reach <= 40, f'bodies overlap away from the hands ({reach:.0f} px from the hand point)'
    # 5. weight
    assert total < 400_000, f'astronaut parts are {total} bytes'

    print(f"left  box {L['W']}x{L['H']} rot {L['rot']:.1f}  right box {R['W']}x{R['H']} rot {R['rot']:.1f}")
    print('clasp', rig['clasp'], ' smokeRect', sr, ' chest', rig['left']['chest'])
    print(f'part bytes {total}  smoke-pink {(ASSET / "smoke-pink.webp").stat().st_size} bytes  avg #%02x%02x%02x' % tuple(int(v) for v in avg))
    print(f'worst joint hole px^2 {holes}  contact overlap radius {reach:.1f} px')
    print('OK astronauts')


# ------------------------------------------------------------------ contact sheets (review only)
BG = (3, 4, 10)


def flat(acc):
    a = acc.copy(); bg = np.array(BG, np.float32) / 255
    return to_u8(np.dstack([a[..., :3] + bg * (1 - a[..., 3:]), np.ones_like(a[..., :1])]))


def contact_sheets(figs, rig, out, clasp):
    out.mkdir(parents=True, exist_ok=True)
    for who, fig in figs.items():
        pad = int(0.18 * max(fig['W'], fig['H']))
        size = (fig['W'] + 2 * pad, fig['H'] + 2 * pad)
        view = np.array([[1, 0, pad], [0, 1, pad], [0, 0, 1]], float)
        names = [p['name'] for p in fig['parts'] if p['parent']]
        row = []
        for ang in (0, 8, -8):
            img = flat(assemble(fig, view, size, {n: ang for n in names}))
            cv2.putText(img, f'{who} {ang:+d} deg', (30, 70), cv2.FONT_HERSHEY_SIMPLEX, 2, (200, 200, 220), 3)
            row.append(img)
            if ang == 0:
                Image.fromarray(img).save(out / f'{who}-rest.png')
                # cut map
                own = fig['own']; rng = np.random.default_rng(3); cols = rng.integers(60, 255, (len(fig['parts']), 3))
                cm = np.zeros(own.shape + (3,), np.uint8); cm[own >= 0] = cols[own[own >= 0]]
                for p in fig['parts']:
                    cv2.circle(cm, tuple(int(v) for v in p['pivot']), 10, (255, 255, 255), -1)
                Image.fromarray(cm).save(out / f'{who}-cuts.png')
        h = max(r.shape[0] for r in row)
        row = [np.pad(r, ((0, h - r.shape[0]), (0, 0), (0, 0))) for r in row]
        sheet = np.hstack(row)
        Image.fromarray(sheet).resize((sheet.shape[1] // 3, sheet.shape[0] // 3), Image.LANCZOS).save(out / f'{who}-pose.png')
    al, ar, (hx, hy) = clasp
    both = ar + al * (1 - ar[..., 3:])
    img = flat(both)
    Image.fromarray(img).resize((img.shape[1] // 3, img.shape[0] // 3), Image.LANCZOS).save(out / 'clasp.png')
    hx, hy = int(hx), int(hy)
    Image.fromarray(img[hy - 220:hy + 220, hx - 350:hx + 350]).save(out / 'clasp-hands-1to1.png')
    # 4x edge zoom: left helmet top, right glove fingers
    for who, fig in figs.items():
        rest = flat(assemble(fig, np.eye(3), (fig['W'], fig['H'])))
        a = fig['alpha'] > 0.5
        e = cv2.morphologyEx(a.astype(np.uint8), cv2.MORPH_GRADIENT, disk(1))
        ys, xs = np.nonzero(e)
        k = np.argmin(ys) if who == 'left' else np.argmax(xs)
        cx, cy = int(xs[k]), int(ys[k])
        crop = rest[max(cy - 60, 0):cy + 60, max(cx - 100, 0):cx + 100]
        Image.fromarray(cv2.resize(crop, None, fx=4, fy=4, interpolation=cv2.INTER_NEAREST)).save(out / f'{who}-edge-4x.png')
        # the reaching hand
        tx, ty = (int(v) for v in fig['tip'])
        crop = rest[max(ty - 70, 0):ty + 70, max(tx - 110, 0):tx + 110]
        Image.fromarray(cv2.resize(crop, None, fx=4, fy=4, interpolation=cv2.INTER_NEAREST)).save(out / f'{who}-hand-4x.png')
    # one contact sheet: (a)+(c) rest and +-8 deg per figure, (b) clasp, (d) 4x edges, 1:1 hand contact
    names = ['left-pose', 'right-pose', 'clasp', 'left-edge-4x', 'right-edge-4x', 'left-hand-4x', 'right-hand-4x', 'clasp-hands-1to1']
    ims = [Image.open(out / f'{n}.png').convert('RGB') for n in names]
    W = 2400
    rows = [ims[0], ims[1], ims[2], ims[3:5], ims[5:7], [ims[7]]]
    tiles = []
    for r in rows:
        r = r if isinstance(r, list) else [r]
        w = W // len(r)
        rs = [np.array(i.resize((w, max(1, round(i.height * w / i.width))), Image.LANCZOS)) for i in r]
        h = max(x.shape[0] for x in rs)
        tiles.append(np.hstack([np.pad(x, ((0, h - x.shape[0]), (0, 0), (0, 0))) for x in rs]))
    Image.fromarray(np.vstack([np.pad(t, ((0, 16), (0, W - t.shape[1]), (0, 0))) for t in tiles])).save(out / 'contact-sheet.png')


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] != 'astronauts':
        sys.exit(__doc__)
    shots = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
    astronauts(shots)
