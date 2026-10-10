# Building and releasing

## Local builds

Use Node.js 22.18 or newer. Native modules need a C/C++ toolchain: Xcode Command Line Tools on macOS, Visual Studio Build Tools on Windows, `build-essential` on Linux. Building `.deb` and `.rpm` also needs `fakeroot`, `dpkg` and `rpm`.

```bash
npm install
npm run build      # webpack: dist/main and dist/renderer
npm run package    # electron-builder: installers for the current platform in release/
```

`npm run package` packages whatever is in `dist/`, so run `npm run build` first.

### What gets packaged

electron-builder is configured in the `build` field of `package.json`:

- **Files:** `dist/`, `assets/` and `package.json`.
- **`asarUnpack`:** `ffmpeg-static` and `ffprobe-static` stay outside the asar archive, because `child_process.spawn` cannot execute a binary inside it.
- **Icons:** `build/icon.icns` (macOS), `build/icon.ico` (Windows), and `assets/icon.png` for the window and Linux. Regenerate all of them with `npm run icons`.
- **`afterPack`:** `scripts/after-pack.js` ad-hoc signs the macOS app (`codesign --sign -`), which Apple Silicon requires to launch it at all.

| Platform | Targets | Output |
| --- | --- | --- |
| macOS | DMG, arm64 and x64 built separately | `Salt-Player-<v>-arm64.dmg`, `Salt-Player-<v>.dmg` |
| Windows | NSIS installer, portable | `Salt-Player-Setup-<v>.exe`, `Salt-Player-<v>.exe` |
| Linux | AppImage, deb, rpm | `Salt-Player-<v>.AppImage`, `saltplayer_<v>_amd64.deb`, `saltplayer-<v>.x86_64.rpm` |

## Release process

Every merged change already carries its version bump and CHANGELOG entry (see [CONTRIBUTING](../CONTRIBUTING.md#workflow)). Publishing is a separate, deliberate step:

```bash
git switch master && git pull
git tag v<x.y.z>          # must match package.json
git push origin v<x.y.z>
```

The tag triggers `.github/workflows/release.yml`:

1. **test:** unit and integration tests on Ubuntu, macOS and Windows (Node 20).
2. **publish:** four jobs (Linux, Windows, macOS arm64, macOS x64) install dependencies, rebuild native modules for Electron (`@electron/rebuild`), build, and run `electron-builder --publish always`. The installers are uploaded to the GitHub release for the tag.

The macOS x64 build is cross-compiled on an ARM64 runner. `ffmpeg-static` downloads a binary for the host architecture, so the workflow downloads it again for x64 before packaging. Without that step the Intel build would ship an ARM64 ffmpeg and fail with `EBADARCH`.

After the workflow finishes, check the release page: every platform's installer is present, and the release notes match the CHANGELOG section.

The workflow can also be started by hand (`workflow_dispatch`), for example to rebuild a release after a CI fix.

## Code signing

Releases are not signed with a Developer ID or Authenticode certificate (`CSC_IDENTITY_AUTO_DISCOVERY: false` in CI):

- **macOS:** the app is ad-hoc signed only and not notarised, so Gatekeeper blocks the first launch. Users need to right-click the app and choose **Open**, or run `xattr -dr com.apple.quarantine "/Applications/Salt Player.app"`.
- **Windows:** SmartScreen warns about an unknown publisher.

To sign, provide `CSC_LINK` and `CSC_KEY_PASSWORD` (and for notarisation `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) as repository secrets, and remove `CSC_IDENTITY_AUTO_DISCOVERY: false`. See [electron-builder code signing](https://www.electron.build/code-signing).

## Updates

There is no auto-updater. Users download new versions from [Releases](https://github.com/knrerikh/saltplayer/releases).

## Codec licensing

The bundled ffmpeg encodes AAC and decodes AC3, E-AC3 and DTS. Those formats are covered by patent licences in some jurisdictions. Salt Player is distributed free of charge for personal use. Anyone redistributing it commercially should review the licensing terms for those codecs.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm install` fails compiling native modules | Install the platform toolchain listed above. |
| Packaged app plays video without sound (macOS) | Check that the ffmpeg binary matches the app's architecture: `file "Salt Player.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg"`. |
| Packaged app crashes on start | Read `crash.log` in the app's log directory (`~/Library/Logs/Salt Player/` on macOS); it records startup diagnostics and uncaught errors. |
| AppImage won't start | `chmod +x Salt-Player-<v>.AppImage` |
