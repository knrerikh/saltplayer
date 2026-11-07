# Tasks

## 1. Bundled ffmpeg from jellyfin-ffmpeg

- [x] 1.1 Add `scripts/ffmpeg-manifest.json` (pinned jellyfin-ffmpeg version; asset URL and SHA-256 for darwin-x64, darwin-arm64, win32-x64, linux-x64) and `scripts/fetch-ffmpeg.mjs` (download, verify, extract with system `tar`, keep only ffmpeg/ffprobe, idempotent stamp, `--platform/--arch`); unit-test the checksum check and the platform-to-asset choice; verify a real run fetches the host's binaries into `vendor/ffmpeg/<host>/` and `vendor/ffmpeg/<host>/ffprobe -version` prints the pinned version.
- [x] 1.2 Add `src/main/media-tools.ts` (packaged vs dev paths, `.exe` on Windows) with unit tests; switch `torrent.ts` and its startup diagnostics to it; remove `ffmpeg-static`, `ffprobe-static`, their `asarUnpack` entries and type declarations; `postinstall` runs the fetch for the host; `vendor/` in `.gitignore`. Verify `npx tsc --noEmit -p .` and the full test suite (the integration test with real media now uses the new binaries).
- [ ] 1.3 Packaging and CI: `extraResources` for `vendor/ffmpeg/${platform}-${arch}` → `ffmpeg`; `after-pack.js` signs those binaries on macOS; `release.yml` fetches the target arch and drops the ffmpeg-static x64 workaround; the test workflow caches `vendor/ffmpeg` by the manifest hash. Verify CI is green on all three OS; packaging is a manual check (task 5.2).
- [x] 1.4 Docs for this group: CONTRIBUTING setup (install fetches ffmpeg, needs network once), DEPLOYMENT (binaries per target, manifest update procedure), README licences (GPL ffmpeg builds from jellyfin-ffmpeg, link to sources). Verify the docs name the manifest and the fetch script.

## 2. Detection

- [x] 2.1 Pure function deciding the video conversion from ffprobe JSON (DOVI record with `dv_bl_signal_compatibility_id` 0 → `dolby-vision-sdr`, with width and height; anything else → none), with fixtures: the probed Netflix P5 JSON from the spike, a profile 8.1 record (compatibility id 1), plain HEVC SDR, H.264, no video stream. Verify by unit tests.
- [x] 2.2 `probeStream` returns the conversion next to `needsTranscode`; a video needing conversion gets `?transcode=true&video=sdr` in its first URL. Verify with an engine test using a fake probe result.

## 3. Conversion stream

- [x] 3.1 Pure `buildConversionArgs({ platform, width, height })` (scale cap to 1920×1080 without upscaling, `tonemapx` chain, encoder per platform, pixel format and BT.709 tags); unit tests for macOS and Linux/Windows and for 4K and 720p sources. Verify by tests.
- [x] 3.2 The transcode route applies those options when `video=sdr`; every stream URL (initial, audio track, resume) is built by one function that keeps the conversion; check the renderer's seek keeps the URL parameters and changes only `startTime` (fix and test if not). Verify with engine/route tests (arguments passed to ffmpeg for `video=sdr` with and without `audioTrack` and `startTime`) and an integration test that converts a short generated 10-bit HEVC clip and gets H.264 at ≤1080p.
- [x] 3.3 Failure fallback: if the converting ffmpeg fails before its first bytes, send the error notice once and resend the URL without `video=sdr`. Verify with a test that simulates the failure.
- [x] 3.4 Docs for this group: Architecture (transcode flow with the conversion mode), User Guide (Dolby Vision profile 5 plays converted to 1080p; seeking takes a few seconds), CHANGELOG `[Unreleased]` → Fixed. Verify the docs mention 1080p and the fallback message.

## 4. Verification

- [ ] 4.1 `npx tsc --noEmit -p .` and `npx vitest run` with no `Errors` line; CI green on macOS, Windows and Linux.
- [ ] 4.2 Manual pass (in the PR): the #94 file plays with natural colours; seek to 20:00; switch audio track; subtitles on, seek, still in sync; resume from a saved position; spinner while it restarts; an ordinary H.264 MP4 and an AC3 MKV play as before; a packaged build on macOS (Intel and Apple Silicon if available) and Windows finds its ffmpeg and plays the file; CPU load noted.

## Workflow follow-up

- After merge: `/opsx:archive dolby-vision-playback`.
