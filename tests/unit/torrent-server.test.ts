import { describe, it, expect, vi, afterEach } from 'vitest';
import { once } from 'events';
import type { AddressInfo, Server } from 'net';
import { TorrentEngine } from '@/main/torrent';
import { StorageManager } from '@/main/storage';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
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
