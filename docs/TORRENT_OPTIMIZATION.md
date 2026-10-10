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

Progress in the status bar is reported for the selected file (`selectedFile.progress`), not for the whole torrent.

## When it runs

| Trigger | `startByte` |
| --- | --- |
| A torrent is loaded and its first video file chosen | `0` |
| The user switches episode (`torrent:selectFile`) | `0` for the new file |
| The user seeks (`playback:seek`) | `fileLength × time / duration`, an estimate that assumes a roughly constant bitrate |

The seek estimate does not need to be exact: the critical window covers ten pieces (typically 2–40 MB), and HTTP range requests from the player pull the exact bytes anyway.

## Interaction with transcoding

In transcode mode, ffmpeg reads the file through the local server's raw URL rather than from a byte stream. It can therefore read the container index and seek by time (`seekInput`), and the range requests it makes land inside the window prioritised above.

## Tests

`tests/unit/torrent-optimization.test.ts` covers file deselection, the piece window for files at different offsets, critical and sequential selection, single-file torrents, episode switching and seek reprioritisation.

## Possible improvements

- Start fetching the next episode near the end of the current one.
- Size the critical window by bitrate and connection speed instead of a fixed 10 pieces.
- Use the container's index to map a seek time to a byte offset precisely.
