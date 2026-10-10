# 看板娘模型：内置、模型商店、用户导入

Companion Desk 的角色来自三处，由主进程 `packages/electron/src/models/ModelRegistry.ts` 合并成一份列表
（角色选择器、托盘「切换角色」、AI 工具 `mascot_list_models` / `mascot_select_model` 共用）：

| 来源           | 位置                                                                          | 许可要求                                                   |
| -------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 内置 `bundled` | `packages/renderer/public/assets/models/vrm/`（只放默认角色，控制安装包体积） | 必须是允许的开源许可，CI `scripts/check-licenses.mjs` 校验 |
| 商店 `remote`  | 远程目录 → 下载到 `userData/models/remote/<id>/`                              | 必须是允许的开源许可，客户端再校验一次                     |
| 导入 `user`    | `userData/models/user/<id>/`                                                  | 用户自负；不上传、不同步、不分发                           |

允许的许可分两类（与 `assets-licenses.json` 的 `allowedLicenses` / `reviewedLicenses` 一致，单测会对比）：

- 开源许可（SPDX）：`CC0-1.0`、`CC-BY-4.0`、`CC-BY-SA-4.0`、`MIT`、`Apache-2.0`、`OFL-1.1`
- **经审核的非 OSI 许可**：只要**允许商用且允许再分发**即可放行（版权归属不影响），逐个人工审核后列入：
  - `LicenseRef-VRoid-AvatarSample` — pixiv VRoid AvatarSample 条款 <https://vroid.pixiv.help/hc/ja/articles/4402394424089>：
    可商用、可再分发、可改编、无需署名；禁止用于仇恨 / 歧视言论及反社会、违法用途
  - `LicenseRef-VRM-Public-1.0` — VRM Public License 1.0 <https://vrm.dev/licenses/1.0/>：条件因模型而异，
    目录条目必须带 `licenseTerms.conditions`（取自 VRM meta），且 `commercialUse` 与 `redistribution` 都为 `true`，否则拒绝

  这类模型在商店 / 角色列表显示黄色徽章（如「VRoid 条款」），条件摘要显示在商店条目、角色悬停提示与「致谢」页。CC-BY / CC-BY-SA 模型的 `credit` 会显示在应用的「致谢」页。

## 远程目录格式（`catalog.json`, schemaVersion 1）

目录仓库：<https://github.com/Cookieboty/companion-desk-models>，`catalog.json` 由该仓库的
`scripts/build-catalog.mjs` 从 `models/<id>/model.json` + 文件生成（CI 会 `--check`）。

```jsonc
{
  "schemaVersion": 1,
  "models": [
    {
      "id": "darkness-shibu", // [a-z0-9-]{2,64}，与内置 id 相同时远程版本覆盖内置
      "name": "Darkness Shibu",
      "author": "pixiv Inc. / VRoid Project",
      "license": "CC0-1.0", // SPDX，必须在允许列表中
      "source": "https://github.com/madjin/vrm-samples/tree/master/vroid/beta",
      "version": "1.0.0", // semver，变大时客户端提示「更新」
      "vrmVersion": "0.x",
      "tags": ["vroid"],
      // 可选 "licenseFileUrl": 作者原始许可文件（如 Shapell 的 LICENSE.txt），显示在「致谢」页
      "credit": "Darkness Shibu — VRoid Studio sample model by pixiv …",
      "vrm": {
        "urls": [
          "https://github.com/…/releases/download/…/model.vrm",
          "https://cdn.jsdelivr.net/gh/…",
          "https://raw.githubusercontent.com/…",
        ],
        "sha256": "…",
        "size": 20423112,
      },
      "thumbnail": { "urls": ["…/thumb.jpg"], "sha256": "…", "size": 17406 },
    },
  ],
}
```

URL 顺序即镜像优先级：GitHub Releases（无大小限制）→ jsDelivr（单文件 ≤ 20 MB 才列出）→ raw.githubusercontent.com。

## 客户端安全规则

- 只接受 `https://`（e2e 测试在未打包时可用 `IG_MODEL_STORE_ALLOW_LOOPBACK=1` 放行 `http://127.0.0.1`），拒绝带用户名密码的 URL，重定向后仍需 https
- `sha256` 与 `size` 必填；VRM ≤ 200 MB、缩略图 ≤ 1 MB、目录 ≤ 2 MB；下载超过声明大小立即中止
- 下载先写 `.part`（支持 `Range` 续传），校验 sha256 后原子改名；再静态解析 GLB/VRM 头确认是 VRM，否则丢弃
- 模型文件从不执行：只读 glTF JSON 块与缩略图字节；渲染进程经 `cdmodel://`（只读、仅 `remote` / `user` / `cache` 目录、仅 `.vrm` / 图片、拒绝 `..` 与符号链接逃逸）加载
- 目录用 ETag 缓存在 `userData/models/cache/`；网络不可用时使用缓存目录，已安装 / 内置模型照常可用
- 目录地址：默认 raw.githubusercontent.com，失败时 jsDelivr；`COMPANION_MODEL_CATALOG_URL` 可覆盖（逗号分隔）

## 通过 PR 向目录添加模型

1. 确认模型许可在允许列表或审核列表中，并能给出可核验的来源（VRM meta、作者发布页等）。**不接受**禁止商用或禁止再分发的模型；
   新的自定义条款需先由维护者审核后加入 `allowed-licenses.json` 的 `reviewed`（及本仓库 `assets-licenses.json`）
2. 在 companion-desk-models 仓库新建 `models/<id>/`：`model.vrm`、`thumb.jpg`（≤ 256 px）、`model.json`（id / name / author / license / source / version / vrmVersion / tags / credit）
3. 运行 `node scripts/build-catalog.mjs` 生成 `catalog.json`，`--check` 必须通过
4. 提交 PR；合并后维护者运行 `scripts/release.sh <id>` 发布 `<id>-v<version>` Release 资产
5. 更新模型：改 `version`，替换文件，重新生成目录并发布新 Release

## 用户导入

- 文件对话框或拖放 `.vrm`（VRM 0.x / 1.0，≤ 300 MB），只做静态校验
- 展示 VRM meta：作者、许可、允许使用者、商用、再分发；并提示模型由用户自行负责、不会上传或分发
- 可配置：名字、缩放（0.1–5）、垂直偏移、镜头高度 / 距离、表情映射（`happy=Joy`）、允许的动作
- 配置导出 / 导入为 JSON（`schema: "companion-desk/model-config@1"`；只保留白名单字段，取值会被夹取）
- 可替换 VRM 文件（保留配置）或删除
