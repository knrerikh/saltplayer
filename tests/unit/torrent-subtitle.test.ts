import { describe, it, expect, vi, afterEach } from 'vitest';
import { once } from 'events';
import { PassThrough } from 'stream';
import type * as http from 'http';
import type { AddressInfo, Server } from 'net';
import ffmpeg from 'fluent-ffmpeg';
import { TorrentEngine } from '@/main/torrent';
import { StorageManager } from '@/main/storage';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]) },
}));

vi.mock('fluent-ffmpeg', () => {
  const ffmpeg: any = vi.fn();
  ffmpeg.setFfmpegPath = vi.fn();
  ffmpeg.setFfprobePath = vi.fn();
  return { default: ffmpeg };
});

function loadFakeTorrent(engine: TorrentEngine) {
  const file = {
    name: 'Movie.mkv',
    length: 1024,
    offset: 0,
    select: vi.fn(),
    deselect: vi.fn(),
    createReadStream: vi.fn(),
  };
  (engine as any).currentTorrent = { files: [file], pieceLength: 16384, select: vi.fn() };
  return file;
}

describe('Subtitle start time (#79)', () => {
  let engine: TorrentEngine;

  afterEach(async () => {
    await engine.destroy();
  });

  describe('the /subtitle route', () => {
    /** Requests a subtitle track and returns the start time the engine extracts it from. */
    async function startTimeFor(query: string): Promise<unknown> {
      engine = new TorrentEngine(new StorageManager());
      const file = loadFakeTorrent(engine);
      await engine.selectFile(file.name);
      const serveSubtitle = vi.fn(async (_index: number, res: http.ServerResponse) => {
        res.end();
      });
      (engine as any).serveSubtitle = serveSubtitle;

      const server: Server = (engine as any).server;
      if (!server.listening) await once(server, 'listening');
      const { port } = server.address() as AddressInfo;
      await fetch(`http://127.0.0.1:${port}/subtitle/3.vtt${query}`);

      expect(serveSubtitle).toHaveBeenCalledTimes(1);
      expect(serveSubtitle.mock.calls[0][0]).toBe(3);
      return (serveSubtitle.mock.calls[0] as unknown[])[3];
    }

    it('hands a valid startTime to the extraction', async () => {
      expect(await startTimeFor('?startTime=754')).toBe(754);
    });

    it.each(['', '?startTime=0', '?startTime=-5', '?startTime=abc', '?startTime=NaN', '?startTime=Infinity'])(
      'ignores %j',
      async (query) => {
        expect(await startTimeFor(query)).toBe(0);
      },
    );
  });

  describe('serveSubtitle', () => {
    function fakeCommand() {
      const command: any = {
        outputOptions: vi.fn(() => command),
        format: vi.fn(() => command),
        seekInput: vi.fn(() => command),
        on: vi.fn(() => command),
        pipe: vi.fn(),
        kill: vi.fn(),
      };
      vi.mocked(ffmpeg).mockReturnValue(command);
      return command;
    }

    function fakeResponse(): http.ServerResponse {
      return Object.assign(new PassThrough(), { writeHead: vi.fn() }) as unknown as http.ServerResponse;
    }

    it('seeks the input, so cue times start at 0 with the restarted stream', async () => {
      engine = new TorrentEngine(new StorageManager());
      const command = fakeCommand();

      await (engine as any).serveSubtitle(3, fakeResponse(), { name: 'Movie.mkv' }, 120);

      expect(command.seekInput).toHaveBeenCalledWith(120);
    });

    it('reads from the start without a start time', async () => {
      engine = new TorrentEngine(new StorageManager());
      const command = fakeCommand();

      await (engine as any).serveSubtitle(3, fakeResponse(), { name: 'Movie.mkv' }, 0);

      expect(command.seekInput).not.toHaveBeenCalled();
    });
  });
});
