# three-vrm FPS bench

Companion harness for `engines/godot-stage` comparisons. Serves a 1280×720 page that loads the same sample VRMs via `@pixiv/three-vrm` and writes JSON next to Godot results.

```bash
# from monorepo root
npx playwright install chromium   # once
node engines/three-bench/run.mjs --model=shibu --seconds=8
node engines/three-bench/run.mjs --model=shapell --seconds=8 --shot=/tmp/three-shapell.png
```
