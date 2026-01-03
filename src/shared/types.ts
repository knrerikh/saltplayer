// Shared types between main and renderer processes

export interface TorrentFile {
  name: string;
  size: number;
  path: string;
}

export interface TorrentStatus {
  progress: number; // 0-100
  downloadSpeed: number; // bytes/sec
  uploadSpeed: number; // bytes/sec
  numPeers: number;
  downloaded: number; // bytes
  uploaded: number; // bytes
  timeRemaining: number; // seconds
  isReady: boolean;
  isBuffering: boolean;
}

export interface TorrentMetadata {
  name: string;
  files: TorrentFile[];
  totalSize: number;
  infoHash: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isFullscreen: boolean;
}

export interface ErrorInfo {
  code: string;
  message: string;
  details?: string;
}

// IPC Channel names
export const IPC_CHANNELS = {
  TORRENT_LOAD: 'torrent:load',
  TORRENT_STATUS: 'torrent:status',
  TORRENT_STOP: 'torrent:stop',
  PLAYBACK_CONTROL: 'playback:control',
  PLAYBACK_SEEK: 'playback:seek',
  APP_QUIT: 'app:quit',
  APP_OPEN_EXTERNAL: 'app:openExternal',
  ERROR: 'error',
  VIDEO_URL: 'video:url',
  TORRENT_SELECT_FILE: 'torrent:selectFile',
  VIDEO_METADATA: 'video:metadata',
} as const;

export type PlaybackControlAction = 'play' | 'pause' | 'stop';

