# Large soft smoke texture centred on the left figure's chest point -> smoke-pink.webp
import numpy as np, cv2, json
from PIL import Image
full=np.array(Image.open('out/left-full.png')).astype(np.float32)
meta=json.load(open('/home/claude/rebirth-origin/src/components/space/rig.json'))['left']
W,H=meta['width'],meta['height']; cx=meta['chest'][0]/100*W; cy=meta['chest'][1]/100*H
a=full[...,3]
best=None
for w in range(1200,100,-8):
    h=int(w/1.6); x0=int(cx-w/2); y0=int(cy-h/2)
    if x0<0 or y0<0 or x0+w>W or y0+h>H: continue
    if a[y0:y0+h,x0:x0+w].min()>250: best=(x0,y0,w,h); break
x0,y0,w,h=best
print('window',best,'= %.2f%% of box width'%(w/W*100))
crop=full[y0:y0+h,x0:x0+w,:3]
OW,OH=2560,1600
crop=cv2.bilateralFilter(crop.astype(np.uint8),9,30,5).astype(np.float32)
big=cv2.resize(crop,(OW,OH),interpolation=cv2.INTER_CUBIC)
big=cv2.GaussianBlur(big,(0,0),6)
rng=np.random.default_rng(7)
n=np.zeros((OH,OW),np.float32)
for sc,amp in [(320,0.035),(140,0.02)]:
    z=rng.standard_normal((OH//sc+2,OW//sc+2)).astype(np.float32)
    n+=cv2.resize(z,(OW,OH),interpolation=cv2.INTER_CUBIC)*amp
big=np.clip(big*(1+n[...,None]),0,255).astype(np.uint8)
Image.fromarray(big).save('/home/claude/rebirth-origin/src/assets/space/smoke-pink.webp',quality=74,method=6)
avg=big.reshape(-1,3).mean(0); print('avg #%02x%02x%02x'%tuple(int(v) for v in avg))
json.dump(dict(window_px=best,window_pct_of_box=[round(x0/W*100,2),round(y0/H*100,2),round(w/W*100,2),round(h/H*100,2)],avg='#%02x%02x%02x'%tuple(int(v) for v in avg)),open('smoke-meta.json','w'))
Image.fromarray(big).resize((640,400)).save('smoke-prev.png')
