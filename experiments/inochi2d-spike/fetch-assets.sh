#!/usr/bin/env bash
# 拉取 spike 依赖（不入库）：inochi-avatar（BSD-2，Inox2D WASM 构建）+ Arch-chan 模型（CC0）
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p vendor model
tmp=$(mktemp -d)
(cd "$tmp" && npm pack inochi-avatar@1.0.1 >/dev/null && tar xzf inochi-avatar-*.tgz)
cp "$tmp/package/dist/inochi_fox_demo.js" "$tmp/package/dist/inochi_fox_demo_bg.wasm" vendor/
git clone -q --depth 1 https://github.com/Speykious/arch-chan "$tmp/arch-chan"
cp "$tmp/arch-chan/Inochi2D/Arch Chan Model.inp" model/arch-chan.inp
cp "$tmp/arch-chan/LICENSE.md" model/LICENSE-arch-chan-CC0.md
rm -rf "$tmp"
