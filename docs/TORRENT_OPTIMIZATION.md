# Piece selection

Salt Player streams one file out of a torrent while it downloads. This document describes how `TorrentEngine.prioritizeStreamingPieces()` (`src/main/torrent.ts`) decides what to download, and why.

## Goals

- Start playback quickly: the first seconds of video matter more than anything else.
- Keep playback smooth: download roughly in playback order.
- Spend bandwidth only on what is being watched. A season pack of ten episodes should not download ten episodes in parallel.

## Algorithm

`prioritizeStreamingPieces(file, startByte = 0)`:

1. **Select only the current file.** Every file in the torrent is deselected, then the current one is selected. Other episodes download nothing.
2. **Compute the piece window.** From the file's offset inside the torrent and `startByte`:
   ```ts
   const startPiece = Math.floor((file.offset + startByte) / pieceLength);
   const endPiece = Math.floor((file.offset + file.length - 1) / pieceLength);
   ```
3. **Critical pieces.** The first 10 pieces of the window (`criticalPiecesCount`) are selected with high priority, so the decoder gets the data around the playhead first.
4. **The rest, in order.** Pieces from `startPiece + 10` to `endPiece` are selected at normal priority, so WebTorrent fetches them roughly sequentially.

5. **The next episode's start, if asked for.** After `prefetchFile()` (see below), the first `PREFETCH_BYTES` of that file are selected again at normal priority, since step 1 deselected them.

Progress in the status bar is reported for the selected file (`selectedFile.progress`), not for the whole torrent.

## When it runs

| Trigger | `startByte` |
| --- | --- |
| A torrent is loaded and its first video file chosen | `0` |
| The user switches episode (`torrent:selectFile`) | `0` for the new file |
| The user seeks (`playback:seek`) | `fileLength × time / duration`, an estimate that assumes a roughly constant bitrate |

The seek estimate does not need to be exact: the critical window covers ten pieces (typically 2–40 MB), and HTTP range requests from the player pull the exact bytes anyway.

## Prefetching the next episode

Two minutes before the end of an episode, the renderer calls `torrent:prefetchFile` with the next file of the playlist (see [Autoplay of the next episode](ARCHITECTURE.md#autoplay-of-the-next-episode)). `prefetchFile()` selects that file's first 16 MB (`PREFETCH_BYTES`, the whole file if it is smaller) at normal priority, alongside the rest of the current episode. That is enough for ffprobe and the first seconds of playback, so the switch does not start on an empty buffer. Once the next episode is playing, its normal window replaces the prefetch.

## Interaction with transcoding

In transcode mode, ffmpeg reads the file through the local server's raw URL rather than from a byte stream. It can therefore read the container index and seek by time (`seekInput`), and the range requests it makes land inside the window prioritised above.

## Tests

`tests/unit/torrent-optimization.test.ts` covers file deselection, the piece window for files at different offsets, critical and sequential selection, single-file torrents, episode switching and seek reprioritisation. `tests/unit/torrent-prefetch.test.ts` covers the next-episode prefetch: its range, surviving a seek, ending once that file plays, and local files.

## Possible improvements

- Size the critical window by bitrate and connection speed instead of a fixed 10 pieces.
- Use the container's index to map a seek time to a byte offset precisely.
