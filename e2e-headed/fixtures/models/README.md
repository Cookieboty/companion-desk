# Test-only model fixtures (NOT bundled in the app, NOT committed)

The 3D e2e tests seed a _user-imported_ VRM (`CD_SEED_USER_VRM`) to exercise the custom-model path.
The model — VRoid Studio sample **AvatarSample_D** by pixiv Inc. (VRoid Project), **CC0-1.0**
(<https://opengameart.org/content/vroid-studio-cc0-models>) — is downloaded on first run by
`e2e-headed/globalSetup.ts` (see `fixtures/testAvatar.ts`), verified by sha256 and cached in
`e2e-headed/.cache/test-avatar-cc0.vrm` (gitignored; cached in CI). The app itself bundles only Nomi.

Offline: download the zip manually, extract `AvatarSample_D.vrm` to the cache path above
(or point `CD_SEED_USER_VRM` at it).
