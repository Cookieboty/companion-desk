# Releasing Nomi · 发布指南

Nomi ships installers for **Windows (NSIS)**, **macOS (DMG, x64+arm64)** and **Linux (AppImage)** via
[electron-builder](https://www.electron.build/), published to
[GitHub Releases](https://github.com/Cookieboty/nomi-ai/releases). Installed apps update through
`electron-updater` (same feed).

---

## What users see · 用户侧

| Step         | 中文                                                          | English                                                                       |
| ------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Launch       | 启动约 15 秒后静默检查；也可在 **设置 → 更新** 点「检查更新」 | Silent check ~15s after launch; or **Settings → Updates → Check for updates** |
| Available    | 自动开始下载；设置页显示进度                                  | Download starts automatically; Settings shows progress                        |
| Ready        | 「更新已下载，重启后安装」→ 点「重启并安装」→ 确认            | “Update downloaded” → **Restart and install** → confirm                       |
| Consent      | **不会**在你未确认时退出安装（`autoInstallOnAppQuit=false`）  | Never quits to install without your confirmation                              |
| Dev / source | 设置页显示「仅在安装版中可用」                                | Settings shows updates are unavailable for unpackaged builds                  |

Auto-check can be toggled off in Settings. Periodic re-check is every 6 hours while the app runs.

---

## Cut a release · 如何发一版

> Do **not** push a `v*` tag until CI on `main` (or the release branch) is green and you intend
> users to receive that build. Tags trigger a **published** GitHub Release.

1. **Bump the version** in sync (semver, no leading `v` in the JSON fields):
   - `package.json` (workspace root)
   - `packages/electron/package.json` ← electron-builder / electron-updater read this
   - Prefer `pnpm changeset` + `pnpm changeset:version` when a changeset exists; otherwise edit both by hand.
2. **Commit** on `main` (or a release PR), wait for CI green on all three platforms.
3. **Tag and push** (example for 1.0.0 — only when you are ready):

   ```bash
   git tag -a v1.0.0 -m "Nomi 1.0.0"
   git push origin v1.0.0
   ```

4. **CI** (`.github/workflows/ci.yml` → `build-electron`):
   - Builds win / mac / linux with signing secrets when present
   - Runs `pnpm --filter @nomi-ai/electron run package:publish:{win,mac,linux}` (`--publish always`)
   - Uploads installers + `latest*.yml` / `.blockmap` to the GitHub Release for that tag
5. **Verify the Release** page has, at least:
   - Windows: `Nomi Setup x.y.z.exe` + `latest.yml` + `.blockmap`
   - macOS: `.dmg` (and/or zip) + `latest-mac.yml`
   - Linux: `.AppImage` + `latest-linux.yml`
6. Install a previous build, open **Settings → Updates → Check for updates**, confirm download + consent install.

### Dry-run without notifying users

- Run package jobs on a PR/push (already does `--publish never`) and download the workflow **artifacts**.
- Or create a **draft** Release manually and attach artifacts from a green `build-electron` run; draft
  releases are **not** picked up by electron-updater until you publish them.

---

## Secrets · 凭证

| Name                                                         | Required? | Purpose                                                                                                |
| ------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN`                                               | automatic | Create/upload the Release (`contents: write` on the job)                                               |
| `GH_TOKEN`                                                   | optional  | Classic PAT with `repo` scope — set only if org policy blocks the default token from creating Releases |
| `CSC_LINK` / `CSC_KEY_PASSWORD`                              | optional  | Windows code signing                                                                                   |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` | optional  | macOS notarization                                                                                     |

No extra secret is required for a public repo: the workflow sets
`GH_TOKEN: ${{ secrets.GH_TOKEN \|\| secrets.GITHUB_TOKEN }}`.

Unsigned builds still install and update; SmartScreen / Gatekeeper may warn until certificates are configured.

---

## Local publish (maintainers)

```bash
pnpm install
pnpm turbo run build
pnpm --filter @nomi-ai/electron run copy-renderer
GH_TOKEN=… pnpm --filter @nomi-ai/electron run package:publish:linux   # or :win / :mac
```

`electron-builder.yml` → `publish.provider: github` (owner `Cookieboty`, repo `nomi-ai`).

---

## Version matrix

| File                                                    | Role                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/electron/package.json` → `version`            | App version reported by `app.getVersion()` and written into installers |
| Git tag `vX.Y.Z`                                        | Must match that version (electron-builder / updater convention)        |
| `packages/electron/config/default.json` → `app.version` | Display/config default only — keep in sync when bumping                |

---

## Troubleshooting

- **Settings always “unavailable”** — you are on `pnpm dev` / unpackaged. Package and install first.
- **Check fails with 404** — no Release (or no `latest*.yml`) for a _newer_ version than the installed app.
- **Download stalls** — corporate proxy; electron-updater uses HTTPS to `api.github.com` / release assets.
- **Install does nothing** — status must be `downloaded`; click **Restart and install** and confirm the dialog.
