import json, sys, numpy as np, re
ASP=float(sys.argv[1])
from PIL import Image, ImageDraw
d=json.load(open('/home/claude/rebirth-origin/src/components/space/dog.json'))
VB=d['viewBox']; S=4
im=Image.new('L',(VB[2]*S,VB[3]*S),0); dr=ImageDraw.Draw(im)
for sub in re.findall(r'M([^Z]+)Z',d['silhouette']):
    n=list(map(float,sub.split())); pts=[((n[i]-VB[0])*S,(n[i+1]-VB[1])*S) for i in range(0,len(n),2)]
    dr.polygon(pts,fill=255)
# holes: draw interiors as 0 (2nd+ subpaths are holes)
subs=re.findall(r'M([^Z]+)Z',d['silhouette'])
im=Image.new('L',(VB[2]*S,VB[3]*S),0); dr=ImageDraw.Draw(im)
for k,sub in enumerate(subs):
    n=list(map(float,sub.split())); pts=[((n[i]-VB[0])*S,(n[i+1]-VB[1])*S) for i in range(0,len(n),2)]
    dr.polygon(pts,fill=0 if k else 255)
m=np.array(im)>0
from scipy.ndimage import distance_transform_edt
best=(0,None)
for asp in [ASP]:
    H,W=m.shape
    # integral image for rectangle test
    ii=np.pad(m.astype(np.int32).cumsum(0).cumsum(1),((1,0),(1,0)))
    def full(x0,y0,x1,y1): return ii[y1,x1]-ii[y0,x1]-ii[y1,x0]+ii[y0,x0]==(x1-x0)*(y1-y0)
    pts=[(int(0.4182*W),int(0.4141*H))] if len(sys.argv)>2 else [(x,y) for y in range(0,H,8) for x in range(0,W,8)]
    for cx,cy in pts:
        if True:
            if not m[cy,cx]: continue
            lo,hi=0,W
            while hi-lo>2:
                mid=(lo+hi)//2; hw=mid//2; hh=int(mid/asp)//2
                x0,x1,y0,y1=cx-hw,cx+hw,cy-hh,cy+hh
                if x0<0 or y0<0 or x1>W or y1>H or not full(x0,y0,x1,y1): hi=mid
                else: lo=mid
            if lo>best[0]: best=(lo,(cx,cy))
w,(cx,cy)=best
print('rect width (viewBox units)',w/S,'centre vb',cx/S+VB[0],cy/S+VB[1],'pct',round(cx/W*100,2),round(cy/H*100,2),'cover factor',VB[2]/(w/S))
