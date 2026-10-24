# Piece selection

Salt Player streams one file out of a torrent while it downloads. This document describes how `TorrentEngine.prioritizeStreamingPieces()` (`src/main/torrent.ts`) decides what to download, and why.

## Goals

- Start playback quickly: the first seconds of video matter more than anything else.
- Keep playback smooth: download roughly in playback order, a few minutes ahead.
- Spend bandwidth and disk only on what is being watched. A season pack of ten episodes should not download ten episodes in parallel, a paused movie should not keep downloading to its end, and episodes already watched should not pile up on disk.

## What selects pieces

WebTorrent downloads every piece covered by a *selection*. Three kinds are in play:

- **Ours**, made by `TorrentEngine`: the critical pieces at the playhead, the read-ahead window and the next episode's prefetch. They are rebuilt whenever playback moves somewhere else.
- **Stream selections**, made by WebTorrent for every open read stream, covering the stream's whole byte range for as long as it is open.
- **WebTorrent's defaults**, which select the whole torrent when it is added and select again any piece that fails verification. The torrent is added with `deselect: true`, so these never happen.

## Bounded reads

The player asks for open-ended ranges (`bytes=N-`), and a single read stream for such a range would select everything to the end of the file. The streaming server therefore serves every response through `readInChunks()` (`src/main/download-window.ts`): it opens the file `READ_CHUNK_BYTES` (8 MB) at a time and opens the next chunk only when the reader wants more. When Chromium's buffer is full, for example while the video is paused, the reads stop, and so does the download behind them. A response that goes away closes its open chunk, even one still waiting for pieces.

## Algorithm

`prioritizeStreamingPieces(file, startByte = 0)`:

1. **Clear our selections.** Every file is deselected; only open read streams keep theirs.
2. **Critical pieces.** The first 10 pieces from `startByte` are selected with high priority, so the decoder gets the data around the playhead first.
3. **Read-ahead window.** `moveReadAhead(startByte)` selects, at normal priority, the pieces from `startByte` to `READ_AHEAD_SECONDS` (5 minutes) of playback further, sized from the file's bitrate (`length / duration`, at least 32 MB) or `DEFAULT_READ_AHEAD_BYTES` (256 MB) before the duration is known. It never runs past the end of the file.
4. **The next episode's start, if asked for.** After `prefetchFile()` (see below), the first `PREFETCH_BYTES` of that file are selected again, since step 1 deselected them.
5. **Free the file left behind.** On a switch to another file, `releaseFile()` frees the previous one (see below).

While playing, each chunk the server opens for the player calls `moveReadAhead(position)`: the old window is deselected and a new one selected from that position. The window therefore stays about five minutes ahead of what the player has read, and stops moving when the player stops reading. Reads by our own ffprobe and subtitle extraction carry `?internal=1` and do not move it, nor do small reads near the end of the file (container index probes).

Progress in the status bar is reported for the selected file (`selectedFile.progress`), not for the whole torrent.

## Freeing watched episodes

When playback switches to another file, `releaseFile()` marks the downloaded pieces of the previous file as missing (WebTorrent's private `_markUnverified()`, which with `deselect: true` does not select them again) and truncates the file on disk. `planRelease()` decides what goes:

- A first piece shared with a file still needed (the one now playing, or the prefetched one) stays, and so do its bytes at the start of the file.
- A last piece shared with the next file is freed too, because a file can only be truncated from its end; the next file fetches that one piece again.

Going back to a freed episode downloads it again. Seeking within the same file frees nothing.

## When it runs

| Trigger | `startByte` |
| --- | --- |
| A torrent is loaded and its first video file chosen | `0` |
| The user switches episode (`torrent:selectFile`) | `0` for the new file |
| The user seeks (`playback:seek`) | `fileLength × time / duration`, an estimate that assumes a roughly constant bitrate |

The seek estimate does not need to be exact: the critical window covers ten pieces (typically 2–40 MB), and the player's range requests move the read-ahead window to the exact bytes anyway.

## Prefetching the next episode

Two minutes before the end of an episode, the renderer calls `torrent:prefetchFile` with the next file of the playlist (see [Autoplay of the next episode](ARCHITECTURE.md#autoplay-of-the-next-episode)). `prefetchFile()` selects that file's first 16 MB (`PREFETCH_BYTES`, the whole file if it is smaller) at normal priority, alongside the read-ahead window of the current episode. That is enough for ffprobe and the first seconds of playback, so the switch does not start on an empty buffer. Once the next episode is playing, its normal window replaces the prefetch.

## Interaction with transcoding

In transcode mode, ffmpeg reads the file through the local server's raw URL rather than from a byte stream. It can therefore read the container index and seek by time (`seekInput`). Its reads count as playback and move the window; ffmpeg only reads as fast as its output is consumed, so a paused player stops it too.

## Limitations

- **Subtitle extraction reads the whole file.** Subtitles are interleaved with the video, so extracting a track downloads the file to its end. These reads do not move the read-ahead window.
- **The disk space of the playing episode** is only freed when switching away or quitting; what has been watched of it stays until then.

## Tests

`tests/unit/torrent-optimization.test.ts` covers file deselection, the piece window for files at different offsets, critical selection, single-file torrents, episode switching and seek reprioritisation. `tests/unit/download-window.test.ts` covers the window and release arithmetic and bounded reads (backpressure, closing a waiting chunk); `tests/unit/torrent-download-window.test.ts` covers the window in the engine and the server, its sizing and movement, internal reads, and freeing an episode on disk. `tests/unit/torrent-prefetch.test.ts` covers the next-episode prefetch: its range, surviving a seek, ending once that file plays, and local files.

## Possible improvements

- Size the critical window by bitrate and connection speed instead of a fixed 10 pieces.
- Use the container's index to map a seek time to a byte offset precisely.
