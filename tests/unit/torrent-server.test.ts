import { describe, it, expect, vi, afterEach } from 'vitest';
import { once } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo, Server } from 'net';
import { TorrentEngine } from '@/main/torrent';
import { StorageManager } from '@/main/storage';
import { IPC_CHANNELS } from '@/shared/types';

const send = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => [{ webContents: { send } }]) },
}));

function loadFakeTorrent(engine: TorrentEngine) {
  const file = {
    name: 'Movie.mp4',
    length: 1024,
    offset: 0,
    select: vi.fn(),
    deselect: vi.fn(),
    createReadStream: vi.fn(),
  };
  (engine as any).currentTorrent = {
    files: [file],
    pieceLength: 16384,
    select: vi.fn(),
  };
  return file;
}

async function streamingServer(engine: TorrentEngine): Promise<Server> {
  const server: Server = (engine as any).server;
  if (!server.listening) await once(server, 'listening');
  return server;
}

/**
 * The URL this engine hands the player once the stream is probed and ready. Engines
 * from earlier tests may still be finishing their probe, so match the port.
 */
async function sentVideoUrl(engine: TorrentEngine): Promise<string> {
  const { port } = (await streamingServer(engine)).address() as AddressInfo;
  const isOurs = ([channel, url]: unknown[]) =>
    channel === IPC_CHANNELS.VIDEO_URL && new URL(url as string).port === String(port);

  return vi.waitFor(
    () => {
      const call = send.mock.calls.find(isOurs);
      if (!call) throw new Error(`No video URL for port ${port} yet`);
      return call[1] as string;
    },
    { timeout: 15_000 },
  );
}

describe('Streaming server (#18)', () => {
  let engine: TorrentEngine;

  afterEach(async () => {
    await engine.destroy();
  });

  it('listens on loopback only, so other machines on the network cannot reach it', async () => {
    engine = new TorrentEngine(new StorageManager());
    const file = loadFakeTorrent(engine);

    await engine.selectFile(file.name);
    const { address } = (await streamingServer(engine)).address() as AddressInfo;

    expect(address).toBe('127.0.0.1');
  });
});

describe('Playing a local video file (#33)', () => {
  const content = Buffer.from('local video bytes');
  let engine: TorrentEngine;
  let dir: string;
  let moviePath: string;

  afterEach(async () => {
    await engine.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
    send.mockClear();
  });

  function createMovie(): void {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saltplayer-engine-'));
    moviePath = path.join(dir, 'Home Movie.mp4');
    fs.writeFileSync(moviePath, content);
  }

  it('describes the file as a one-item playlist', async () => {
    createMovie();
    engine = new TorrentEngine(new StorageManager());

    const metadata = await engine.openLocalFile(moviePath);

    expect(metadata).toEqual({
      name: 'Home Movie.mp4',
      files: [{ name: 'Home Movie.mp4', size: content.length, path: moviePath }],
      totalSize: content.length,
    });
  });

  it('streams the file over loopback with byte ranges, like a torrent file', async () => {
    createMovie();
    engine = new TorrentEngine(new StorageManager());

    await engine.openLocalFile(moviePath);
    const url = await sentVideoUrl(engine);
    const response = await fetch(url, { headers: { Range: 'bytes=6-10' } });

    expect(new URL(url).hostname).toBe('127.0.0.1');
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes 6-10/${content.length}`);
    expect(await response.text()).toBe('video');
  });

  it('drops the torrent that was playing before', async () => {
    createMovie();
    engine = new TorrentEngine(new StorageManager());
    loadFakeTorrent(engine);

    await engine.openLocalFile(moviePath);

    expect((engine as any).currentTorrent).toBeNull();
  });

  it('keeps playing the previous video when the file cannot be opened', async () => {
    createMovie();
    engine = new TorrentEngine(new StorageManager());
    await engine.openLocalFile(moviePath);
    await streamingServer(engine);

    await expect(engine.openLocalFile(path.join(dir, 'Missing.mp4'))).rejects.toThrow(/ENOENT/);

    expect((engine as any).server?.listening).toBe(true);
  });
});
