import { IPC_CHANNELS } from '@/shared/types';

interface FullscreenSource {
  on(event: 'enter-full-screen' | 'leave-full-screen', listener: () => void): unknown;
  isDestroyed(): boolean;
  webContents: { send(channel: string, ...args: unknown[]): void };
}

/**
 * Window-level fullscreen (the macOS green button, ⌃⌘F) bypasses the Fullscreen API,
 * so the renderer cannot see it. Forward it so the UI can hide window chrome such as
 * the status bar.
 */
export function forwardFullscreenState(window: FullscreenSource): void {
  const send = (isFullscreen: boolean) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.WINDOW_FULLSCREEN, isFullscreen);
    }
  };
  window.on('enter-full-screen', () => send(true));
  window.on('leave-full-screen', () => send(false));
}
