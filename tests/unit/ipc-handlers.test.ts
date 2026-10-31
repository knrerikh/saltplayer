import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC_CHANNELS } from '@/shared/types';

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
const listeners = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
const senderWindow = { setFullScreen: vi.fn(), isDestroyed: () => false };
const openExternal = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) =>
      listeners.set(channel, listener),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  shell: { openExternal: (url: string) => openExternal(url) },
  BrowserWindow: { fromWebContents: () => senderWindow },
}));

describe('window:setFullscreen handler', () => {
  beforeEach(async () => {
    handlers.clear();
    senderWindow.setFullScreen.mockClear();
    const { setupIPCHandlers } = await import('@/main/ipc-handlers');
    setupIPCHandlers({} as any, {} as any, {} as any, {} as any, {} as any);
  });

  it.each([true, false])('sets the sending window fullscreen to %s', async (isFullscreen) => {
    await handlers.get(IPC_CHANNELS.WINDOW_SET_FULLSCREEN)?.({ sender: {} }, isFullscreen);

    expect(senderWindow.setFullScreen).toHaveBeenCalledWith(isFullscreen);
  });

  it('ignores anything but a boolean', async () => {
    await handlers.get(IPC_CHANNELS.WINDOW_SET_FULLSCREEN)?.({ sender: {} }, 'yes');

    expect(senderWindow.setFullScreen).not.toHaveBeenCalled();
  });
});

describe('app:openExternal handler (#19)', () => {
  beforeEach(async () => {
    handlers.clear();
    openExternal.mockClear();
    const { setupIPCHandlers } = await import('@/main/ipc-handlers');
    setupIPCHandlers({} as any, {} as any, {} as any, {} as any, {} as any);
  });

  it('opens http(s) URLs', async () => {
    const opened = await handlers.get(IPC_CHANNELS.APP_OPEN_EXTERNAL)?.({}, 'https://example.com/');

    expect(openExternal).toHaveBeenCalledWith('https://example.com/');
    expect(opened).toBe(true);
  });

  it('refuses other schemes without passing them to the OS', async () => {
    const opened = await handlers.get(IPC_CHANNELS.APP_OPEN_EXTERNAL)?.({}, 'file:///etc/passwd');

    expect(openExternal).not.toHaveBeenCalled();
    expect(opened).toBe(false);
  });
});

describe('opening from the page goes through the opener (#33, #31)', () => {
  const metadata = { name: 'Movie.mkv', files: [], totalSize: 1 };
  const opener = { loadTorrent: vi.fn(), openVideoFile: vi.fn() };

  beforeEach(async () => {
    handlers.clear();
    opener.loadTorrent.mockReset().mockResolvedValue(metadata);
    opener.openVideoFile.mockReset().mockResolvedValue(metadata);
    const { setupIPCHandlers } = await import('@/main/ipc-handlers');
    setupIPCHandlers({} as any, {} as any, opener as any, {} as any, {} as any);
  });

  it('media:openFile opens the file and returns what it describes', async () => {
    const result = await handlers.get(IPC_CHANNELS.MEDIA_OPEN_FILE)?.({}, '/Movies/Movie.mkv');

    expect(opener.openVideoFile).toHaveBeenCalledWith('/Movies/Movie.mkv');
    expect(result).toBe(metadata);
  });

  it('torrent:load loads the torrent and returns what it describes', async () => {
    const result = await handlers.get(IPC_CHANNELS.TORRENT_LOAD)?.({}, 'magnet:?xt=urn:btih:aaa');

    expect(opener.loadTorrent).toHaveBeenCalledWith('magnet:?xt=urn:btih:aaa');
    expect(result).toBe(metadata);
  });
});

