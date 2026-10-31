import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, TorrentStatus, TorrentMetadata, ErrorInfo, SubtitleData, AudioData, MenuCommand, AppSettings } from '@/shared/types';
import type { WatchedFile } from '@/shared/playback-key';
import type { RemoteCommand, RemoteState, RemoteStatus } from '@/shared/remote';

// Expose safe API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Torrent operations
  loadTorrent: (source: string) => ipcRenderer.invoke(IPC_CHANNELS.TORRENT_LOAD, source),
  openVideoFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_OPEN_FILE, filePath),
  stopTorrent: () => ipcRenderer.invoke(IPC_CHANNELS.TORRENT_STOP),
  selectFile: (fileName: string) => ipcRenderer.invoke(IPC_CHANNELS.TORRENT_SELECT_FILE, fileName),
  prefetchFile: (fileName: string) => ipcRenderer.invoke(IPC_CHANNELS.TORRENT_PREFETCH_FILE, fileName),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  
  // Playback control
  playbackControl: (action: 'play' | 'pause' | 'stop') => 
    ipcRenderer.invoke(IPC_CHANNELS.PLAYBACK_CONTROL, action),
  playbackSeek: (time: number) => 
    ipcRenderer.invoke(IPC_CHANNELS.PLAYBACK_SEEK, time),
  savePlaybackPosition: (file: WatchedFile, position: number, duration: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLAYBACK_SAVE_POSITION, file, position, duration),
  selectAudioTrack: (streamIndex: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIO_SELECT, streamIndex),
  
  // Window dragging (the frameless window has no native title bar to grab)
  startWindowDrag: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_DRAG_START),
  moveWindowBy: (dx: number, dy: number) =>
    ipcRenderer.send(IPC_CHANNELS.WINDOW_DRAG_MOVE, dx, dy),
  endWindowDrag: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_DRAG_END),
  setWindowFullscreen: (isFullscreen: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_FULLSCREEN, isFullscreen),

  // Remote control (a phone on the local network)
  setRemoteEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.REMOTE_SET_ENABLED, enabled),
  sendRemoteState: (state: RemoteState) => ipcRenderer.send(IPC_CHANNELS.REMOTE_STATE, state),

  // App control
  quit: () => ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
  
  // Event listeners
  onTorrentStatus: (callback: (status: TorrentStatus) => void) => {
    ipcRenderer.on(IPC_CHANNELS.TORRENT_STATUS, (_, status) => callback(status));
  },
  // `startAt`: where to resume a newly opened file, or null to start from the beginning
  onVideoUrl: (callback: (url: string, startAt: number | null) => void) => {
    ipcRenderer.on(IPC_CHANNELS.VIDEO_URL, (_, url, startAt) => callback(url, startAt ?? null));
  },
  onVideoMetadata: (callback: (metadata: { duration: number }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.VIDEO_METADATA, (_, metadata) => callback(metadata));
  },
  onSubtitles: (callback: (data: SubtitleData) => void) => {
    ipcRenderer.on(IPC_CHANNELS.SUBTITLES, (_, data) => callback(data));
  },
  onAudioTracks: (callback: (data: AudioData) => void) => {
    ipcRenderer.on(IPC_CHANNELS.AUDIO_TRACKS, (_, data) => callback(data));
  },
  onError: (callback: (error: ErrorInfo) => void) => {
    ipcRenderer.on(IPC_CHANNELS.ERROR, (_, error) => callback(error));
  },
  onWindowFullscreen: (callback: (isFullscreen: boolean) => void) => {
    ipcRenderer.on(IPC_CHANNELS.WINDOW_FULLSCREEN, (_, isFullscreen) => callback(isFullscreen));
  },
  // Opening started from the app menu or the Dock rather than by the page
  onMediaOpening: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.MEDIA_OPENING, () => callback());
  },
  onMediaOpened: (callback: (metadata: TorrentMetadata) => void) => {
    ipcRenderer.on(IPC_CHANNELS.MEDIA_OPENED, (_, metadata) => callback(metadata));
  },
  onMenuCommand: (callback: (command: MenuCommand) => void) => {
    ipcRenderer.on(IPC_CHANNELS.MENU_COMMAND, (_, command) => callback(command));
  },
  onSettingsChanged: (callback: (settings: AppSettings) => void) => {
    ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, (_, settings) => callback(settings));
  },
  onRemoteStatus: (callback: (status: RemoteStatus) => void) => {
    ipcRenderer.on(IPC_CHANNELS.REMOTE_STATUS, (_, status) => callback(status));
  },
  onRemoteCommand: (callback: (command: RemoteCommand) => void) => {
    ipcRenderer.on(IPC_CHANNELS.REMOTE_COMMAND, (_, command) => callback(command));
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI: {
      loadTorrent: (source: string) => Promise<TorrentMetadata>;
      openVideoFile: (filePath: string) => Promise<TorrentMetadata>;
      stopTorrent: () => Promise<void>;
      selectFile: (fileName: string) => Promise<void>;
      prefetchFile: (fileName: string) => Promise<void>;
      getSettings: () => Promise<AppSettings>;
      playbackControl: (action: 'play' | 'pause' | 'stop') => Promise<void>;
      playbackSeek: (time: number) => Promise<void>;
      savePlaybackPosition: (file: WatchedFile, position: number, duration: number) => Promise<void>;
      selectAudioTrack: (streamIndex: number) => Promise<void>;
      quit: () => Promise<void>;
      openExternal: (url: string) => Promise<boolean>;
      startWindowDrag: () => Promise<boolean>;
      moveWindowBy: (dx: number, dy: number) => void;
      endWindowDrag: () => Promise<void>;
      setWindowFullscreen: (isFullscreen: boolean) => Promise<void>;
      setRemoteEnabled: (enabled: boolean) => Promise<RemoteStatus>;
      sendRemoteState: (state: RemoteState) => void;
      onTorrentStatus: (callback: (status: TorrentStatus) => void) => void;
      onVideoUrl: (callback: (url: string, startAt: number | null) => void) => void;
      onVideoMetadata: (callback: (metadata: { duration: number }) => void) => void;
      onSubtitles: (callback: (data: SubtitleData) => void) => void;
      onAudioTracks: (callback: (data: AudioData) => void) => void;
      onError: (callback: (error: ErrorInfo) => void) => void;
      onWindowFullscreen: (callback: (isFullscreen: boolean) => void) => void;
      onMediaOpening: (callback: () => void) => void;
      onMediaOpened: (callback: (metadata: TorrentMetadata) => void) => void;
      onMenuCommand: (callback: (command: MenuCommand) => void) => void;
      onSettingsChanged: (callback: (settings: AppSettings) => void) => void;
      onRemoteStatus: (callback: (status: RemoteStatus) => void) => void;
      onRemoteCommand: (callback: (command: RemoteCommand) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

