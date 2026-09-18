import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Contract tests for the magnet-loading fix (see SPEC section 3).
 *
 * These tests are written BEFORE the implementation and are expected to be RED
 * until `src/main/torrent.ts` is changed. They never touch the network: WebTorrent
 * is fully mocked, `electron` is mocked locally (tests/setup.ts only stubs
 * `window.electronAPI`), and the StorageManager is a plain stub.
 *
 * `WebTorrentClass` is cached in the module scope of `src/main/torrent.ts`
 * (line 43), so every test calls `vi.resetModules()` and re-imports the module
 * dynamically.
 */

// Shared mock state. Declared via vi.hoisted so the (re-evaluated) vi.mock factory
// always hands out the same spies across vi.resetModules().
const mocks = vi.hoisted(() => ({
  ctor: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  destroy: vi.fn(),
  on: vi.fn(),
  order: [] as string[],
}));

vi.mock('webtorrent', () => {
  function MockWebTorrent(this: any, opts: any) {
    mocks.ctor(opts);
    this.add = (...args: any[]) => mocks.add(...args);
    this.remove = (...args: any[]) => mocks.remove(...args);
    this.destroy = (...args: any[]) => mocks.destroy(...args);
    this.on = (...args: any[]) => mocks.on(...args);
    this.get = vi.fn();
  }
  // `torrent.ts` probes several export shapes (`default`, `.default`,
  // `.WebTorrent`); a mocked module throws on an undefined export, so expose both.
  return { default: MockWebTorrent, WebTorrent: MockWebTorrent };
});

// `electron` is NOT mocked globally by tests/setup.ts — declare it here.
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

const MAGNET = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Test';
const TORRENT_FILE = '/tmp/saltplayer-tests/example.torrent';
const TEMP_DIR = '/tmp/saltplayer-tests/session-dir';

/** Fallback used only so a missing export does not crash unrelated assertions. */
const FALLBACK_TIMEOUT_MS = 60_000;

const storageStub = {
  ensureInitialized: vi.fn(async () => {}),
  getTempDir: vi.fn(() => TEMP_DIR),
};

function createMockFile(name: string, length: number, offset = 0): any {
  return {
    name,
    path: `Test Torrent/${name}`,
    length,
    offset,
    progress: 0,
    select: vi.fn(),
    deselect: vi.fn(),
    createReadStream: vi.fn(),
  };
}

function createMockTorrent(options: { ready?: boolean; infoHash?: string; files?: any[] } = {}): any {
  const files = options.files ?? [createMockFile('Movie.mp4', 1024)];
  return {
    name: 'Test Torrent',
    infoHash: options.infoHash ?? 'abc123',
    ready: options.ready ?? false,
    files,
    length: files.reduce((sum: number, f: any) => sum + f.length, 0),
    progress: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    numPeers: 0,
    downloaded: 0,
    uploaded: 0,
    timeRemaining: Infinity,
    pieceLength: 16384,
    select: vi.fn(),
    deselect: vi.fn(),
    on: vi.fn(),
  };
}

/** Flush pending microtasks (and any 0ms timers) without advancing the clock. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  }
}

/** Wait until `client.add` has been called at least `count` times (bounded). */
async function waitForAdd(count = 1): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (mocks.add.mock.calls.length >= count) return;
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  }
}

type TorrentModule = typeof import('@/main/torrent');

async function importTorrentModule(): Promise<TorrentModule> {
  return (await import('@/main/torrent')) as TorrentModule;
}

function createEngine(mod: TorrentModule): any {
  return new mod.TorrentEngine(storageStub as any);
}

/** Timeout value under test; falls back so unrelated assertions stay readable. */
function loadTimeoutMs(mod: TorrentModule): number {
  const value = (mod as any).TORRENT_LOAD_TIMEOUT_MS;
  return typeof value === 'number' ? value : FALLBACK_TIMEOUT_MS;
}

