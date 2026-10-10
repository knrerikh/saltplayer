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

describe('window:exitFullscreen handler', () => {
  beforeEach(async () => {
    handlers.clear();
    senderWindow.setFullScreen.mockClear();
    const { setupIPCHandlers } = await import('@/main/ipc-handlers');
    setupIPCHandlers({} as any, {} as any);
  });

  it('takes the sending window out of fullscreen', async () => {
    await handlers.get(IPC_CHANNELS.WINDOW_EXIT_FULLSCREEN)?.({ sender: {} });

    expect(senderWindow.setFullScreen).toHaveBeenCalledWith(false);
  });
});
