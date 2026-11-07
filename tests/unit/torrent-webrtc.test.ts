import { describe, it, expect, vi } from 'vitest';

// WebTorrent is mocked so no sockets are opened; the test only inspects how the
// engine configures the client. `torrent.ts` caches the class at module scope,
// hence the dynamic import after vi.resetModules().
const ctor = vi.hoisted(() => vi.fn());

vi.mock('webtorrent', () => {
  function MockWebTorrent(this: any, opts: any) {
    ctor(opts);
    this.on = vi.fn();
  }
  return { default: MockWebTorrent, WebTorrent: MockWebTorrent };
});

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

describe('WebTorrent client options', () => {
  it('turns WebRTC off for trackers, so wss:// trackers are skipped instead of creating peers (#106)', async () => {
    vi.resetModules();
    const { TorrentEngine } = await import('@/main/torrent');
    const engine: any = new TorrentEngine({ ensureInitialized: vi.fn(), getTempDir: vi.fn() } as any);

    await engine.initializeClient();

    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor.mock.calls[0][0].tracker).toEqual({ wrtc: false });
  });
});
