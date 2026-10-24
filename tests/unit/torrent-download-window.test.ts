import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { once } from 'events';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import type { AddressInfo, Server } from 'net';
import { TorrentEngine } from '@/main/torrent';
import { StorageManager } from '@/main/storage';
import { DEFAULT_READ_AHEAD_BYTES, READ_AHEAD_SECONDS } from '@/main/download-window';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

const MB = 1024 * 1024;
const PIECE = MB;
const EPISODE = 3000 * MB;
const DEFAULT_WINDOW_PIECES = DEFAULT_READ_AHEAD_BYTES / PIECE;

function episode(name: string, index: number) {
  return {
    name,
    path: path.join('Show S01', name),
    length: EPISODE,
    offset: index * EPISODE,
    select: vi.fn(),
    deselect: vi.fn(),
    createReadStream: vi.fn(({ start, end }: { start: number; end: number }) =>
      Readable.from([Buffer.alloc(end - start + 1)]),
    ),
  };
}

describe('TorrentEngine download window (#54)', () => {
  let dir: string;
  let engine: TorrentEngine;
  let torrent: any;
  let episodes: ReturnType<typeof episode>[];

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // Not `saltplayer-*`: StorageManager deletes those as stale sessions, even mid-test.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'download-window-test-'));
    episodes = ['S01E01.mkv', 'S01E02.mkv', 'S01E03.mkv'].map(episode);
    const downloaded = new Set<number>();
    torrent = {
      files: episodes,
      pieceLength: PIECE,
      path: dir,
      select: vi.fn(),
      deselect: vi.fn(),
      bitfield: { get: (index: number) => downloaded.has(index) },
      _markUnverified: vi.fn((index: number) => downloaded.delete(index)),
      downloaded,
    };
    engine = new TorrentEngine(new StorageManager());
    (engine as any).currentTorrent = torrent;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await engine.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const prioritize = (file: unknown, startByte = 0) =>
    (engine as any).prioritizeStreamingPieces(file, startByte);
  const windowSelections = () => torrent.select.mock.calls.filter(([, , priority]: unknown[]) => priority === false);

  it('selects a window ahead of the playhead, not the rest of the file', () => {
    prioritize(episodes[0]);

    expect(episodes[0].select).not.toHaveBeenCalled();
    expect(windowSelections()).toEqual([[0, DEFAULT_WINDOW_PIECES - 1, false]]);
  });

  it('sizes the window from the bitrate once the duration is known', () => {
    (engine as any).lastKnownDurationSec = 3000; // 1 MB/s

    prioritize(episodes[0]);

    expect(windowSelections()).toEqual([[0, READ_AHEAD_SECONDS - 1, false]]);
  });

  it('slides the window as playback reads on', () => {
    prioritize(episodes[0]);
    torrent.select.mockClear();

    (engine as any).moveReadAhead(100 * MB);

    expect(torrent.deselect).toHaveBeenCalledWith(0, DEFAULT_WINDOW_PIECES - 1);
    expect(windowSelections()).toEqual([[100, 100 + DEFAULT_WINDOW_PIECES - 1, false]]);
  });

  describe('switching episodes', () => {
    function writeOnDisk(file: ReturnType<typeof episode>, bytes: number) {
      const filePath = path.join(dir, file.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.alloc(bytes));
      return filePath;
    }

    it('frees the episode left behind', async () => {
      const onDisk = writeOnDisk(episodes[0], 4 * MB);
      [0, 1, 2, 3, 3000].forEach((piece) => torrent.downloaded.add(piece));
      prioritize(episodes[0]);

      prioritize(episodes[1]);
      await vi.waitFor(() => expect(fs.statSync(onDisk).size).toBe(0));

      expect(torrent._markUnverified.mock.calls.map(([piece]: number[]) => piece)).toEqual([0, 1, 2, 3]);
      expect(torrent.bitfield.get(3000)).toBe(true);
    });

    it('keeps a seek within the same episode', async () => {
      const onDisk = writeOnDisk(episodes[0], 4 * MB);
      torrent.downloaded.add(0);
      prioritize(episodes[0]);

      prioritize(episodes[0], 1000 * MB);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(torrent._markUnverified).not.toHaveBeenCalled();
      expect(fs.statSync(onDisk).size).toBe(4 * MB);
    });

    it('frees an episode never written to disk without complaint', async () => {
      const logError = vi.spyOn(console, 'error');
      prioritize(episodes[0]);

      prioritize(episodes[1]);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(logError).not.toHaveBeenCalled();
    });
  });

  describe('streaming server', () => {
    async function serve(file: ReturnType<typeof episode>) {
      await engine.selectFile(file.name);
      const server: Server = (engine as any).server;
      if (!server.listening) await once(server, 'listening');
      const { port } = server.address() as AddressInfo;
      return `http://127.0.0.1:${port}/${encodeURIComponent(file.name)}`;
    }

    /** Reads the first bytes of a range, then hangs up like a player that has enough. */
    function readSome(url: string, range: string): Promise<number> {
      return new Promise((resolve, reject) => {
        const request = http.get(url, { headers: { Range: range } }, (response) => {
          response.once('data', () => {
            request.destroy();
            resolve(response.statusCode!);
          });
        });
        request.on('error', reject);
      });
    }

    it('moves the window to where the player reads', async () => {
      const url = await serve(episodes[0]);

      const status = await readSome(url, `bytes=${1200 * MB}-`);

      expect(status).toBe(206);
      await vi.waitFor(() =>
        expect(windowSelections()).toContainEqual([1200, 1200 + DEFAULT_WINDOW_PIECES - 1, false]),
      );
    });

    it('reads the file a bounded chunk at a time', async () => {
      const url = await serve(episodes[0]);

      await readSome(url, `bytes=${1200 * MB}-`);

      await vi.waitFor(() =>
        expect(episodes[0].createReadStream).toHaveBeenCalledWith({ start: 1200 * MB, end: 1208 * MB - 1 }),
      );
      const reachesEnd = episodes[0].createReadStream.mock.calls.some(([{ end }]) => end === EPISODE - 1);
      expect(reachesEnd).toBe(false);
    });

    it("does not move the window for the app's own ffprobe and subtitle reads", async () => {
      const url = await serve(episodes[0]);

      await readSome(`${url}?internal=1`, `bytes=${2000 * MB}-`);
      await new Promise((resolve) => setTimeout(resolve, 20));

      const movedThere = windowSelections().some(([from]: number[]) => from === 2000);
      expect(movedThere).toBe(false);
    });
  });
});
