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

/** What is open: a torrent, or a single video file from disk (which has no infoHash). */
export interface TorrentMetadata {
  name: string;
  files: TorrentFile[];
  totalSize: number;
  infoHash?: string;
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
  MEDIA_OPEN_FILE: 'media:openFile',
  MEDIA_OPENING: 'media:opening',
  MEDIA_OPENED: 'media:opened',
  MENU_COMMAND: 'menu:command',
  PLAYBACK_CONTROL: 'playback:control',
  PLAYBACK_SEEK: 'playback:seek',
  PLAYBACK_SAVE_POSITION: 'playback:savePosition',
  APP_QUIT: 'app:quit',
  APP_OPEN_EXTERNAL: 'app:openExternal',
  ERROR: 'error',
  VIDEO_URL: 'video:url',
  TORRENT_SELECT_FILE: 'torrent:selectFile',
  TORRENT_PREFETCH_FILE: 'torrent:prefetchFile',
  SETTINGS_GET: 'settings:get',
  SETTINGS_CHANGED: 'settings:changed',
  VIDEO_METADATA: 'video:metadata',
  SUBTITLES: 'subtitles:available',
  AUDIO_TRACKS: 'audio:available',
  AUDIO_SELECT: 'audio:selectTrack',
  WINDOW_DRAG_START: 'window:dragStart',
  WINDOW_DRAG_MOVE: 'window:dragMove',
  WINDOW_DRAG_END: 'window:dragEnd',
  WINDOW_FULLSCREEN: 'window:fullscreen',
  WINDOW_SET_FULLSCREEN: 'window:setFullscreen',
  REMOTE_SET_ENABLED: 'remote:setEnabled',
  REMOTE_RESET_LINK: 'remote:resetLink',
  REMOTE_GET_STATUS: 'remote:getStatus',
  REMOTE_SET_AT_LAUNCH: 'remote:setAtLaunch',
  REMOTE_STATUS: 'remote:status',
  REMOTE_COMMAND: 'remote:command',
  REMOTE_STATE: 'remote:state',
} as const;

export type PlaybackControlAction = 'play' | 'pause' | 'stop';

/** User preferences, stored by main in `settings.json` and changed from the app menu. */
export interface AppSettings {
  /** Play the next file of a series when an episode ends (Playback → Autoplay Next Episode). */
  autoplayNext: boolean;
  /** Continue a file where it was left, and a season with the episode watched last (Playback → Resume Playback). */
  resumePlayback: boolean;
  /** Turn the phone remote on when the app opens, with the stored link (Remote Control dialog). */
  remoteAtLaunch: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoplayNext: true,
  resumePlayback: true,
  remoteAtLaunch: false,
};

/** Menu items the page carries out itself: it owns the URL prompt and the player state. */
export type MenuCommand = 'open-url' | 'close-video' | 'remote-control';

export interface SubtitleTrack {
  index: number;
  language: string;
  title?: string;
  url: string;
}

export interface SubtitleData {
  tracks: SubtitleTrack[];
  hasEmbeddedSubtitles: boolean;
}

export interface AudioTrack {
  index: number;
  language: string;
  title?: string;
  codec: string;
  channels: number;
}

export interface AudioData {
  tracks: AudioTrack[];
  currentTrackIndex: number;
}

