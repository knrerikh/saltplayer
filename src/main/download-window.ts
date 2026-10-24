import { Readable } from 'stream';
import type { ByteRange, MediaSource } from './local-video';

const MB = 1024 * 1024;

/**
 * Responses are read from the torrent this much at a time. WebTorrent downloads
 * everything an open read stream covers, so a bounded read stops the download where
 * the player stops reading: when its buffer is full, e.g. while paused.
 */
export const READ_CHUNK_BYTES = 8 * MB;

/** The download runs this much playback ahead of what the player has read. */
export const READ_AHEAD_SECONDS = 5 * 60;
export const MIN_READ_AHEAD_BYTES = 32 * MB;
/** Before the duration is known, about five minutes of a typical 1080p file. */
export const DEFAULT_READ_AHEAD_BYTES = 256 * MB;

/** An inclusive range of piece indexes. */
export interface PieceRange {
  from: number;
  to: number;
}

/** Where a file's bytes sit inside the torrent. */
export interface FileSpan {
  offset: number;
  length: number;
}

export function piecesOf({ offset, length }: FileSpan, pieceLength: number): PieceRange {
  return {
    from: Math.floor(offset / pieceLength),
    to: Math.floor((offset + length - 1) / pieceLength),
  };
}

export function readAheadBytes(fileLength: number, durationSec: number): number {
  if (!(durationSec > 0)) return DEFAULT_READ_AHEAD_BYTES;
  const bytesPerSecond = fileLength / durationSec;
  return Math.max(MIN_READ_AHEAD_BYTES, Math.round(bytesPerSecond * READ_AHEAD_SECONDS));
}

/** The pieces from `byteOffset` within the file to `bytes` further, not past its end. */
export function readAheadPieces(
  file: FileSpan,
  byteOffset: number,
  bytes: number,
  pieceLength: number,
): PieceRange {
  const end = Math.min(file.length, byteOffset + bytes);
  return piecesOf({ offset: file.offset + byteOffset, length: end - byteOffset }, pieceLength);
}

/**
 * Serves a byte range of a source by opening it a chunk at a time, each only when the
 * reader wants more, so a reader that stops (a full player buffer, a paused ffmpeg)
 * stops the download behind it too.
 */
class ChunkedReadStream extends Readable {
  private position: number;
  private readonly end: number;
  private chunk: Readable | null = null;
  private wantsData = false;

  constructor(
    private readonly source: MediaSource,
    range: ByteRange,
    private readonly chunkBytes: number,
    private readonly onChunk: (position: number) => void,
  ) {
    super();
    this.position = range.start;
    this.end = range.end;
  }

  _read(): void {
    this.wantsData = true;
    if (this.chunk) {
      this.chunk.resume();
    } else {
      this.openNextChunk();
    }
  }

  // The open chunk may be waiting for pieces that never arrive; closing it ends that
  // wait and its part of the download.
  _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.chunk?.destroy();
    callback(error);
  }

  private openNextChunk(): void {
    if (this.position > this.end) {
      this.push(null);
      return;
    }
    const start = this.position;
    const end = Math.min(this.end, start + this.chunkBytes - 1);
    this.position = end + 1;
    this.onChunk(start);

    const chunk = this.source.createReadStream({ start, end });
    this.chunk = chunk;
    chunk.on('data', (data: Buffer) => {
      if (!this.push(data)) {
        this.wantsData = false;
        chunk.pause();
      }
    });
    chunk.once('end', () => {
      this.chunk = null;
      if (this.wantsData && !this.destroyed) this.openNextChunk();
    });
    chunk.once('error', (error) => this.destroy(error));
  }
}

/**
 * Serves `range` of `source` through bounded reads of `chunkBytes`. `onChunk` hears
 * the position of each chunk before it opens.
 */
export function readInChunks(
  source: MediaSource,
  range: ByteRange,
  chunkBytes: number,
  onChunk: (position: number) => void = () => {},
): Readable {
  return new ChunkedReadStream(source, range, chunkBytes, onChunk);
}

const overlaps = (piece: number, ranges: PieceRange[]) =>
  ranges.some(({ from, to }) => piece >= from && piece <= to);

/**
 * What freeing a file no longer played takes: the pieces to forget, and how many of
 * its leading bytes must stay on disk. A first piece shared with a file still needed
 * stays, bytes and all. A shared last piece goes too, since a file can only be
 * truncated from its end; the next file fetches that one piece again.
 */
export function planRelease(
  released: FileSpan,
  needed: FileSpan[],
  pieceLength: number,
): { pieces: PieceRange | null; keepBytes: number } {
  const { from, to } = piecesOf(released, pieceLength);
  const neededPieces = needed.map((file) => piecesOf(file, pieceLength));

  if (!overlaps(from, neededPieces)) {
    return { pieces: { from, to }, keepBytes: 0 };
  }
  const keepBytes = Math.min(released.length, (from + 1) * pieceLength - released.offset);
  return { pieces: from < to ? { from: from + 1, to } : null, keepBytes };
}
