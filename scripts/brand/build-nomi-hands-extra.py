#!/usr/bin/env python3
"""Cut the AI-generated prayer / OK / chest hand art (white bg, 1280x720 JPG) into hand pieces.

NON-brand art (hands + cuff). Follows the conventions of build-nomi-hands.py: forearm vertical,
hand up, sleeve stub below (1.3 x sleeve width) with a bottom fade, ax = sleeve centre, ay = piece
height, sleeveW = sleeve width, cuffY = lowest skin row.  Per-shape: rotation that makes the
forearm vertical, a clean see-through OK ring, a smoothed cuff silhouette for the chest hand and a
synthetic flat sleeve stub.  Skin is mean-shifted to Nomi's tone (#F8DED0).

Usage: python3 scripts/brand/build-nomi-hands-extra.py <dir with prayer/ok/chest.jpg> <out dir>
Writes hand-<name>.png and hands.json (merge into manifest.json rig.hands; prayer also gets k=1.2).
"""
import sys
SRC=sys.argv[1].rstrip('/')+'/'; OUT=sys.argv[2].rstrip('/')
import numpy as np, cv2, json, os
from PIL import Image
STRICT=False
def fg_mask(rgb):
    h,w=rgb.shape[:2]; mn=rgb.min(2)
    nearwhite=(mn>=238).astype(np.uint8)
    if STRICT:
        mx=rgb.max(2).astype(int); nearwhite=((mn>=252)&(mx-mn<=2)).astype(np.uint8)
    n,lab=cv2.connectedComponents(nearwhite)
    seeds=set()
    for x in list(range(0,120))+list(range(w-120,w)): seeds.add(lab[h-1,x])
    for x in range(0,w,4): seeds.add(lab[0,x])
    for y in range(0,h,4): seeds.add(lab[y,0]); seeds.add(lab[y,w-1])
    seeds.discard(0)
    bg=np.isin(lab,list(seeds))&(nearwhite>0)
    return ~bg
def cut(name,hole_ymax=0,hull_box=None):
    global STRICT
    im=np.array(Image.open(SRC+name+'.jpg').convert('RGB'))
    fg=fg_mask(im).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(fg)
    big=1+np.argmax(st[1:,4]); fg=(lab==big).astype(np.uint8)
    ff=fg.copy(); cv2.floodFill(ff,None,(0,0),2); fg[ff==0]=1
    if STRICT:
        hsv=cv2.cvtColor(im,cv2.COLOR_RGB2HSV)
        STRICT=False
        loose=fg_mask(im).astype(np.uint8)
        n3,l3,st3,_=cv2.connectedComponentsWithStats(loose); b3=1+np.argmax(st3[1:,4]); loose=(l3==b3).astype(np.uint8)
        ff3=loose.copy(); cv2.floodFill(ff3,None,(0,0),2); loose[ff3==0]=1
        STRICT=True
        low=((hsv[...,1]<28)&(fg>0)).astype(np.uint8)
        low=cv2.morphologyEx(low,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)))
        zone=cv2.dilate(low,np.ones((7,7),np.uint8))>0
        sm=(cv2.medianBlur(fg*255,13)>127).astype(np.uint8)
        sm=(cv2.GaussianBlur(sm.astype(np.float32),(0,0),2.0)>0.5).astype(np.uint8)
        fg=np.where(zone,sm,loose).astype(np.uint8)
        n2,l2,st2,_=cv2.connectedComponentsWithStats(fg); b2=1+np.argmax(st2[1:,4]); fg=(l2==b2).astype(np.uint8)
    if hull_box:
        x0,y0,x1,y1=hull_box
        pts=cv2.findNonZero(fg); hull=cv2.convexHull(pts)
        hm=np.zeros_like(fg); cv2.fillConvexPoly(hm,hull,1)
        bx=np.zeros_like(fg); bx[y0:y1,x0:x1]=1
        fg=(fg|(hm&bx)).astype(np.uint8)
    if hole_ymax:
        # see-through holes (e.g. OK ring): enclosed pure-white regions above the wrist
        pw=(im.min(2)>=244).astype(np.uint8)
        nn,lb,stt,cen=cv2.connectedComponentsWithStats(pw)
        for i in range(1,nn):
            if 300<stt[i,4]<40000 and cen[i][1]<hole_ymax:
                fg[lb==i]=0
    # colour fringe: min-filter colours in a thin band around the boundary
    k=np.ones((3,3),np.uint8)
    band=(cv2.dilate(fg,k,iterations=2)>0)&(cv2.erode(fg,k,iterations=2)==0)
    mn=cv2.erode(im,k,iterations=1)
    rgb=im.copy(); rgb[band]=mn[band]
    # outside fg: smear nearest colour outward so rotation/scale interpolation can't pull white in
    out=(fg==0)
    rgb2=cv2.inpaint(rgb,(out&(cv2.dilate(fg,k,iterations=12)>0)).astype(np.uint8)*255,3,cv2.INPAINT_TELEA)
    return rgb2,fg
