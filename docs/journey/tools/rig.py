# Separate, clean, upscale and rig the two smoke figures.  python3 rig.py
import json, numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
SRC='/home/claude/rebirth-origin/src/assets/space/source-figures.webp'
ASSET='/home/claude/rebirth-origin/src/assets/space/'
COMP='/home/claude/rebirth-origin/src/components/space/'
S=3.0   # upscale factor
CUT=722 # x where the clasped hands are split
im=np.array(Image.open(SRC).convert('RGBA'))
rgb=im[...,:3].astype(np.float32); A=im[...,3]>127
lab,n=ndi.label(A)
sizes=ndi.sum(A,lab,range(1,n+1)); main=lab==(np.argmax(sizes)+1)
foot=lab==lab[430,100]                    # detached foot of the left figure's upper leg
H,W=A.shape; yy,xx=np.mgrid[0:H,0:W]
masks={'left':(main&(xx<CUT+5))|foot, 'right':main&(xx>=CUT-5)}  # 5px overlap so the clasped hands have no seam

# ---------- rigs (source px). bones: list of (a,b); r = radius bias (bigger = grabs more) ----------
RIGS={
 'left':{
  'pad':14,
  'parts':[
   # name, parent, pivot, bones, bias, z
   ('torso',None,(520,250),[((640,150),(560,190)),((560,190),(470,290)),((600,230),(520,180)),((660,150),(600,120))],38,2),
   ('arm-back','torso',(492,138),[((492,138),(335,92))],0,1),
   ('arm-reach-upper','torso',(598,250),[((598,250),(660,325))],4,4),
   ('arm-reach-lower','arm-reach-upper',(660,326),[((660,326),(728,388))],4,5),
   ('leg-a-upper','torso',(452,282),[((452,282),(300,365))],6,0),
   ('leg-a-lower','leg-a-upper',(300,366),[((300,366),(95,440))],6,0),
   ('leg-b-upper','torso',(478,336),[((478,336),(392,430))],8,1),
   ('leg-b-lower','leg-b-upper',(392,430),[((392,430),(255,545))],6,1),
  ],
  'chest':(537,176),'hand':(728,388),'head':(645,145),'neck':(590,180),
 },
 'right':{
  'pad':14,
  'parts':[
   ('torso',None,(930,400),[((830,245),(865,300)),((880,300),(950,460)),((930,260),(990,350))],38,2),
   ('arm-reach-upper','torso',(862,345),[((862,345),(792,368))],4,4),
   ('arm-reach-lower','arm-reach-upper',(792,368),[((792,368),(724,384))],4,5),
   ('arm-other','torso',(885,410),[((885,410),(785,450))],2,3),
   ('legs-upper','torso',(945,470),[((945,470),(935,590))],10,1),
   ('shin-a','legs-upper',(950,590),[((950,590),(1125,615))],6,0),
   ('shin-b','legs-upper',(940,605),[((940,605),(1060,718))],6,1),
  ],
  'chest':(905,330),'hand':(724,384),'head':(820,240),'neck':(860,295),
 },
}

def segdist(px,py,a,b):
    ax,ay=a; bx,by=b; dx,dy=bx-ax,by-ay; L=dx*dx+dy*dy
    t=np.clip(((px-ax)*dx+(py-ay)*dy)/L,0,1)
    return np.hypot(px-(ax+t*dx),py-(ay+t*dy))

def fill_colours(rgb,mask):
    # push colours outward from the mask so resampling never pulls in black fringe
    idx=ndi.distance_transform_edt(~mask,return_distances=False,return_indices=True)
    return rgb[idx[0],idx[1]]

def smooth_alpha(mask_up,sig):
    a=cv2.GaussianBlur(mask_up.astype(np.float32),(0,0),sig)
    a=np.clip((a-0.08)/0.72,0,1); return a*a*(3-2*a)

def deblock(img):
    u8=np.clip(img,0,255).astype(np.uint8)
    out=cv2.bilateralFilter(u8,int(4.5*S)|1,22,2*S)
    out=cv2.bilateralFilter(out,int(3.5*S)|1,14,1.5*S)
    # gentle unsharp to keep the smoke folds
    bl=cv2.GaussianBlur(out.astype(np.float32),(0,0),1.1*S)
    return np.clip(out+0.35*(out-bl),0,255)

