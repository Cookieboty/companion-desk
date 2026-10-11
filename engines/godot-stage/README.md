# Godot Stage (sidecar spike)

Minimal Godot 4.x + [godot-vrm](https://github.com/V-Sekai/godot-vrm) stage for Companion Desk.

See `docs/plans/godot-sidecar.md` for FPS comparison and findings.

## Setup

```bash
# Godot 4.3+ on PATH (spike tested with 4.7.2)
./scripts/fetch-models.sh   # copies Shibu VRM0 + Shapell VRM1 into assets/models/
godot --path . --import      # import once
```

## Run

```bash
godot --path . -- --model=res://assets/models/shibu-vrm0.vrm
godot --path . -- --model=res://assets/models/shapell-vrm1.vrm --anim=wave
godot --path . -- --model=res://assets/models/shapell-vrm1.vrm \
  --bench-seconds=10 --bench-out=./bench/results/godot-shapell.json --no-bridge
```

## Bridge (TCP JSON-lines, default port 8765)

```bash
# In another terminal, while Godot is running:
node scripts/bridge-client.mjs '{"cmd":"ping"}' '{"cmd":"play","name":"wave"}'
printf '%s\n' '{"cmd":"lookAt","x":0.4,"y":1.5,"z":1.0}' | nc 127.0.0.1 8765
```

Commands: `load`, `play`, `lookAt`, `status`, `ping`.

## three-vrm comparison harness

```bash
# from monorepo root (Playwright Chromium required)
node engines/three-bench/run.mjs --model=shibu --seconds=8
node engines/three-bench/run.mjs --model=shapell --seconds=8
```