/** Tracks settlement of a load() promise without leaving it unhandled. */
function track(promise: Promise<any>): { state: 'pending' | 'resolved' | 'rejected'; value?: any; error?: any } {
  const result: any = { state: 'pending' };
  promise.then(
    (value) => {
      result.state = 'resolved';
      result.value = value;
    },
    (error) => {
      result.state = 'rejected';
      result.error = error;
    }
  );
  return result;
}

/** Drives a full, successful load() so the engine ends up with a currentTorrent. */
async function loadReadyTorrent(engine: any, torrent: any): Promise<void> {
  engine.startStreamingServer = vi.fn();
  engine.startStatusUpdates = vi.fn();

  const before = mocks.add.mock.calls.length;
  mocks.add.mockImplementation((_src: any, _opts: any, cb: any) => {
    mocks.order.push('add');
    queueMicrotask(() => cb(torrent));
    return torrent;
  });

  const tracked = track(engine.load(MAGNET));
  await waitForAdd(before + 1);
  await flush();

  if (tracked.state !== 'resolved') {
    throw new Error(`test setup failed: initial load() did not resolve (state=${tracked.state})`);
  }
}

/**
 * Mirrors webtorrent's real `client.remove` for a torrent that is no longer
 * attached to the client: it is `async`, throws inside (so the RETURNED promise
 * rejects) and never invokes the supplied callback
 * (node_modules/webtorrent/index.js:403-410).
 */
function detachedTorrentRemove(): (...args: any[]) => any {
  return (..._args: any[]) => {
    mocks.order.push('remove');
    return Promise.reject(new Error('No torrent with id detached'));
  };
}

/**
 * Runs `fn` with this process's `unhandledRejection` listeners replaced by a
 * collector, so a rejection escaping the implementation can be asserted on
 * instead of merely polluting the run. Listeners are restored afterwards, after
 * draining the macrotask queue on which Node emits the event.
 */
async function withRejectionCapture<T>(fn: (seen: unknown[]) => Promise<T>): Promise<T> {
  const seen: unknown[] = [];
  const previousListeners = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  const capture = (reason: unknown): void => {
    seen.push(reason);
  };
  process.on('unhandledRejection', capture);

  try {
    return await fn(seen);
  } finally {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
    }
    process.off('unhandledRejection', capture);
    for (const listener of previousListeners) {
      process.on('unhandledRejection', listener as (reason: unknown) => void);
    }
  }
}

