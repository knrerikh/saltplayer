import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { forwardFullscreenState } from '@/main/window-fullscreen';
import { IPC_CHANNELS } from '@/shared/types';

function fakeWindow() {
  const window = Object.assign(new EventEmitter(), {
    webContents: { send: vi.fn() },
    isDestroyed: () => false,
  });
  return window;
}

describe('forwardFullscreenState', () => {
  it('tells the renderer when the window enters fullscreen', () => {
    const window = fakeWindow();
    forwardFullscreenState(window);

    window.emit('enter-full-screen');

    expect(window.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_FULLSCREEN, true);
  });

  it('tells the renderer when the window leaves fullscreen', () => {
    const window = fakeWindow();
    forwardFullscreenState(window);

    window.emit('leave-full-screen');

    expect(window.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_FULLSCREEN, false);
  });

  it('does not send to a destroyed window', () => {
    const window = Object.assign(fakeWindow(), { isDestroyed: () => true });
    forwardFullscreenState(window);

    window.emit('leave-full-screen');

    expect(window.webContents.send).not.toHaveBeenCalled();
  });
});
