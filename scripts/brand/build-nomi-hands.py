#!/usr/bin/env python3
"""Cut the AI-generated hand/forearm art (white background) into transparent hand pieces.

Only NON-brand art (hands + cuff). Usage:
  python3 scripts/brand/build-nomi-hands.py <dir with wave/fist/thumbsup/point/rest/peace.jpg> <out dir>
Writes hand-<name>.png and hands.json (metadata merged into manifest.json rig.hands by the arm build step).
"""
import numpy as np, cv2, sys, json
from PIL import Image
SRC=sys.argv[1].rstrip('/')+'/'; OUT=sys.argv[2].rstrip('/')+'/'
NAMES=['wave','fist','thumbsup','point','rest','peace']
SKIN_T=np.array([252,225,210],np.float32); SKIN_S=np.array([6,9,10],np.float32)
SLV_T=np.array([248,237,231],np.float32);  SLV_S=np.array([9,13,15],np.float32)

def fg_mask(rgb):
    h,w=rgb.shape[:2]
    mn=rgb.min(2)
    nearwhite=(mn>=238).astype(np.uint8)
    n,lab=cv2.connectedComponents(nearwhite)
    seeds=set()
    for x in list(range(0,120))+list(range(w-120,w)):
        seeds.add(lab[h-1,x]); 
    for x in range(0,w,4): seeds.add(lab[0,x])
    for y in range(0,h,4): seeds.add(lab[y,0]); seeds.add(lab[y,w-1])
    seeds.discard(0)
    bg=np.isin(lab,list(seeds))&(nearwhite>0)
    return ~bg
def run(name):
    im=np.array(Image.open(SRC+name+'.jpg').convert('RGB')).astype(np.float32)
    h,w=im.shape[:2]
    fg=fg_mask(im.astype(np.uint8))
    fg=fg.astype(np.uint8)
    # drop speckles, fill holes
    n,lab,st,_=cv2.connectedComponentsWithStats(fg)
    big=1+np.argmax(st[1:,4]); fg=(lab==big).astype(np.uint8)
    ff=fg.copy(); cv2.floodFill(ff,None,(0,0),2); fg[ff==0]=1
    # soft alpha
    a=cv2.GaussianBlur(fg.astype(np.float32),(0,0),0.9)
    a=np.clip((a-0.5)*1.6+0.5,0,1)
    # defringe: replace colour at the boundary ring with inpainted interior colour
    core=cv2.erode(fg,np.ones((5,5),np.uint8))
    ring=((fg>0)&(core==0)).astype(np.uint8)*255
    rgb=cv2.inpaint(im.astype(np.uint8),ring,3,cv2.INPAINT_TELEA).astype(np.float32)
    # classify
    hsv=cv2.cvtColor(rgb.astype(np.uint8),cv2.COLOR_RGB2HSV).astype(np.float32)
    skin=(hsv[...,0]>=3)&(hsv[...,0]<=24)&(hsv[...,1]>=22)&(hsv[...,2]>=180)&(fg>0)
    skin=cv2.morphologyEx(skin.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))>0
    sleeve=(hsv[...,1]<40)&(hsv[...,2]>=205)&(fg>0)&~skin
    # colour transfer (per-region mean/std match, clamped)
    def xfer(mask,tm,ts):
        px=rgb[mask]
        if len(px)<50: return
        m=px.mean(0); s=px.std(0)+1e-3
        k=np.clip(ts/s,0.7,1.5)
        rgb[mask]=np.clip((px-m)*k+tm,0,255)
    xfer(skin,SKIN_T,SKIN_S*1.3)
    xfer(sleeve,SLV_T,SLV_S*1.2)
    dark=(fg>0)&~skin&~sleeve&(hsv[...,2]<200)
    rgb[dark]=np.clip(rgb[dark]*np.array([1.0,0.88,0.84])*0.92,0,255)   # outlines → warm brown like the master
    # geometry
    ys,xs=np.nonzero(fg)
    skin_rows=np.nonzero(skin.any(1))[0]
    cuffY=int(skin_rows.max())
    top=int(ys.min()); x0=int(xs.min()); x1=int(xs.max())+1
    bottom=min(h,cuffY+230)
    rgba=np.dstack([rgb,a*255]).astype(np.float32)
    # hard bottom edge (2px AA): the mesh sleeve is tapered to this sleeve's width, drawn over
    # runs underneath, so the join reads as continuous cloth (no long washed-out fade)
    yy=np.arange(h)[:,None]
    fe=np.clip((bottom-yy)/2.0,0,1); fe=fe*fe*(3-2*fe)
    rgba[...,3]*=fe
    crop=rgba[top:bottom,x0:x1]
    # centre of the sleeve at the bottom row (attach point)
    row=fg[max(top,bottom-100)]
    cx=np.nonzero(row)[0]
    # sleeve width at the bottom (for scaling)
    wr=np.nonzero(fg[bottom-60])[0]
    info=dict(file=f'hand-{name}.png',w=int(crop.shape[1]),h=int(crop.shape[0]),ax=float((wr.min()+wr.max())/2-x0),ay=float(crop.shape[0]),sleeveW=float(wr.max()-wr.min()),cuffY=float(cuffY-top),
              skinTop=0.0)
    arr=crop.astype(np.uint8); arr[arr[...,3]<3]=0
    Image.fromarray(arr,'RGBA').save(OUT+f'hand-{name}.png',optimize=True)
    return info
import os; os.makedirs(OUT,exist_ok=True)
info={n:run(n) for n in NAMES}
json.dump(info,open(OUT+'hands.json','w'),indent=1)
print(json.dumps(info))