describe('TorrentEngine - magnet load contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.order.length = 0;

    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });

    storageStub.ensureInitialized.mockImplementation(async () => {});
    storageStub.getTempDir.mockImplementation(() => TEMP_DIR);

    // Default: add() records the call and returns a torrent instance, but never
    // invokes the ontorrent callback (the "no metadata" scenario).
    mocks.add.mockImplementation(() => {
      mocks.order.push('add');
      return createMockTorrent();
    });
    mocks.remove.mockImplementation((_id: any, _opts: any, cb?: any) => {
      mocks.order.push('remove');
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (typeof callback === 'function') {
        queueMicrotask(() => {
          mocks.order.push('remove-cb');
          callback(null);
        });
      }
    });
    mocks.destroy.mockImplementation((cb?: any) => {
      if (typeof cb === 'function') cb(null);
    });
    mocks.on.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------- A: client
  it('A.1 constructs the WebTorrent client exactly once with utp === false', async () => {
    const mod = await importTorrentModule();
    const engine = createEngine(mod);

    const promise = engine.load(MAGNET);
    const tracked = track(promise);
    await waitForAdd();

    expect(mocks.ctor).toHaveBeenCalledTimes(1);
    const opts = mocks.ctor.mock.calls[0][0];
    expect(opts).toBeTypeOf('object');
    expect(opts.utp).toBe(false);

    expect(tracked.state).toBe('pending');
  });

  it('A.2 keeps the existing client options (downloadLimit, uploadLimit, maxConns)', async () => {
    const mod = await importTorrentModule();
    const engine = createEngine(mod);

    track(engine.load(MAGNET));
    await waitForAdd();

    expect(mocks.ctor).toHaveBeenCalledTimes(1);
    const opts = mocks.ctor.mock.calls[0][0];
    expect(opts.downloadLimit).toBe(-1);
    expect(opts.uploadLimit).toBe(-1);
    expect(opts.maxConns).toBe(100);
  });

  // ------------------------------------------------------------- B: timeout
  it('B.1 exports TORRENT_LOAD_TIMEOUT_MS in [60000, 90000] and uses it for the load timer', async () => {
    const mod = await importTorrentModule();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    try {
      const engine = createEngine(mod);
      track(engine.load(MAGNET));
      await waitForAdd();

      const exported = (mod as any).TORRENT_LOAD_TIMEOUT_MS;
      expect(typeof exported).toBe('number');
      expect(exported).toBeGreaterThanOrEqual(60_000);
      expect(exported).toBeLessThanOrEqual(90_000);

      const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
      expect(delays).toContain(exported);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('B.2 rejects with a Timeout error exactly after TORRENT_LOAD_TIMEOUT_MS and not before', async () => {
    const mod = await importTorrentModule();
    const timeout = loadTimeoutMs(mod);
    const engine = createEngine(mod);

    const tracked = track(engine.load(MAGNET));
    await waitForAdd();

    await vi.advanceTimersByTimeAsync(timeout - 1);
    await flush();
    expect(tracked.state).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);
    await flush();

    expect(tracked.state).toBe('rejected');
    expect(tracked.error).toBeInstanceOf(Error);
    expect(tracked.error.message).toContain('Timeout');
  });

  it('B.3 removes the torrent instance returned by client.add when the timeout fires', async () => {
    const mod = await importTorrentModule();
    const timeout = loadTimeoutMs(mod);
    const engine = createEngine(mod);

    const addedTorrent = createMockTorrent({ infoHash: 'deadbeef' });
    mocks.add.mockImplementation(() => {
      mocks.order.push('add');
      return addedTorrent;
    });

    const tracked = track(engine.load(MAGNET));
    await waitForAdd();

    expect(mocks.remove).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(timeout);
    await flush();

    expect(tracked.state).toBe('rejected');
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove.mock.calls[0][0]).toBe(addedTorrent);
  });

  it('B.4 still rejects with the timeout message when client.remove throws or errors', async () => {
    // Case 1: remove() throws synchronously.
    {
      const mod = await importTorrentModule();
      const timeout = loadTimeoutMs(mod);
      const engine = createEngine(mod);

      mocks.remove.mockImplementation(() => {
        mocks.order.push('remove');
        throw new Error('remove exploded');
      });

      const tracked = track(engine.load(MAGNET));
      await waitForAdd();

      await vi.advanceTimersByTimeAsync(timeout);
      await flush();

      expect(mocks.remove).toHaveBeenCalled();
      expect(tracked.state).toBe('rejected');
      expect(tracked.error).toBeInstanceOf(Error);
      expect(tracked.error.message).toContain('Timeout');
    }

    // Case 2: remove() reports an error through its callback.
    vi.resetModules();
    vi.clearAllMocks();
    mocks.add.mockImplementation(() => createMockTorrent());
    mocks.on.mockImplementation(() => {});
    mocks.remove.mockImplementation((_id: any, _opts: any, cb?: any) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (typeof callback === 'function') {
        queueMicrotask(() => callback(new Error('No torrent with id ...')));
      }
    });

    {
      const mod = await importTorrentModule();
      const timeout = loadTimeoutMs(mod);
      const engine = createEngine(mod);

      const tracked = track(engine.load(MAGNET));
      await waitForAdd();

      await vi.advanceTimersByTimeAsync(timeout);
      await flush();

      expect(mocks.remove).toHaveBeenCalled();
      expect(tracked.state).toBe('rejected');
      expect(tracked.error).toBeInstanceOf(Error);
      expect(tracked.error.message).toContain('Timeout');
    }
  });

  it('B.5 a retry after a timeout adds again and arms its own timer', async () => {
    const mod = await importTorrentModule();
    const timeout = loadTimeoutMs(mod);
    const engine = createEngine(mod);

    const first = track(engine.load(MAGNET));
    await waitForAdd(1);
    await vi.advanceTimersByTimeAsync(timeout);
    await flush();
    expect(first.state).toBe('rejected');

    const second = track(engine.load(MAGNET));
    await waitForAdd(2);

    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(second.state).toBe('pending');

    await vi.advanceTimersByTimeAsync(timeout - 1);
    await flush();
    expect(second.state).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);
    await flush();

    expect(second.state).toBe('rejected');
    expect(second.error).toBeInstanceOf(Error);
    expect(second.error.message).toContain('Timeout');
  });

  it('B.6 a late ontorrent callback neither settles the first promise nor disarms the retry timer', async () => {
    const mod = await importTorrentModule();
    const timeout = loadTimeoutMs(mod);
    const engine = createEngine(mod);

    const staleTorrent = createMockTorrent({ ready: false, infoHash: 'stale' });
    const callbacks: Array<(t: any) => void> = [];
    mocks.add.mockImplementation((_src: any, _opts: any, cb: any) => {
      mocks.order.push('add');
      callbacks.push(cb);
      return staleTorrent;
    });

    const first = track(engine.load(MAGNET));
    await waitForAdd(1);

    await vi.advanceTimersByTimeAsync(timeout);
    await flush();
    expect(first.state).toBe('rejected');
    const firstError = first.error;

    // Second attempt arms a fresh timer.
    const second = track(engine.load(MAGNET));
    await waitForAdd(2);
    expect(second.state).toBe('pending');

    // Now webtorrent's duplicate branch fires the FIRST callback with a stale,
    // not-ready torrent.
    callbacks[0](staleTorrent);
    await flush();

    expect(first.state).toBe('rejected');
    expect(first.error).toBe(firstError);
    expect(second.state).toBe('pending');
    expect((engine as any).currentTorrent).not.toBe(staleTorrent);

    // The stale callback must not have cleared the second attempt's timer.
    await vi.advanceTimersByTimeAsync(timeout);
    await flush();

    expect(second.state).toBe('rejected');
    expect(second.error).toBeInstanceOf(Error);
    expect(second.error.message).toContain('Timeout');
  });

  it('B.7 resolves with metadata on success and disarms the timeout timer', async () => {
    const mod = await importTorrentModule();
    const timeout = loadTimeoutMs(mod);
    const engine = createEngine(mod);

    (engine as any).startStreamingServer = vi.fn();
    (engine as any).startStatusUpdates = vi.fn();

    const videoFile = createMockFile('Movie.mp4', 2048);
    const readyTorrent = createMockTorrent({ ready: true, infoHash: 'feedface', files: [videoFile] });
    mocks.add.mockImplementation((_src: any, _opts: any, cb: any) => {
      mocks.order.push('add');
      queueMicrotask(() => cb(readyTorrent));
      return readyTorrent;
    });

    const tracked = track(engine.load(MAGNET));
    await waitForAdd();
    await flush();

    expect(tracked.state).toBe('resolved');
    expect(tracked.value).toMatchObject({
      name: 'Test Torrent',
      infoHash: 'feedface',
      totalSize: 2048,
    });

    mocks.remove.mockClear();
    await vi.advanceTimersByTimeAsync(timeout * 2);
    await flush();

    expect(tracked.state).toBe('resolved');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('B.8 awaits removal of the previous torrent before calling client.add again', async () => {
    const mod = await importTorrentModule();
    const engine = createEngine(mod);

    (engine as any).startStreamingServer = vi.fn();
    (engine as any).startStatusUpdates = vi.fn();

    const videoFile = createMockFile('Movie.mp4', 2048);
    const readyTorrent = createMockTorrent({ ready: true, infoHash: 'first-hash', files: [videoFile] });
    mocks.add.mockImplementation((_src: any, _opts: any, cb: any) => {
      mocks.order.push('add');
      queueMicrotask(() => cb(readyTorrent));
      return readyTorrent;
    });

    const first = track(engine.load(MAGNET));
    await waitForAdd(1);
    await flush();
    expect(first.state).toBe('resolved');

    // Second load: the previous torrent must be removed (callback included)
    // strictly before the new client.add.
    mocks.order.length = 0;
    mocks.add.mockImplementation(() => {
      mocks.order.push('add');
      return createMockTorrent();
    });

    track(engine.load(MAGNET));
    await waitForAdd(2);
    await flush();

    expect(mocks.remove).toHaveBeenCalled();
    expect(mocks.order).toEqual(['remove', 'remove-cb', 'add']);
  });


  it('B.9 stop() resolves when client.remove rejects its promise without invoking the callback', async () => {
    const mod = await importTorrentModule();
    const engine = createEngine(mod);

    const readyTorrent = createMockTorrent({
      ready: true,
      infoHash: 'detached',
      files: [createMockFile('Movie.mp4', 2048)],
    });
    await loadReadyTorrent(engine, readyTorrent);

    mocks.remove.mockImplementation(detachedTorrentRemove());

    // The escaping rejection itself is asserted on by B.10; here we only care
    // that stop() does not hang, so the noise is swallowed.
    await withRejectionCapture(async () => {
      const stopped = track(engine.stop());
      await flush();
      // Generous virtual time: any sane recovery (catch on the returned promise
      // or a watchdog) must have settled stop() well within this window.
      await vi.advanceTimersByTimeAsync(10_000);
      await flush();

      expect(mocks.remove).toHaveBeenCalled();
      expect(stopped.state).toBe('resolved');
    });
  });

  it('B.10 no client.remove call leaves an unhandled promise rejection', async () => {
    await withRejectionCapture(async (seen) => {
      // Unhandled rejections surface on a macrotask tick; setImmediate is not faked.
      const drain = async (): Promise<void> => {
        for (let i = 0; i < 5; i++) {
          await flush();
          await new Promise((resolve) => setImmediate(resolve));
        }
      };

      // (a) stop(): remove() rejects asynchronously and never calls the callback.
      {
        const mod = await importTorrentModule();
        const engine = createEngine(mod);
        const readyTorrent = createMockTorrent({
          ready: true,
          infoHash: 'detached',
          files: [createMockFile('Movie.mp4', 2048)],
        });
        await loadReadyTorrent(engine, readyTorrent);

        mocks.remove.mockImplementation(detachedTorrentRemove());
        track(engine.stop());
        await drain();

        expect(seen, 'client.remove rejection in stop() must be handled').toEqual([]);
      }

      // (b) load() timeout branch: same asynchronous rejection.
      {
        vi.resetModules();
        const mod = await importTorrentModule();
        const timeout = loadTimeoutMs(mod);
        const engine = createEngine(mod);

        mocks.add.mockImplementation(() => {
          mocks.order.push('add');
          return createMockTorrent();
        });
        mocks.remove.mockImplementation(detachedTorrentRemove());

        const tracked = track(engine.load(MAGNET));
        await waitForAdd(mocks.add.mock.calls.length + 1);
        await vi.advanceTimersByTimeAsync(timeout);
        await drain();

        expect(tracked.state).toBe('rejected');
        expect(seen, 'client.remove rejection in the load() timeout branch must be handled').toEqual([]);
      }

      // (c) remove() may legitimately return a non-promise (undefined) — the
      //     rejection handling must not assume a thenable.
      {
        vi.resetModules();
        const mod = await importTorrentModule();
        const engine = createEngine(mod);
        const readyTorrent = createMockTorrent({
          ready: true,
          infoHash: 'plain',
          files: [createMockFile('Movie.mp4', 2048)],
        });
        await loadReadyTorrent(engine, readyTorrent);

        mocks.remove.mockImplementation((_id: any, _opts: any, cb?: any) => {
          mocks.order.push('remove');
          const callback = typeof _opts === 'function' ? _opts : cb;
          if (typeof callback === 'function') queueMicrotask(() => callback(null));
          return undefined;
        });

        const stopped = track(engine.stop());
        await drain();

        expect(stopped.state).toBe('resolved');
        expect(seen).toEqual([]);
      }
    });
  });

  it('B.11 a load() after the previous torrent was detached still reaches client.add and its own timeout', async () => {
    const mod = await importTorrentModule();
    const timeout = loadTimeoutMs(mod);
    const engine = createEngine(mod);

    const readyTorrent = createMockTorrent({
      ready: true,
      infoHash: 'detached',
      files: [createMockFile('Movie.mp4', 2048)],
    });
    await loadReadyTorrent(engine, readyTorrent);
    expect(mocks.add).toHaveBeenCalledTimes(1);

    // The previous torrent detached itself from the client; removing it rejects.
    mocks.remove.mockImplementation(detachedTorrentRemove());
    // The next attempt never receives metadata.
    mocks.add.mockImplementation(() => {
      mocks.order.push('add');
      return createMockTorrent();
    });

    await withRejectionCapture(async () => {
      const second = track(engine.load(MAGNET));
      await waitForAdd(2);
      if (mocks.add.mock.calls.length < 2) {
        // Give a watchdog-style recovery a chance before declaring a hang.
        await vi.advanceTimersByTimeAsync(10_000);
        await flush();
      }

      // Must not be stuck forever inside `await this.stop()`.
      expect(mocks.add).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(timeout);
      await flush();

      expect(second.state).toBe('rejected');
      expect(second.error).toBeInstanceOf(Error);
      expect(second.error.message).toContain('Timeout');
    });
  });

  // --------------------------------------------------------- C: client.add
  it('C.1 calls client.add with (source, options object, callback)', async () => {
    const mod = await importTorrentModule();
    const engine = createEngine(mod);

    track(engine.load(MAGNET));
    await waitForAdd();

    expect(mocks.add).toHaveBeenCalledTimes(1);
    const args = mocks.add.mock.calls[0];
    expect(args).toHaveLength(3);
    expect(args[0]).toBe(MAGNET);
    expect(args[1]).toBeTypeOf('object');
    expect(args[1]).not.toBeNull();
    expect(args[2]).toBeTypeOf('function');
  });

  it('C.2 passes options.path equal to storageManager.getTempDir()', async () => {
    const mod = await importTorrentModule();
    const engine = createEngine(mod);

    track(engine.load(MAGNET));
    await waitForAdd();

    const options = mocks.add.mock.calls[0][1];
    expect(options.path).toBe(TEMP_DIR);
    expect(storageStub.getTempDir).toHaveBeenCalled();
  });

  it('C.3 passes the exported FALLBACK_TRACKERS array as options.announce', async () => {
    const mod = await importTorrentModule();
    const engine = createEngine(mod);

    track(engine.load(MAGNET));
    await waitForAdd();

    const options = mocks.add.mock.calls[0][1];
    expect(Array.isArray(options.announce)).toBe(true);
    expect(options.announce.length).toBeGreaterThanOrEqual(3);
    for (const tracker of options.announce) {
      expect(typeof tracker).toBe('string');
      expect(tracker).toMatch(/^(udp|https?):\/\//);
    }
    expect(new Set(options.announce).size).toBe(options.announce.length);

    const exported = (mod as any).FALLBACK_TRACKERS;
    expect(Array.isArray(exported)).toBe(true);
    expect(options.announce).toEqual(exported);
  });

  it('C.4 sends the same announce list for a magnet and for a .torrent path', async () => {
    const mod = await importTorrentModule();
    const timeout = loadTimeoutMs(mod);
    const engine = createEngine(mod);

    const first = track(engine.load(MAGNET));
    await waitForAdd(1);
    await vi.advanceTimersByTimeAsync(timeout);
    await flush();
    expect(first.state).toBe('rejected');

    track(engine.load(TORRENT_FILE));
    await waitForAdd(2);

    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(mocks.add.mock.calls[0][0]).toBe(MAGNET);
    expect(mocks.add.mock.calls[1][0]).toBe(TORRENT_FILE);

    const announceA = mocks.add.mock.calls[0][1].announce;
    const announceB = mocks.add.mock.calls[1][1].announce;
    expect(announceA).toBeDefined();
    expect(announceB).toEqual(announceA);
  });
});
