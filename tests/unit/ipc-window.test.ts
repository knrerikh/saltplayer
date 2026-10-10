import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC_CHANNELS } from '@/shared/types';

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
const senderWindow = { setFullScreen: vi.fn(), isDestroyed: () => false };

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  shell: { openExternal: vi.fn() },
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
