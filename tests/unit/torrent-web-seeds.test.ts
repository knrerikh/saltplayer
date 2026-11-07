import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WEB_SEED_FALLBACK_MS } from '@/main/web-seed-fallback';

const ctor = vi.hoisted(() => vi.fn());

vi.mock('webtorrent', () => {
  function MockWebTorrent(this: any, opts: any) {
    ctor(opts);
    this.on = vi.fn();
  }
  return { default: MockWebTorrent, WebTorrent: MockWebTorrent };
});

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: vi.fn(() => []) } }));

const URLS = ['https://seed.example/a/', 'https://seed.example/b/'];

function mockTorrent(overrides: Record<string, unknown> = {}): any {
  return { numPeers: 0, done: false, destroyed: false, urlList: URLS, addWebSeed: vi.fn(), ...overrides };
}

async function createEngine(): Promise<any> {
  const { TorrentEngine } = await import('@/main/torrent');
  return new TorrentEngine({ ensureInitialized: vi.fn(), getTempDir: vi.fn() } as any);
}

describe('TorrentEngine web seeds (#108)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts WebTorrent without web seeds', async () => {
    const engine = await createEngine();

    await engine.initializeClient();

    // A web seed that never answers keeps a piece reserved, so no peer can take it.
    expect(ctor).toHaveBeenCalledWith(expect.objectContaining({ webSeeds: false }));
  });

  it('adds the torrent web seeds after 15 s without peers', async () => {
    const engine = await createEngine();
    const torrent = mockTorrent();

    engine.watchForWebSeedFallback(torrent);
    await vi.advanceTimersByTimeAsync(WEB_SEED_FALLBACK_MS - 1000);
    expect(torrent.addWebSeed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);
    expect(torrent.addWebSeed.mock.calls).toEqual(URLS.map((url) => [url]));

    await vi.advanceTimersByTimeAsync(60_000);
    expect(torrent.addWebSeed).toHaveBeenCalledTimes(URLS.length);
  });

  it('never adds them while peers are connected', async () => {
    const engine = await createEngine();
    const torrent = mockTorrent({ numPeers: 3 });

    engine.watchForWebSeedFallback(torrent);
    await vi.advanceTimersByTimeAsync(5 * WEB_SEED_FALLBACK_MS);

    expect(torrent.addWebSeed).not.toHaveBeenCalled();
  });

  it('waits 15 s again after the peers drop to 0', async () => {
    const engine = await createEngine();
    const torrent = mockTorrent({ numPeers: 2 });

    engine.watchForWebSeedFallback(torrent);
    await vi.advanceTimersByTimeAsync(40_000);
    torrent.numPeers = 0;
    await vi.advanceTimersByTimeAsync(WEB_SEED_FALLBACK_MS - 2000);
    expect(torrent.addWebSeed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(torrent.addWebSeed).toHaveBeenCalledTimes(URLS.length);
  });

  it('does not touch a complete torrent', async () => {
    const engine = await createEngine();
    const torrent = mockTorrent({ done: true });

    engine.watchForWebSeedFallback(torrent);
    await vi.advanceTimersByTimeAsync(2 * WEB_SEED_FALLBACK_MS);

    expect(torrent.addWebSeed).not.toHaveBeenCalled();
  });

  it('clears the timer on stop()', async () => {
    const engine = await createEngine();
    const torrent = mockTorrent();

    engine.watchForWebSeedFallback(torrent);
    expect(vi.getTimerCount()).toBe(1);
    await engine.stop();

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2 * WEB_SEED_FALLBACK_MS);
    expect(torrent.addWebSeed).not.toHaveBeenCalled();
  });

  it('clears the timer on destroy()', async () => {
    const engine = await createEngine();

    engine.watchForWebSeedFallback(mockTorrent());
    await engine.destroy();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops watching a torrent that was destroyed', async () => {
    const engine = await createEngine();
    const torrent = mockTorrent();

    engine.watchForWebSeedFallback(torrent);
    torrent.destroyed = true;
    await vi.advanceTimersByTimeAsync(2000);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops watching once the web seeds are added, or once the torrent is complete', async () => {
    const engine = await createEngine();
    const torrent = mockTorrent();
    engine.watchForWebSeedFallback(torrent);
    await vi.advanceTimersByTimeAsync(WEB_SEED_FALLBACK_MS + 1000);
    expect(vi.getTimerCount()).toBe(0);

    const complete = mockTorrent();
    engine.watchForWebSeedFallback(complete);
    complete.done = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
