import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC_CHANNELS } from '@/shared/types';

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
const senderWindow = { setFullScreen: vi.fn(), isDestroyed: () => false };
const openExternal = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    on: vi.fn(),
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
    setupIPCHandlers({} as any, {} as any);
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
    setupIPCHandlers({} as any, {} as any);
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