meta={}
for who,M in masks.items():
    R=RIGS[who]; pad=R['pad']
    ys,xs=np.nonzero(M); x0,y0=xs.min()-pad,ys.min()-pad; x1,y1=xs.max()+pad+1,ys.max()+pad+1
    x0=max(x0,0); y0=max(y0,0)
    m=M[y0:y1,x0:x1]; c=fill_colours(rgb[y0:y1,x0:x1],m)
    h,w=m.shape; W2,H2=int(round(w*S)),int(round(h*S))
    up=cv2.resize(c,(W2,H2),interpolation=cv2.INTER_LANCZOS4)
    up=deblock(up)
    mu=cv2.resize(m.astype(np.float32),(W2,H2),interpolation=cv2.INTER_LINEAR)>0.5
    alpha=smooth_alpha(mu,1.5*S)
    # inner smoke softness: slightly lower alpha towards the very edge already via smoothstep
    # bone assignment on the upscaled grid
    py,px=np.mgrid[0:H2,0:W2]; sx=px/S+x0; sy=py/S+y0
    parts=R['parts']; D=[]
    for (name,par,piv,bones,bias,z) in parts:
        d=np.min([segdist(sx,sy,a,b) for a,b in bones],axis=0)-bias
        D.append(d)
    D=np.array(D); own=np.argmin(D,axis=0)
    out_parts=[]
    ov=10*S  # overlap px
    for i,(name,par,piv,bones,bias,z) in enumerate(parts):
        hard=(own==i)&mu
        if par is None:
            soft=cv2.GaussianBlur(cv2.dilate(hard.astype(np.uint8),np.ones((3,3)),iterations=int(ov*0.5)).astype(np.float32),(0,0),ov*0.3)
        else:
            soft=cv2.GaussianBlur(cv2.dilate(hard.astype(np.uint8),np.ones((3,3)),iterations=int(ov)).astype(np.float32),(0,0),ov*0.45)
        soft=np.clip(soft*1.6,0,1)
        a=alpha*soft
        ys2,xs2=np.nonzero(a>0.01)
        bx0,by0,bx1,by1=xs2.min(),ys2.min(),xs2.max()+1,ys2.max()+1
        rgba=np.dstack([up[by0:by1,bx0:bx1],a[by0:by1,bx0:bx1]*255]).astype(np.uint8)
        fn=f'astronaut-{who}-{name}.webp'
        Image.fromarray(rgba[...,[0,1,2,3]],'RGBA').save(ASSET+fn,'WEBP',quality=80,method=6,alpha_quality=70)
        Image.fromarray(rgba,'RGBA').save(f'out/{who}-{name}.png')
        out_parts.append(dict(name=name,parent=par,z=z,file=fn,box=[int(bx0),int(by0),int(bx1),int(by1)],
            pivot=[(piv[0]-x0)*S,(piv[1]-y0)*S]))
    # full composite for reference
    Image.fromarray(np.dstack([up,alpha*255]).astype(np.uint8),'RGBA').save(f'out/{who}-full.png')
    toB=lambda p:[round((p[0]-x0)*S/W2*100,2),round((p[1]-y0)*S/H2*100,2)]
    hx,hy=R['head']; nx,ny=R['neck']
    meta[who]=dict(width=W2,height=H2,source_box=[int(x0),int(y0),int(x1),int(y1)],scale=S,parts=out_parts,
        chest=toB(R['chest']),hand=toB(R['hand']),
        headAngle=round(float(np.degrees(np.arctan2(hy-ny,hx-nx))),1))
    # relative layout for nested parts (percent of parent box)
    byname={p['name']:p for p in out_parts}
    for p in out_parts:
        bx0,by0,bx1,by1=p['box']; pw,ph=bx1-bx0,by1-by0
        if p['parent']:
            q=byname[p['parent']]; qx0,qy0,qx1,qy1=q['box']; qw,qh=qx1-qx0,qy1-qy0
        else:
            qx0,qy0,qw,qh=0,0,W2,H2
        p['css']=dict(left=round((bx0-qx0)/qw*100,3),top=round((by0-qy0)/qh*100,3),
                      width=round(pw/qw*100,3),height=round(ph/qh*100,3),
                      ox=round((p['pivot'][0]-bx0)/pw*100,2),oy=round((p['pivot'][1]-by0)/ph*100,2))
    # hand / chest markers relative to the part holding them
    hp=byname['arm-reach-lower']; bx0,by0,bx1,by1=hp['box']
    hxu,hyu=(R['hand'][0]-x0)*S,(R['hand'][1]-y0)*S
    meta[who]['handInPart']=[round((hxu-bx0)/(bx1-bx0)*100,2),round((hyu-by0)/(by1-by0)*100,2)]
json.dump(meta,open(COMP+'rig.json','w'),indent=1)
for k,v in meta.items(): print(k,v['width'],v['height'],v['chest'],v['hand'],v['headAngle'])
