import { ipcMain, shell, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@/shared/types';
import { TorrentEngine } from './torrent';
import { StorageManager } from './storage';

export function setupIPCHandlers(
  torrentEngine: TorrentEngine,
  storageManager: StorageManager
): void {
  // Re-registering would throw ("second handler for ..."), so drop any handlers
  // left over from a previous initializeApp() before wiring the new instances up.
  for (const channel of [
    IPC_CHANNELS.TORRENT_LOAD,
    IPC_CHANNELS.TORRENT_STOP,
    IPC_CHANNELS.TORRENT_SELECT_FILE,
    IPC_CHANNELS.PLAYBACK_CONTROL,
    IPC_CHANNELS.PLAYBACK_SEEK,
    IPC_CHANNELS.APP_QUIT,
    IPC_CHANNELS.AUDIO_SELECT,
    IPC_CHANNELS.APP_OPEN_EXTERNAL,
    IPC_CHANNELS.WINDOW_DRAG_START,
    IPC_CHANNELS.WINDOW_DRAG_END,
  ]) {
    ipcMain.removeHandler(channel);
  }
  ipcMain.removeAllListeners(IPC_CHANNELS.WINDOW_DRAG_MOVE);

  // Load torrent or magnet link
  ipcMain.handle(IPC_CHANNELS.TORRENT_LOAD, async (_, source: string) => {
    try {
      const metadata = await torrentEngine.load(source);
      return metadata;
    } catch (error: any) {
      console.error('Error loading torrent:', error);
      throw error;
    }
  });

  // Stop current torrent
  ipcMain.handle(IPC_CHANNELS.TORRENT_STOP, async () => {
    try {
      await torrentEngine.stop();
    } catch (error) {
      console.error('Error stopping torrent:', error);
      throw error;
    }
  });

  // Select specific file
  ipcMain.handle(IPC_CHANNELS.TORRENT_SELECT_FILE, async (_, fileName: string) => {
    try {
      await torrentEngine.selectFile(fileName);
    } catch (error) {
      console.error('Error selecting file:', error);
      throw error;
    }
  });

  // Playback control
  ipcMain.handle(IPC_CHANNELS.PLAYBACK_CONTROL, async (_, action: string) => {
    try {
      await torrentEngine.controlPlayback(action as 'play' | 'pause' | 'stop');
    } catch (error) {
      console.error('Error controlling playback:', error);
      throw error;
    }
  });

  // Playback seek
  ipcMain.handle(IPC_CHANNELS.PLAYBACK_SEEK, async (_, time: number) => {
    try {
      await torrentEngine.seek(time);
    } catch (error) {
      console.error('Error seeking:', error);
      throw error;
    }
  });

  // Quit application
  ipcMain.handle(IPC_CHANNELS.APP_QUIT, async () => {
    try {
      await torrentEngine.destroy();
      await storageManager.cleanup();
      process.exit(0);
    } catch (error) {
      console.error('Error during quit:', error);
      process.exit(1);
    }
  });

  // Select audio track
  ipcMain.handle(IPC_CHANNELS.AUDIO_SELECT, async (_, streamIndex: number) => {
    try {
      await torrentEngine.selectAudioTrack(streamIndex);
    } catch (error) {
      console.error('Error selecting audio track:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_, url: string) => {
    await shell.openExternal(url);
    return true;
  });

  // Window dragging. The window is frameless (titleBarStyle: 'hiddenInset'), so the
  // renderer drives the move: it reports pointer deltas and the main process applies
  // them to the window position. A CSS -webkit-app-region strip would do this natively,
  // but it also swallows every click in that strip, which killed click-to-pause on the
  // top of the video.
  let dragging = false;

  ipcMain.handle(IPC_CHANNELS.WINDOW_DRAG_START, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    dragging = !!win && !win.isFullScreen();
    return dragging;
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_DRAG_MOVE, (event, dx: number, dy: number) => {
    if (!dragging || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || win.isFullScreen()) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_DRAG_END, () => {
    dragging = false;
  });
}
