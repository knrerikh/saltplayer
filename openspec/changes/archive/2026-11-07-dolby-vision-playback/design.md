# Design

## Context

- `src/main/torrent.ts` resolves `ffmpeg-static` / `ffprobe-static` paths (rewriting `app.asar` to `app.asar.unpacked`), probes every stream with `ffprobe -show_format -show_streams -print_format json`, and decides `needsTranscode` from the audio codec only. The transcode route (`?transcode=true[&audioTrack=N][&startTime=S]`) runs fluent-ffmpeg with `-ss` before `-i`, `videoCodec('copy')`, audio `aac -ac 2` or `copy`, Matroska to the response. Choosing an audio track builds a new URL with `transcode=true&audioTrack=N`. Subtitles are a separate ffmpeg per track, started at the same `startTime`.
- The renderer already shows a loading spinner on the `<video>` `waiting` event.
- Packaging: `asarUnpack` for both npm packages; `release.yml` re-downloads ffmpeg-static for the macOS x64 cross-build. `tests/integration/local-file-playback.test.ts` generates media with the bundled ffmpeg and runs the real probe and transcode.
- Spike results (see #94): jellyfin-ffmpeg 8.1.3 portable, `scale` to 1080p then `tonemapx=tonemap=bt2390:desat=0:peak=100:t=bt709:m=bt709:p=bt709:format=yuv420p`, `h264_videotoolbox -b:v 8M` → correct colours, 1.6× realtime on an i7-9750H; frames from software and VideoToolbox decode were identical; audio in the same process works; first bytes 2.6 s after a seek on a local source.

## Goals / Non-Goals

**Goals:**
- One ffmpeg/ffprobe for everything, pinned and verified, for every platform we ship.
- Detection and the conversion decision as pure, unit-tested functions; the HTTP route stays a thin consumer.
- A converted stream reuses the existing transcode route, seeking and audio-track logic instead of a second pipeline.

**Non-Goals:**
- GPU tone mapping, hardware decoding, HDR output, adaptive resolution by CPU speed.
- Changing how non-Dolby-Vision videos play.

## Decisions

1. **jellyfin-ffmpeg portable builds, fetched by a pinned script.** `scripts/ffmpeg-manifest.json` lists, per `platform-arch` (`darwin-x64`, `darwin-arm64`, `win32-x64`, `linux-x64`), the release asset URL of one jellyfin-ffmpeg version and its SHA-256 (computed once and committed). `scripts/fetch-ffmpeg.mjs [--platform p --arch a]` downloads the asset, refuses it on a checksum mismatch, extracts it with the system `tar` (bsdtar on macOS and Windows 10+, GNU tar with xz on Linux; Windows assets are zip) into `vendor/ffmpeg/<platform>-<arch>/`, and keeps only `ffmpeg` and `ffprobe` (`.exe` on Windows). It is idempotent (skips when the binaries and a stamp of the manifest entry are present). `postinstall` runs it for the host. `vendor/` is git-ignored.
   - *Alternative:* keep `ffmpeg-static` and add jellyfin only for Dolby Vision. Rejected: two ffmpegs to ship and keep in sync, and ffprobe 4.0.2 still cannot detect Dolby Vision.
   - *Alternative:* build ffmpeg ourselves. Rejected: a large CI investment for what Jellyfin already publishes.
2. **Shipping and path resolution.** electron-builder `extraResources` copies `vendor/ffmpeg/${platform}-${arch}` to `resources/ffmpeg`. A small `src/main/media-tools.ts` returns the binary paths: `process.resourcesPath/ffmpeg/…` when packaged, `vendor/ffmpeg/<host>/…` otherwise; startup diagnostics log these paths. `ffmpeg-static`, `ffprobe-static`, the `asarUnpack` entries and the x64 workaround in `release.yml` are removed; the release job runs the fetch script with the target arch. `after-pack.js` ad-hoc signs `resources/ffmpeg/*` explicitly before the app bundle on macOS.
3. **Detection.** The new ffprobe already prints `side_data_list` with `-show_streams`. A pure function reads the first video stream: it needs conversion when an entry with `side_data_type` "DOVI configuration record" has `dv_bl_signal_compatibility_id` equal to 0 (profile 5 has no compatible base layer; profiles 7 and 8.x carry an HDR10/SDR-compatible id and play as today). It also returns the stream's width and height. The probe result gains `videoConversion: 'dolby-vision-sdr' | null` next to `needsTranscode`.
4. **One transcode route, one more parameter.** A converted stream uses `?transcode=true&video=sdr`. The engine keeps the current video conversion and builds every stream URL (initial, audio track, resume) through one function, so the parameter cannot be lost; the renderer's seek keeps the URL's parameters and only changes `startTime` (verify this in the renderer, and fix there if not).
5. **Arguments as a pure builder.** `buildConversionArgs({ platform, width, height })` returns the video output options: `-map 0:v:0`, `-vf scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2,tonemapx=…:format=yuv420p`, the encoder (`h264_videotoolbox -b:v 8M` on macOS; `libx264 -preset veryfast -crf 20 -tune film` elsewhere), `-pix_fmt yuv420p` and BT.709 colour tags. Scaling before `tonemapx` is what the spike measured (tone mapping at 1080p instead of 4K) and gave correct frames. Audio options stay as they are.
6. **Container stays Matroska.** The current route already plays Matroska from ffmpeg in Chromium with seeking by `startTime`; H.264 in Matroska plays in Chromium as well. Switching to fragmented MP4 is the fallback only if the manual check shows Chromium refuses it.
7. **Failure falls back to unconverted playback.** If the converting ffmpeg fails before writing its first bytes (missing binary, unsupported encoder, `tonemapx` error), the engine sends an error notice once ("This video is Dolby Vision; its colours may be wrong") and resends the URL without `video=sdr`.

## Risks / Trade-offs

- [CPU-bound: below realtime on slower CPUs or with a slow torrent] → 1080p cap; manual check on the oldest machine available; hardware paths are a later change.
- [libx264 speed on Windows/Linux not measured] → measure in the manual pass; `veryfast` preset leaves room for `ultrafast`.
- [Install and CI now download from GitHub releases] → checksum-pinned; cache `vendor/ffmpeg` in CI keyed by the manifest hash; a clear error when offline.
- [GPL binaries in an MIT app] → same situation as ffmpeg-static today; README states it and links jellyfin-ffmpeg sources for the pinned version.
- [macOS Gatekeeper on unsigned nested binaries] → explicit ad-hoc signing in `after-pack.js`; manual check of a packaged build on a second Mac.
- [Bigger download] → binaries are of the same order as today's; note the size change in the PR.

## Open Questions

- Exact SHA-256 sums and asset names are taken when writing the manifest from the release page of the pinned version.