describe('autoplay next episode (#42)', () => {
  const torrentEngine = { prefetchFile: vi.fn() };
  const settings = { get: vi.fn(() => ({ autoplayNext: false })) };

  beforeEach(async () => {
    handlers.clear();
    torrentEngine.prefetchFile.mockReset().mockResolvedValue(undefined);
    const { setupIPCHandlers } = await import('@/main/ipc-handlers');
    setupIPCHandlers(torrentEngine as any, {} as any, {} as any, settings as any, {} as any);
  });

  it('torrent:prefetchFile fetches the start of the named file', async () => {
    await handlers.get(IPC_CHANNELS.TORRENT_PREFETCH_FILE)?.({}, 'S01E02.mkv');

    expect(torrentEngine.prefetchFile).toHaveBeenCalledWith('S01E02.mkv');
  });

  it('settings:get returns the current settings', async () => {
    expect(await handlers.get(IPC_CHANNELS.SETTINGS_GET)?.({})).toEqual({ autoplayNext: false });
  });
});

describe('playback:savePosition (#51)', () => {
  const history = { record: vi.fn() };

  beforeEach(async () => {
    handlers.clear();
    history.record.mockReset().mockResolvedValue(undefined);
    const { setupIPCHandlers } = await import('@/main/ipc-handlers');
    setupIPCHandlers({} as any, {} as any, {} as any, {} as any, history as any);
  });

  const save = (...args: unknown[]) => handlers.get(IPC_CHANNELS.PLAYBACK_SAVE_POSITION)?.({}, ...args);

  it('records where a file was left', async () => {
    const file = { infoHash: 'aaa', fileName: 'S01E02.mkv' };

    await save(file, 600, 3000);

    expect(history.record).toHaveBeenCalledWith(file, 600, 3000);
  });

  it('records only the fields it knows', async () => {
    await save({ path: '/v/Movie.mkv', fileName: 'Movie.mkv', extra: 1 }, 600, 3000);

    expect(history.record).toHaveBeenCalledWith({ path: '/v/Movie.mkv', fileName: 'Movie.mkv' }, 600, 3000);
  });

  it.each([
    [{ infoHash: 'aaa', fileName: 'x.mkv' }, '600', 3000],
    [{ infoHash: 'aaa', fileName: 'x.mkv' }, 600, NaN],
    [{ infoHash: 'aaa' }, 600, 3000],
    [{ infoHash: 42, fileName: 'x.mkv' }, 600, 3000],
    [null, 600, 3000],
  ])('ignores malformed input %#', async (file, position, duration) => {
    await save(file, position, duration);

    expect(history.record).not.toHaveBeenCalled();
  });
});

describe('remote control (#64)', () => {
  const remote = { status: { enabled: false }, setEnabled: vi.fn(), broadcast: vi.fn() };
  const state = { hasVideo: true, title: 'a.mkv', isPlaying: true, currentTime: 5, duration: 60, volume: 1, muted: false, isFullscreen: false, episodes: [], episodeIndex: -1, hasPrevious: false, hasNext: false };

  beforeEach(async () => {
    handlers.clear();
    listeners.clear();
    remote.setEnabled.mockReset().mockResolvedValue({ enabled: true });
    remote.broadcast.mockReset();
    const { setupIPCHandlers } = await import('@/main/ipc-handlers');
    setupIPCHandlers({} as any, {} as any, {} as any, {} as any, {} as any, remote as any);
  });

  it.each([true, false])('remote:setEnabled(%s) switches the remote and returns its status', async (enabled) => {
    const status = await handlers.get(IPC_CHANNELS.REMOTE_SET_ENABLED)?.({}, enabled);

    expect(remote.setEnabled).toHaveBeenCalledWith(enabled);
    expect(status).toEqual({ enabled: true });
  });

  it('remote:setEnabled ignores anything but a boolean and returns the current status', async () => {
    const status = await handlers.get(IPC_CHANNELS.REMOTE_SET_ENABLED)?.({}, 'yes');

    expect(remote.setEnabled).not.toHaveBeenCalled();
    expect(status).toBe(remote.status);
  });

  it('remote:state broadcasts a well-formed state', () => {
    listeners.get(IPC_CHANNELS.REMOTE_STATE)?.({}, state);

    expect(remote.broadcast).toHaveBeenCalledWith(state);
  });

  it('remote:state drops a malformed state', () => {
    listeners.get(IPC_CHANNELS.REMOTE_STATE)?.({}, { ...state, isPlaying: 'yes' });

    expect(remote.broadcast).not.toHaveBeenCalled();
  });
});
