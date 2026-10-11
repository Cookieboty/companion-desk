#!/usr/bin/env bash
# Copy sample VRMs into assets/models from the monorepo / companion-desk-models checkout.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DEST="$(cd "$(dirname "$0")/../assets/models" && pwd)"
mkdir -p "$DEST"

copy() {
  local src="$1" dst="$2"
  if [[ -f "$src" ]]; then
    cp -f "$src" "$DEST/$dst"
    echo "  ✔ $dst ($(du -h "$DEST/$dst" | cut -f1))"
  else
    echo "  ✖ missing $src"
    return 1
  fi
}

echo "Fetching spike VRMs → $DEST"
ok=0
copy "$ROOT/packages/renderer/public/assets/models/vrm/default-character.vrm" "shibu-vrm0.vrm" && ok=$((ok+1)) || true
# Darkness Shibu / Shapell from sibling models repo if present
MODELS="${COMPANION_MODELS_DIR:-$ROOT/../companion-desk-models}"
copy "$MODELS/models/darkness-shibu/model.vrm" "darkness-shibu-vrm0.vrm" && ok=$((ok+1)) || true
copy "$MODELS/models/shapell/model.vrm" "shapell-vrm1.vrm" && ok=$((ok+1)) || true
echo "Copied $ok model(s)."
