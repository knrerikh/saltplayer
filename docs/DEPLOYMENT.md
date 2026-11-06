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
- **`extraResources`:** `vendor/ffmpeg/${platform}-${arch}` (only `ffmpeg` and `ffprobe`) is copied to `resources/ffmpeg` next to the asar archive, because `child_process.spawn` cannot execute a binary inside it. `src/main/media-tools.ts` looks for the binaries there when the app is installed and in `vendor/ffmpeg/<platform>-<arch>/` in development.
- **Icons:** `build/icon.icns` (macOS), `build/icon.ico` (Windows), and `assets/icon.png` for the window and Linux. Regenerate all of them with `npm run icons`.
- **File associations:** `build.fileAssociations` registers `.torrent` and the extensions in `VIDEO_EXTENSIONS` with role `Viewer` (macOS `Info.plist` document types, Windows registry entries, Linux `.desktop` MIME types), so the system offers Salt Player for them. Add a new video extension to both lists; a unit test fails if they differ.
- **Protocols:** `build.protocols` declares the `magnet` scheme with role `Viewer`: it becomes `CFBundleURLTypes` in the macOS `Info.plist` and the `x-scheme-handler/magnet` entry in the Linux `.desktop` file. The app claims the scheme only when the user ticks **File → Open Magnet Links in Salt Player** (`app.setAsDefaultProtocolClient`; on Windows this writes the registry then). Testing needs an installed, packaged build: `npm run dev` runs the Electron binary, so the menu item is disabled. After installing, tick the item and click a magnet link in a browser, with Salt Player closed (it should start and open the link, with one window) and open (the same window, no second one); then untick it and check that the previous torrent client handles links again. On macOS the scheme shows up after the app has been moved to Applications.
- **`afterPack`:** `scripts/after-pack.js` ad-hoc signs the macOS app (`codesign --sign -`), which Apple Silicon requires to launch it at all. It signs the bundled `ffmpeg` and `ffprobe` first, one by one.

### The bundled ffmpeg

