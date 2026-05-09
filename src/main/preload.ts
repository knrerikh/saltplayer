import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, TorrentStatus, TorrentMetadata, ErrorInfo, SubtitleData, AudioData } from '@/shared/types';

// Expose safe API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Torrent operations
  loadTorrent: (source: string) => ipcRenderer.invoke(IPC_CHANNELS.TORRENT_LOAD, source),
  stopTorrent: () => ipcRenderer.invoke(IPC_CHANNELS.TORRENT_STOP),
  selectFile: (fileName: string) => ipcRenderer.invoke(IPC_CHANNELS.TORRENT_SELECT_FILE, fileName),
  
  // Playback control
  playbackControl: (action: 'play' | 'pause' | 'stop') => 
    ipcRenderer.invoke(IPC_CHANNELS.PLAYBACK_CONTROL, action),
  playbackSeek: (time: number) => 
    ipcRenderer.invoke(IPC_CHANNELS.PLAYBACK_SEEK, time),
  selectAudioTrack: (streamIndex: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIO_SELECT, streamIndex),
  
  // App control
  quit: () => ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
  
  // Event listeners
  onTorrentStatus: (callback: (status: TorrentStatus) => void) => {
    ipcRenderer.on(IPC_CHANNELS.TORRENT_STATUS, (_, status) => callback(status));
  },
  onVideoUrl: (callback: (url: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.VIDEO_URL, (_, url) => callback(url));
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
      stopTorrent: () => Promise<void>;
      selectFile: (fileName: string) => Promise<void>;
      playbackControl: (action: 'play' | 'pause' | 'stop') => Promise<void>;
      playbackSeek: (time: number) => Promise<void>;
      selectAudioTrack: (streamIndex: number) => Promise<void>;
      quit: () => Promise<void>;
      openExternal: (url: string) => Promise<boolean>;
      onTorrentStatus: (callback: (status: TorrentStatus) => void) => void;
      onVideoUrl: (callback: (url: string) => void) => void;
      onVideoMetadata: (callback: (metadata: { duration: number }) => void) => void;
      onSubtitles: (callback: (data: SubtitleData) => void) => void;
      onAudioTracks: (callback: (data: AudioData) => void) => void;
      onError: (callback: (error: ErrorInfo) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