def hsvmasks(rgb,fg):
    hsv=cv2.cvtColor(rgb,cv2.COLOR_RGB2HSV).astype(np.float32)
    skin=(hsv[...,0]>=3)&(hsv[...,0]<=24)&(hsv[...,1]>=22)&(hsv[...,2]>=180)&(fg>0)
    skin=cv2.morphologyEx(skin.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))>0
    return skin
def build(name,ang,cut_frac,resize,sleeve_target,ext_extra,fade_k=0.5,hole_ymax=0,hull_box=None):
    rgb,fg=cut(name,hole_ymax,hull_box)
    h,w=fg.shape
    pad=300
    rgbp=cv2.copyMakeBorder(rgb,pad,pad,pad,pad,cv2.BORDER_REPLICATE)
    fgp=cv2.copyMakeBorder(fg*255,pad,pad,pad,pad,cv2.BORDER_CONSTANT,value=0)
    H,W=fgp.shape
    M=cv2.getRotationMatrix2D((W/2,H/2),ang,1.0)
    rr=cv2.warpAffine(rgbp,M,(W,H),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
    ra=cv2.warpAffine(fgp,M,(W,H),flags=cv2.INTER_CUBIC,borderValue=0).astype(np.float32)/255
    m=ra>0.5
    ys,xs=np.nonzero(m); top=ys.min(); x0=xs.min(); x1=xs.max()+1; bot=ys.max()+1
    skin=hsvmasks(rr,m.astype(np.uint8))
    sk_rows=np.nonzero(skin.any(1))[0]; cuffY=sk_rows.max()
    # cut row: fraction between cuffY and bottom where sleeve is full width
    yc=int(cuffY+(bot-cuffY)*cut_frac)
    return dict(rr=rr,ra=ra,top=top,x0=x0,x1=x1,yc=yc,cuffY=cuffY,bot=bot,skin=skin)

SKIN_T=np.array([248,222,208],np.float32)
def make(name,ang,cut_frac,sleeve_final,stub_k=1.3,fade_k=0.5,out=OUT,hole_ymax=0,blur=0,hull_box=None,strict=False):
    global STRICT; STRICT=strict
    d=build(name,ang,cut_frac,1,1,0,hole_ymax=hole_ymax,hull_box=hull_box)
    rr,ra,top,x0,x1,yc,cuffY=d['rr'],d['ra'],d['top'],d['x0'],d['x1'],d['yc'],d['cuffY']
    m=ra>0.5
    # measured sleeve width at cut row
    cols=np.nonzero(m[yc])[0]; sw=cols.max()-cols.min()+1; cx=(cols.max()+cols.min())/2
    r=sleeve_final/sw
    # crop with margin
    mg=4
    X0=max(0,x0-mg); X1=x1+mg
    crop=rr[top-mg:yc+1,X0:X1].astype(np.float32); al=ra[top-mg:yc+1,X0:X1].copy()
    # skin tone: mean shift toward Nomi skin (skin pixels only, partial strength)
    sk=d['skin'][top-mg:yc+1,X0:X1]
    mean=crop[sk].mean(0); shift=(SKIN_T-mean)
    # apply shift weighted by "skin-ness" (smooth), leave dark outlines
    w=cv2.GaussianBlur(sk.astype(np.float32),(0,0),1.2)[...,None]
    crop=np.clip(crop+shift*w,0,255)
    # extend stub below the cut row: repeat last row, length so stub (cuffY->bottom) = stub_k*sleeve
    stub_src=int(round(stub_k*sw))
    have=yc-cuffY
    ext=max(0,stub_src-have)
    last=crop[-1:].copy(); lasta=al[-1:].copy()
    # clean edge band for the synthetic sleeve: contiguous alpha between the outer edges, no speckle
    ii=np.nonzero(lasta[0]>0.5)[0]; E0,E1=ii.min(),ii.max()
    lasta[0]=0; lasta[0,E0:E1+1]=1.0
    lasta[0,E0]=0.7; lasta[0,E1]=0.7
    for k in range(3): last[0,E0+k]=last[0,E0+3]
    if blur:
        # flatten folds/lines in the synthetic sleeve, keep the 5px edge columns crisp, cross-fade in
        inside=(lasta[0]>0.9)
        idx=np.nonzero(inside)[0]; e0,e1=idx.min(),idx.max()
        rowb=last[0].copy()
        seg=crop[-6:,e0+6:e1-5].mean(0)           # (n,3)
        seg=cv2.GaussianBlur(seg[None],(0,0),blur)[0]
        rowb[e0+6:e1-5]=seg
        t=np.clip(np.arange(ext)/40.0,0,1)[:,None,None]
        extrgb=(last[0][None]*(1-t)+rowb[None]*t)
        crop=np.vstack([crop,extrgb]); al=np.vstack([al,np.repeat(lasta,ext,0)])
    else:
        crop=np.vstack([crop,np.repeat(last,ext,0)]); al=np.vstack([al,np.repeat(lasta,ext,0)])
    # resize
    H0,W0=al.shape
    nw,nh=int(round(W0*r)),int(round(H0*r))
    crop=cv2.resize(crop,(nw,nh),interpolation=cv2.INTER_AREA); al=cv2.resize(al,(nw,nh),interpolation=cv2.INTER_AREA)
    # alpha edge: slight sharpen
    al=np.clip((al-0.5)*1.5+0.5,0,1)
    # bottom fade (fade_k * sleeve)
    FL=fade_k*sleeve_final; yy=np.arange(nh)[:,None]
    fe=np.clip((nh-yy)/FL,0,1); fe=fe*fe*(3-2*fe)
    a_f=al*fe
    rgba=np.dstack([crop,a_f*255]).astype(np.uint8); rgba[rgba[...,3]<3]=0
    Image.fromarray(rgba,'RGBA').save(f'{out}/hand-{name}.png',optimize=True)
    # meta
    cy=(cuffY-(top-mg))*r
    row=al[int(nh-0.55*FL)] if int(nh-0.55*FL)<nh else al[-1]
    cc=np.nonzero(row>0.5)[0]
    info=dict(file=f'hands/hand-{name}.png',w=nw,h=nh,ax=float((cc.min()+cc.max())/2),ay=float(nh),sleeveW=float(cc.max()-cc.min()+1),cuffY=float(cy))
    return info
if __name__=='__main__':
    os.makedirs(OUT,exist_ok=True)
    cfg={'ok':(-15,0.5,185,dict(hole_ymax=600)),'chest':(52,0.66,185,dict(blur=14,strict=True)),'prayer':(0,0.5,185,{})}
    info={}
    for n,(a,cf,sf,kw) in cfg.items(): info[n]=make(n,a,cf,sf,**kw); print(n,info[n])
    json.dump(info,open(OUT+'/hands.json','w'),indent=1)