Salt Player ships [jellyfin-ffmpeg](https://github.com/jellyfin/jellyfin-ffmpeg) portable builds, which can read Dolby Vision metadata and tone-map it. They are not in the repository: `scripts/ffmpeg-manifest.json` pins one release and lists, for `darwin-x64`, `darwin-arm64`, `win32-x64` and `linux-x64`, the asset URL and its SHA-256. `scripts/fetch-ffmpeg.mjs` downloads the asset, refuses it when the checksum differs, and unpacks only `ffmpeg` and `ffprobe` into `vendor/ffmpeg/<platform>-<arch>/` (git-ignored). It skips the download when the binaries already match the manifest. `npm install` runs it for the host (`postinstall`); the macOS x64 release job runs it again with `--platform darwin --arch x64`.

To update the build:

1. Pick a release on the [jellyfin-ffmpeg releases page](https://github.com/jellyfin/jellyfin-ffmpeg/releases) and download the four `portable_*` assets (`mac64-gpl`, `macarm64-gpl`, `win64-clang-gpl`, `linux64-gpl`).
2. Put the release's version, URLs and `shasum -a 256` sums into `scripts/ffmpeg-manifest.json`.
3. Run `node scripts/fetch-ffmpeg.mjs` and `npx vitest run`; check one Dolby Vision profile 5 file (see the manual checks in the pull request).

| Platform | Targets | Output |
| --- | --- | --- |
| macOS | DMG, arm64 and x64 built separately | `Salt-Player-<v>-arm64.dmg`, `Salt-Player-<v>.dmg` |
| Windows | NSIS installer, portable | `Salt-Player-Setup-<v>.exe`, `Salt-Player-<v>.exe` |
| Linux | AppImage, deb, rpm | `Salt-Player-<v>.AppImage`, `saltplayer_<v>_amd64.deb`, `saltplayer-<v>.x86_64.rpm` |

## Release process

Merged changes collect under `## [Unreleased]` in the CHANGELOG. Releasing them takes two steps, and nothing is published until the second one:

1. **Prepare.** In GitHub, go to **Actions → Prepare release → Run workflow** and choose the bump (see [CONTRIBUTING](../CONTRIBUTING.md#releases)). `.github/workflows/prepare-release.yml`:
   - moves `[Unreleased]` into `## [<x.y.z>] - <date>`, starts a new empty `[Unreleased]` and updates the links at the bottom (`scripts/release/prepare.mjs`);
   - bumps `package.json` and `package-lock.json`;
   - opens the pull request `chore: release v<x.y.z>` from `release/v<x.y.z>`, with the release notes as its description.

   It fails without changing anything if `[Unreleased]` is empty. Review the PR and edit the CHANGELOG wording in it if needed. Pull requests opened by GitHub Actions do not trigger other workflows, so the Tests workflow does not run on it; the release workflow runs the tests before building.
2. **Publish.** Merge the release PR. `.github/workflows/release.yml` sees that `package.json` has a version without a tag and:
   1. **prepare:** tags the merge commit `v<x.y.z>` and creates a **draft** GitHub release with the version's CHANGELOG section as notes (`scripts/release/notes.mjs`);
   2. **test:** unit and integration tests on Ubuntu, macOS and Windows (Node 20);
   3. **publish:** four jobs (Linux, Windows, macOS arm64, macOS x64) install dependencies, rebuild native modules for Electron (`@electron/rebuild`), build, and run `electron-builder --publish always`, which uploads the installers to the draft;
   4. **finalize:** publishes the draft and marks it as latest, only if every platform succeeded.

   Every other push to `master` finds the version already tagged and skips all jobs.

One-time setup: **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** must be enabled, or step 1 cannot open the PR.

The macOS x64 build is cross-compiled on an ARM64 runner. `npm ci` fetches ffmpeg for the host architecture, so the workflow fetches the x64 build (`node scripts/fetch-ffmpeg.mjs --platform darwin --arch x64`) before packaging. Without that step the Intel build would ship an ARM64 ffmpeg and fail with `EBADARCH`.

If a platform fails, the release stays a draft. Fix the cause and run **Actions → Release → Run workflow** on `master`: it rebuilds the current version, uploads the installers to the existing draft and publishes it.

## Code signing

Releases are not signed with a Developer ID or Authenticode certificate (`CSC_IDENTITY_AUTO_DISCOVERY: false` in CI):

- **macOS:** the app is ad-hoc signed only and not notarised, so Gatekeeper blocks the first launch. Users need to right-click the app and choose **Open**, or run `xattr -dr com.apple.quarantine "/Applications/Salt Player.app"`.
- **Windows:** SmartScreen warns about an unknown publisher.

To sign, provide `CSC_LINK` and `CSC_KEY_PASSWORD` (and for notarisation `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) as repository secrets, and remove `CSC_IDENTITY_AUTO_DISCOVERY: false`. See [electron-builder code signing](https://www.electron.build/code-signing).

## Updates

There is no auto-updater. Users download new versions from [Releases](https://github.com/knrerikh/saltplayer/releases).

## Codec licensing

The bundled ffmpeg is a GPL build of jellyfin-ffmpeg; its sources are linked from the [README](../README.md#legal). It encodes AAC and H.264 and decodes AC3, E-AC3, DTS and HEVC. Those formats are covered by patent licences in some jurisdictions. Salt Player is distributed free of charge for personal use. Anyone redistributing it commercially should review the licensing terms for those codecs.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm install` fails compiling native modules | Install the platform toolchain listed above. |
| Packaged app plays video without sound (macOS) | Check that the ffmpeg binary matches the app's architecture: `file "Salt Player.app/Contents/Resources/ffmpeg/ffmpeg"`. |
| Packaged app crashes on start | Read `crash.log` in the app's log directory (`~/Library/Logs/saltplayer/` on macOS); it records startup diagnostics and uncaught errors. |
| AppImage won't start | `chmod +x Salt-Player-<v>.AppImage` |
