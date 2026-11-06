# Proposal

## Why

Dolby Vision profile 5 videos — the usual format of Netflix 2160p WEB-DL releases — play with a purple and green cast and washed-out colours (#94). Profile 5 keeps the picture in Dolby's own colour space with no HDR10 or SDR fallback, and Chromium never applies the Dolby Vision reshaping. Our bundled ffprobe 4.0.2 cannot even tell that a file is Dolby Vision, and our ffmpeg 6.1.1 cannot convert it.

A spike on the reported file proved the fix: jellyfin-ffmpeg 8.1.3 detects the profile and its `tonemapx` filter applies the reshaping and tone-maps to SDR with correct colours, at 1.6–1.7× realtime for 1080p output on an Intel i7-9750H (4K output is too slow at 0.8–0.9×).

## What Changes

- The player detects Dolby Vision profile 5 (no compatible base layer) when it probes a video.
- Such videos are converted on the fly to 1080p SDR with correct colours (downscaled from 4K, never upscaled); audio, seeking, audio-track choice and subtitles keep working.
- All other videos keep today's path: video copied untouched, audio transcoded only for codecs Chromium cannot play.
- The bundled ffmpeg and ffprobe are replaced by jellyfin-ffmpeg builds for macOS (x64, arm64), Windows x64 and Linux x64, pinned to a version and verified by checksum; `ffmpeg-static` and `ffprobe-static` are removed.
- The app's notices state that it ships GPL ffmpeg builds and where their sources are.

Out of scope: HDR output (HDR10 to HDR displays), 4K output for Dolby Vision, other Dolby Vision profiles (7, 8.x play through their HDR10/SDR base layer as today), GPU tone mapping, Windows and Linux on ARM.

## Capabilities

### New Capabilities
- `video-transcoding`: when the player converts a video or its audio on the fly instead of playing the file as is, and what the converted stream keeps (seeking, audio tracks, subtitles, start-up feedback).

### Modified Capabilities

## Impact

- `src/main/torrent.ts`: probe parsing (Dolby Vision side data), a video-conversion mode of the transcode route (filter chain, encoder per platform, fragmented MP4 instead of Matroska for that mode), audio-track URLs keep the mode, binary path resolution and startup diagnostics.
- New: a pinned download script for the binaries (`scripts/`), its manifest with versions and SHA-256 sums, `extraResources` in `package.json`, `.gitignore` for the downloaded binaries; `npm install` fetches the host's binaries.
- `.github/workflows/release.yml` (fetch the target arch instead of the ffmpeg-static x64 workaround) and the test workflow (binaries available for the integration tests).
- Tests: probe parsing, mode selection, ffmpeg arguments per platform, the integration test with real media switched to the new binaries.
- Docs: README (system requirements, licences), User Guide (Dolby Vision note), Architecture (transcode flow), CONTRIBUTING (setup fetches ffmpeg), DEPLOYMENT, CHANGELOG `[Unreleased]`.
- Package size changes by roughly the size of the new binaries (similar to today's).
