import { ipcMain, shell } from 'electron';
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
  ]) {
    ipcMain.removeHandler(channel);
  }

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
}
