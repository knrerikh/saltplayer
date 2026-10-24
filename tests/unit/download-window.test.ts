import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'stream';
import {
  piecesOf,
  readAheadBytes,
  readAheadPieces,
  readInChunks,
  planRelease,
  MIN_READ_AHEAD_BYTES,
  DEFAULT_READ_AHEAD_BYTES,
  READ_AHEAD_SECONDS,
} from '@/main/download-window';
import type { ByteRange, MediaSource } from '@/main/local-video';

const MB = 1024 * 1024;

describe('piecesOf (#54)', () => {
  it('covers every piece a file touches, including shared boundary pieces', () => {
    expect(piecesOf({ offset: 10, length: 25 }, 10)).toEqual({ from: 1, to: 3 });
  });

  it('covers one piece for a file inside it', () => {
    expect(piecesOf({ offset: 12, length: 3 }, 10)).toEqual({ from: 1, to: 1 });
  });
});

describe('readAheadBytes (#54)', () => {
  it('reaches a few minutes of playback ahead at the file bitrate', () => {
    const length = 3000 * MB;
    const duration = 3000; // 1 MB/s

    expect(readAheadBytes(length, duration)).toBe(READ_AHEAD_SECONDS * MB);
  });

  it('never goes below the floor for low bitrates', () => {
    expect(readAheadBytes(100 * MB, 10_000)).toBe(MIN_READ_AHEAD_BYTES);
  });

  it('uses the default while the duration is unknown', () => {
    expect(readAheadBytes(3000 * MB, 0)).toBe(DEFAULT_READ_AHEAD_BYTES);
  });
});

describe('readAheadPieces (#54)', () => {
  const file = { offset: 100, length: 1000 };

  it('runs from the piece at the read position to the read-ahead distance', () => {
    expect(readAheadPieces(file, 200, 250, 10)).toEqual({ from: 30, to: 54 });
  });

  it('stops at the end of the file', () => {
    expect(readAheadPieces(file, 900, 500, 10)).toEqual({ from: 100, to: 109 });
  });
});

describe('planRelease (#54)', () => {
  const PIECE = 10;

  it('releases every piece of a file nothing else needs and truncates it to nothing', () => {
    expect(planRelease({ offset: 10, length: 30 }, [{ offset: 100, length: 50 }], PIECE)).toEqual({
      pieces: { from: 1, to: 3 },
      keepBytes: 0,
    });
  });

  it('keeps a first piece shared with a file still needed, and its bytes on disk', () => {
    // Pieces 1..3; piece 1 also holds the end of the file before (offset 5..14).
    const plan = planRelease({ offset: 15, length: 20 }, [{ offset: 5, length: 10 }], PIECE);

    expect(plan).toEqual({ pieces: { from: 2, to: 3 }, keepBytes: 5 });
  });

  it('releases a last piece shared with the next file too: disk can only be cut from the end', () => {
    // Pieces 1..2; piece 2 also holds the start of the next file (offset 25..).
    const plan = planRelease({ offset: 10, length: 15 }, [{ offset: 25, length: 30 }], PIECE);

    expect(plan).toEqual({ pieces: { from: 1, to: 2 }, keepBytes: 0 });
  });

  it('releases nothing from a file that is one shared, needed piece', () => {
    const plan = planRelease({ offset: 12, length: 3 }, [{ offset: 5, length: 7 }], PIECE);

    expect(plan).toEqual({ pieces: null, keepBytes: 3 });
  });
});

/** A source that serves `length` bytes of 'x' and records the ranges opened. */
function fakeSource(length: number) {
  const opened: ByteRange[] = [];
  const source: MediaSource = {
    name: 'Movie.mkv',
    length,
    createReadStream: (range?: ByteRange) => {
      const { start, end } = range ?? { start: 0, end: length - 1 };
      opened.push({ start, end });
      return Readable.from([Buffer.alloc(end - start + 1, 'x')]);
    },
  };
  return { source, opened };
}

async function readAll(stream: Readable): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of stream) parts.push(part);
  return Buffer.concat(parts);
}

describe('readInChunks (#54)', () => {
  it('serves the whole range through bounded reads', async () => {
    const { source, opened } = fakeSource(100);

    const data = await readAll(readInChunks(source, { start: 10, end: 54 }, 20));

    expect(data.length).toBe(45);
    expect(opened).toEqual([
      { start: 10, end: 29 },
      { start: 30, end: 49 },
      { start: 50, end: 54 },
    ]);
  });

  it('reports each read position before opening it', async () => {
    const { source } = fakeSource(100);
    const onChunk = vi.fn();

    await readAll(readInChunks(source, { start: 0, end: 49 }, 20, onChunk));

    expect(onChunk.mock.calls).toEqual([[0], [20], [40]]);
  });

  it('does not open further chunks while nobody reads', async () => {
    const { source, opened } = fakeSource(100 * MB);
    const stream = readInChunks(source, { start: 0, end: 100 * MB - 1 }, 8 * MB);

    stream.once('readable', () => stream.read(1));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(opened.length).toBeLessThanOrEqual(2);
    stream.destroy();
  });

  it('closes the open chunk when the response goes away', async () => {
    const destroyed = vi.fn();
    const source: MediaSource = {
      name: 'Movie.mkv',
      length: 100,
      createReadStream: () => {
        const chunk = new Readable({ read() {} });
        chunk.push(Buffer.alloc(10, 'x'));
        chunk.on('close', destroyed);
        return chunk;
      },
    };
    const stream = readInChunks(source, { start: 0, end: 99 }, 50);

    await new Promise<void>((resolve) => stream.once('data', () => resolve()));
    stream.destroy();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(destroyed).toHaveBeenCalled();
  });
});
