import { describe, it, expect, vi, afterEach } from 'vitest';
import { once } from 'events';
import * as http from 'http';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo, Server } from 'net';
import { TorrentEngine } from '@/main/torrent';
import { StorageManager } from '@/main/storage';
import { IPC_CHANNELS } from '@/shared/types';

const send = vi.fn();

/** Room for a cold ffprobe start on a CI runner, beyond the engine's own 10 s probe timeout. */
const PROBE_TIMEOUT_MS = 25_000;

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

/** The address of the file the engine is serving, read from the server itself. */
async function streamUrl(engine: TorrentEngine, fileName: string): Promise<string> {
  const { port } = (await streamingServer(engine)).address() as AddressInfo;
  return `http://127.0.0.1:${port}/${encodeURIComponent(fileName)}`;
}

/**
 * The URL this engine hands the player. It is sent only after the real ffprobe has
 * probed the stream, which can take seconds on CI runners. Engines from earlier
 * tests may still be finishing their probe, so match the port.
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
    { timeout: PROBE_TIMEOUT_MS },
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

describe('Closing a streaming server (#76)', () => {
  let engine: TorrentEngine;
  let silentServer: http.Server | undefined;

  afterEach(async () => {
    await engine.destroy();
    silentServer?.closeAllConnections();
    silentServer?.close();
    silentServer = undefined;
    send.mockClear();
  });

  /** A torrent file whose stream delivers one chunk and then stays open, like a video still being read. */
  function loadEndlessTorrent(): void {
    const file = loadFakeTorrent(engine);
    file.createReadStream.mockImplementation(() => {
      const stream = new Readable({ read() {} });
      stream.push(Buffer.alloc(16));
      return stream;
    });
  }

  async function startStreaming(): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const response = await fetch(await streamUrl(engine, 'Movie.mp4'), { headers: { Range: 'bytes=0-1023' } });
    const reader = response.body!.getReader();
    await reader.read();
    return reader;
  }

  /** A URL that accepts connections and never answers, so ffprobe waits on it. */
  async function unresponsiveUrl(): Promise<string> {
    silentServer = http.createServer(() => {}).listen(0, '127.0.0.1');
    await once(silentServer, 'listening');
    return `http://127.0.0.1:${(silentServer.address() as AddressInfo).port}/movie.mp4`;
  }

  function runningProbe() {
    const [probe] = (engine as any).probes;
    return probe;
  }

  it('ends a response that is still streaming when the engine stops', async () => {
    engine = new TorrentEngine(new StorageManager());
    loadEndlessTorrent();
    await engine.selectFile('Movie.mp4');
    const reader = await startStreaming();
    const server: Server = (engine as any).server;

    await engine.stop();

    await expect(reader.read()).rejects.toThrow(/terminated/);
    expect(server.listening).toBe(false);
  });

  it('ends the responses of the server a file switch replaces', async () => {
    engine = new TorrentEngine(new StorageManager());
    loadEndlessTorrent();
    await engine.selectFile('Movie.mp4');
    const reader = await startStreaming();

    await engine.selectFile('Movie.mp4');

    await expect(reader.read()).rejects.toThrow(/terminated/);
  });

  it('kills the ffprobe that is probing the stream when the engine stops', async () => {
    engine = new TorrentEngine(new StorageManager());
    const probing = (engine as any).probeStream(await unresponsiveUrl());
    const probe = runningProbe();

    await engine.stop();
    await once(probe, 'close');

    expect(probe.killed).toBe(true);
    expect((engine as any).probes.size).toBe(0);
    await probing;
  });

  it('kills the ffprobe listing subtitles without reporting tracks when the engine is destroyed', async () => {
    engine = new TorrentEngine(new StorageManager());
    (engine as any).extractSubtitles(await unresponsiveUrl());
    const probe = runningProbe();

    await engine.destroy();
    await once(probe, 'close');

    expect(probe.killed).toBe(true);
    expect(send).not.toHaveBeenCalledWith(IPC_CHANNELS.SUBTITLES, expect.anything());
  });

  it('kills the ffprobe of the server a file switch replaces', async () => {
    engine = new TorrentEngine(new StorageManager());
    loadFakeTorrent(engine);
    (engine as any).probeStream(await unresponsiveUrl());
    const probe = runningProbe();

    await engine.selectFile('Movie.mp4');
    await once(probe, 'close');

    expect(probe.killed).toBe(true);
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
    // Not `saltplayer-*`: StorageManager deletes those as stale sessions, even mid-test.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-video-engine-test-'));
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
    const response = await fetch(await streamUrl(engine, 'Home Movie.mp4'), {
      headers: { Range: 'bytes=6-10' },
    });

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

  it('sends nothing for a stream stopped before its server started listening', async () => {
    createMovie();
    engine = new TorrentEngine(new StorageManager());
    await engine.openLocalFile(moviePath);

    await engine.stop();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sent = send.mock.calls.filter(([channel]) => channel === IPC_CHANNELS.VIDEO_URL);
    expect(sent).toEqual([]);
  });

  it('sends only the URL of the file opened last when files are switched quickly', async () => {
    createMovie();
    const otherPath = path.join(dir, 'Other.mp4');
    fs.writeFileSync(otherPath, content);
    engine = new TorrentEngine(new StorageManager());

    await engine.openLocalFile(moviePath);
    await engine.openLocalFile(otherPath);
    const url = await sentVideoUrl(engine);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const sent = send.mock.calls.filter(([channel]) => channel === IPC_CHANNELS.VIDEO_URL);
    expect(sent).toEqual([[IPC_CHANNELS.VIDEO_URL, url, null]]);
    expect(new URL(url).pathname).toBe('/Other.mp4');
  }, PROBE_TIMEOUT_MS + 5_000);

  it('sends where to resume the file along with its URL (#51)', async () => {
    createMovie();
    const history = { resumePosition: vi.fn(() => 595), lastWatched: vi.fn(() => null) };
    engine = new TorrentEngine(new StorageManager(), history);

    await engine.openLocalFile(moviePath);
    const url = await sentVideoUrl(engine);

    expect(history.resumePosition).toHaveBeenCalledWith(moviePath);
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.VIDEO_URL, url, 595);
  }, PROBE_TIMEOUT_MS + 5_000);

  it('keeps playing the previous video when the file cannot be opened', async () => {
    createMovie();
    engine = new TorrentEngine(new StorageManager());
    await engine.openLocalFile(moviePath);
    await streamingServer(engine);

    await expect(engine.openLocalFile(path.join(dir, 'Missing.mp4'))).rejects.toThrow(/ENOENT/);

    expect((engine as any).server?.listening).toBe(true);
  });
});
