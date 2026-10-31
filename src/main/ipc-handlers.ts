import { ipcMain, shell, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@/shared/types';
import { TorrentEngine } from './torrent';
import { StorageManager } from './storage';
import { isSafeExternalUrl } from './external-url';
import { MediaOpener } from './media-opener';
import { Settings } from './settings';
import { WatchHistory } from './watch-history';
import type { WatchedFile } from '@/shared/playback-key';
import { parseRemoteState } from '@/shared/remote';
import type { RemoteControl } from './remote-control/remote-control';

const optionalString = (value: unknown) => value === undefined || typeof value === 'string';

/** The page says which file it played; take only well-formed fields. */
function watchedFile(value: unknown): WatchedFile | null {
  const { infoHash, path, fileName } = (value ?? {}) as Record<string, unknown>;
  if (typeof fileName !== 'string' || !optionalString(infoHash) || !optionalString(path)) return null;
  return {
    ...(infoHash !== undefined && { infoHash: infoHash as string }),
    ...(path !== undefined && { path: path as string }),
    fileName,
  };
}

export function setupIPCHandlers(
  torrentEngine: TorrentEngine,
  storageManager: StorageManager,
  opener: MediaOpener,
  settings: Settings,
  watchHistory: WatchHistory,
  remote: RemoteControl
): void {
  // Re-registering would throw ("second handler for ..."), so drop any handlers
  // left over from a previous initializeApp() before wiring the new instances up.
  for (const channel of [
    IPC_CHANNELS.TORRENT_LOAD,
    IPC_CHANNELS.MEDIA_OPEN_FILE,
    IPC_CHANNELS.TORRENT_STOP,
    IPC_CHANNELS.TORRENT_SELECT_FILE,
    IPC_CHANNELS.TORRENT_PREFETCH_FILE,
    IPC_CHANNELS.SETTINGS_GET,
    IPC_CHANNELS.PLAYBACK_CONTROL,
    IPC_CHANNELS.PLAYBACK_SEEK,
    IPC_CHANNELS.PLAYBACK_SAVE_POSITION,
    IPC_CHANNELS.APP_QUIT,
    IPC_CHANNELS.AUDIO_SELECT,
    IPC_CHANNELS.APP_OPEN_EXTERNAL,
    IPC_CHANNELS.WINDOW_DRAG_START,
    IPC_CHANNELS.WINDOW_DRAG_END,
    IPC_CHANNELS.WINDOW_SET_FULLSCREEN,
    IPC_CHANNELS.REMOTE_SET_ENABLED,
    IPC_CHANNELS.REMOTE_RESET_LINK,
    IPC_CHANNELS.REMOTE_GET_STATUS,
    IPC_CHANNELS.REMOTE_SET_AT_LAUNCH,
  ]) {
    ipcMain.removeHandler(channel);
  }
  ipcMain.removeAllListeners(IPC_CHANNELS.WINDOW_DRAG_MOVE);
  ipcMain.removeAllListeners(IPC_CHANNELS.REMOTE_STATE);

  // Load torrent or magnet link
  ipcMain.handle(IPC_CHANNELS.TORRENT_LOAD, async (_, source: string) => {
    try {
      return await opener.loadTorrent(source);
    } catch (error: any) {
      console.error('Error loading torrent:', error);
      throw error;
    }
  });

  // Play a video file from disk
  ipcMain.handle(IPC_CHANNELS.MEDIA_OPEN_FILE, (_, filePath: string) =>
    opener.openVideoFile(filePath)
  );

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

  // Fetch the start of the next episode before the current one ends
  ipcMain.handle(IPC_CHANNELS.TORRENT_PREFETCH_FILE, (_, fileName: string) =>
    torrentEngine.prefetchFile(fileName)
  );

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => settings.get());

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

  // Where the page left a file, for resuming it later
  ipcMain.handle(
    IPC_CHANNELS.PLAYBACK_SAVE_POSITION,
    (_, file: unknown, position: unknown, duration: unknown) => {
      const watched = watchedFile(file);
      if (!watched || !Number.isFinite(position) || !Number.isFinite(duration)) return;
      return watchHistory.record(watched, position as number, duration as number);
    }
  );

  // Remote control: the dialog's switch, and the player state the phone shows
  ipcMain.handle(IPC_CHANNELS.REMOTE_SET_ENABLED, (_, enabled: unknown) =>
    typeof enabled === 'boolean' ? remote.setEnabled(enabled) : remote.status
  );

  ipcMain.handle(IPC_CHANNELS.REMOTE_RESET_LINK, () => remote.resetLink());

  // The remote may already be on when the page loads (Start at launch)
  ipcMain.handle(IPC_CHANNELS.REMOTE_GET_STATUS, () => remote.status);

  ipcMain.handle(IPC_CHANNELS.REMOTE_SET_AT_LAUNCH, (_, remoteAtLaunch: unknown) => {
    if (typeof remoteAtLaunch === 'boolean') return settings.set({ remoteAtLaunch });
  });

  ipcMain.on(IPC_CHANNELS.REMOTE_STATE, (_, state: unknown) => {
    const parsed = parseRemoteState(state);
    if (parsed) remote.broadcast(parsed);
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

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_, url: unknown) => {
    if (!isSafeExternalUrl(url)) return false;
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

  // All fullscreen is window fullscreen: the HTML Fullscreen API would let Chromium
  // handle Esc itself, before the page can close an open menu first.
  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_FULLSCREEN, (event, isFullscreen: unknown) => {
    if (typeof isFullscreen !== 'boolean') return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.setFullScreen(isFullscreen);
  });
}
