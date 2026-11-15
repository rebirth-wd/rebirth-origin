# Original vector dog-in-a-space-helmet. Generates src/components/space/dog.json
import json
from shapely.geometry import Point, LineString, Polygon
from shapely.ops import unary_union
from shapely import affinity
R=48
def ell(cx,cy,rx,ry,rot=0):
    e=affinity.scale(Point(0,0).buffer(1,quad_segs=R),rx,ry); e=affinity.rotate(e,rot,origin=(0,0)); return affinity.translate(e,cx,cy)
def limb(pts,w): return LineString(pts).buffer(w/2,quad_segs=R)
def taper(pts,w0,w1):
    segs=[]; n=len(pts)
    for i in range(n-1):
        t0=i/(n-1); t1=(i+1)/(n-1)
        a=Point(pts[i]).buffer((w0+(w1-w0)*t0)/2,quad_segs=R); b=Point(pts[i+1]).buffer((w0+(w1-w0)*t1)/2,quad_segs=R)
        segs.append(unary_union([a,b]).convex_hull)
    return unary_union(segs)
def bez(p0,p1,p2,p3,n=24):
    out=[]
    for i in range(n+1):
        t=i/n; u=1-t
        out.append((u**3*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t**3*p3[0], u**3*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t**3*p3[1]))
    return out
HC=(905,232); HR=165
body=unary_union([
    ell(560,392,235,80,-4), ell(758,420,106,120,-12), ell(350,384,100,86,6),
    limb([(770,380),(862,290)],118),                         # neck
])
near_legs=unary_union([
    limb([(785,470),(792,600),(796,722)],58), ell(818,730,42,20),                     # near front leg + paw
    ell(362,436,70,96,24),                                                            # thigh
    limb([(385,500),(330,622),(352,724)],54), ell(376,730,42,20),                     # near hind: stifle, hock
])
far_legs=unary_union([
    limb([(705,480),(694,604),(690,716)],52), ell(712,724,38,18),
    limb([(450,470),(420,604),(446,714)],50), ell(470,720,38,18),
])
tail=taper(bez((255,365),(175,345),(128,285),(140,185)),44,20)
helmet=Point(HC).buffer(HR,quad_segs=R*2)
collar=affinity.rotate(Polygon([(-120,-30),(120,-30),(120,30),(-120,30)]).buffer(18,quad_segs=R),-42,origin=(0,0))
collar=affinity.translate(collar,830,370)
tank=affinity.rotate(LineString([(400,0),(650,0)]).buffer(48,quad_segs=R),-2,origin=(525,0)); tank=affinity.translate(tank,0,262)
valve=unary_union([Point(705,252).buffer(16,quad_segs=R), limb([(690,256),(708,252)],22)])
hose=limb(bez((708,250),(740,150),(690,95),(760,105)),18)
sil=unary_union([body,near_legs,far_legs,tail,helmet,collar,tank,valve,hose])
sil=sil.buffer(10,quad_segs=R).buffer(-10,quad_segs=R)   # fillet the joints
sil=sil.simplify(0.12)
assert sil.geom_type=='Polygon', sil.geom_type
def d(g,prec=1):
    gs=[g] if g.geom_type=='Polygon' else list(g.geoms)
    out=[]
    for p in gs:
        for ring in [p.exterior,*p.interiors]:
            c=list(ring.coords)[:-1]
            out.append('M'+' '.join(f'{x:.{prec}f} {y:.{prec}f}' for x,y in c)+'Z')
    return ''.join(out)
# dog head profile inside the helmet (overlay): skull, muzzle, drop ear
head=unary_union([ell(890,232,78,70), limb([(915,244),(1015,264)],62), ell(1010,258,30,26)])
head=head.buffer(8).buffer(-8).simplify(0.3)
ear=taper(bez((860,197),(815,222),(815,282),(840,322)),48,30).simplify(0.3)
VB=[100,52,990,710]
out=dict(viewBox=VB, silhouette=d(sil), farLegs=d(far_legs.difference(near_legs).buffer(-3).simplify(0.12)),
  head=d(head), ear=d(ear), tankBody=d(tank.simplify(0.12)), helmet=dict(cx=HC[0],cy=HC[1],r=HR),
  body=[41.82, 41.41], holes=len(sil.interiors))
json.dump(out,open('/home/claude/rebirth-origin/src/components/space/dog.json','w'))
print(len(out['silhouette']), 'holes', out['holes'], sil.bounds)
