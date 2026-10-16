import sys, subprocess, os
variant = sys.argv[1]; N = 6
if variant == 'raster':
    body = lambda: '<Image name="im" assetId="0:3" x="0" y="0"/>'
    assets = '<ImageAsset name="hand" file="../hand-wave.png" id="0:3"/>'
else:
    b = open(f'{variant}.body').read(); body = lambda: b; assets = ''
d = f'perf-{variant}'; os.makedirs(d, exist_ok=True)
open(f'{d}/rive.yaml','w').write(f'name: perf{variant}\nlogs:\n  file: build/rive.log\n  problems: build/problems.log\n')
nodes = ''.join(f'<Node name="w{i}" id="0:{20+i}" x="{50+i*150}" y="300" scaleX="0.5" scaleY="0.5">{body()}</Node>\n' for i in range(N))
keys = ''.join(f'<KeyedObject objectId="0:{20+i}"><KeyedProperty property="rotation"><KeyFrameDouble value="-0.3" frame="0" interpolationType="cubic"><CubicEaseInterpolator x1="0.42" y1="0" x2="0.58" y2="1"/></KeyFrameDouble><KeyFrameDouble value="0.3" frame="60" interpolationType="cubic"><CubicEaseInterpolator x1="0.42" y1="0" x2="0.58" y2="1"/></KeyFrameDouble><KeyFrameDouble value="-0.3" frame="120"/></KeyedProperty></KeyedObject>' for i in range(N))
open(f'{d}/scene.rml','w').write(f'''<Rive version="1" kind="fragment">{assets}
<Artboard name="P" width="960" height="560" styleId="0:5" id="0:2"><LayoutComponentStyle name="s" id="0:5"/>
{nodes}<LinearAnimation name="spin" id="0:9" loopValue="loop" duration="120" fps="60">{keys}</LinearAnimation>
</Artboard></Rive>''')
