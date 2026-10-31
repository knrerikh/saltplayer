/** A command the remote page sends; the player carries it out like the matching key or button. */
export type RemoteCommand =
  | { type: 'toggle-play' }
  /** Relative jump in seconds, negative to go back. */
  | { type: 'seek-by'; seconds: number }
  /** Absolute position in seconds. */
  | { type: 'seek-to'; time: number }
  /** 0 (silent) to 1 (full). */
  | { type: 'set-volume'; volume: number }
  | { type: 'set-muted'; muted: boolean }
  /** Window fullscreen on the computer. */
  | { type: 'toggle-fullscreen' }
  /** Closes the video, like File → Close Video. */
  | { type: 'close-video' }
  | { type: 'previous-episode' }
  | { type: 'next-episode' }
  /** A file name from the playlist the phone was shown, never a path. */
  | { type: 'select-episode'; name: string };

/** The port a phone is sent to, fixed so a firewall rule or a bookmark keeps working. */
export const REMOTE_PORT = 8642;

/** The longest jump the remote may ask for. */
export const MAX_SEEK_BY_SECONDS = 3600;

/** The most episodes the phone is shown, so a huge torrent cannot blow up the stream. */
export const MAX_REMOTE_EPISODES = 500;

/** The longest episode name the remote sends or accepts. */
export const MAX_EPISODE_NAME_LENGTH = 1024;

/** What the remote page shows; the player pushes it whenever it changes. */
export interface RemoteState {
  hasVideo: boolean;
  title: string | null;
  isPlaying: boolean;
  /** Seconds. */
  currentTime: number;
  /** Seconds; 0 while unknown. */
  duration: number;
  /** 0 to 1. */
  volume: number;
  muted: boolean;
  isFullscreen: boolean;
  /** File names of the playlist in the player's order; empty unless there are several. */
  episodes: string[];
  /** Position of the playing file in `episodes`; -1 when it is not there. */
  episodeIndex: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

/** Remote control as the dialog shows it. */
export interface RemoteStatus {
  enabled: boolean;
  /** One pairing link per local network address, best first; by the machine's `.local` name first when there is one. */
  urls: string[];
  /** The first link as a QR code image (data URL). */
  qrDataUrl: string | null;
  port: number | null;
  /** When the link stops working (epoch ms); null while the remote is off. */
  expiresAt: number | null;
  /** The usual port was busy, so a saved link or bookmark does not match this time. */
  portChanged: boolean;
}

export const REMOTE_DISABLED: RemoteStatus = { enabled: false, urls: [], qrDataUrl: null, port: null, expiresAt: null, portChanged: false };

/** The remote is untrusted input: anything but a known, well-formed command is rejected. */
export function parseRemoteCommand(value: unknown): RemoteCommand | null {
  if (typeof value !== 'object' || value === null) return null;
  const { type, seconds, time, volume, muted, name } = value as Record<string, unknown>;
  switch (type) {
    case 'toggle-play':
      return { type };
    case 'seek-by':
      return typeof seconds === 'number' && Number.isFinite(seconds) && seconds !== 0 && Math.abs(seconds) <= MAX_SEEK_BY_SECONDS
        ? { type, seconds }
        : null;
    case 'seek-to':
      return typeof time === 'number' && Number.isFinite(time) && time >= 0 ? { type, time } : null;
    case 'set-volume':
      return isVolume(volume) ? { type, volume } : null;
    case 'set-muted':
      return typeof muted === 'boolean' ? { type, muted } : null;
    case 'toggle-fullscreen':
    case 'close-video':
    case 'previous-episode':
    case 'next-episode':
      return { type };
    case 'select-episode':
      return isEpisodeName(name) ? { type, name } : null;
    default:
      return null;
  }
}

function isEpisodeName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_EPISODE_NAME_LENGTH;
}

function isVolume(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1;
}

/** The page is untrusted too: take a state only if every field has the right type. */
export function parseRemoteState(value: unknown): RemoteState | null {
  if (typeof value !== 'object' || value === null) return null;
  const { hasVideo, title, isPlaying, currentTime, duration, volume, muted, isFullscreen, episodes, episodeIndex, hasPrevious, hasNext } =
    value as Record<string, unknown>;
  if (
    typeof hasVideo !== 'boolean' ||
    !(title === null || typeof title === 'string') ||
    typeof isPlaying !== 'boolean' ||
    typeof currentTime !== 'number' || !Number.isFinite(currentTime) ||
    typeof duration !== 'number' || !Number.isFinite(duration) ||
    !isVolume(volume) ||
    typeof muted !== 'boolean' ||
    typeof isFullscreen !== 'boolean' ||
    !Array.isArray(episodes) || episodes.length > MAX_REMOTE_EPISODES || !episodes.every(isEpisodeName) ||
    !Number.isInteger(episodeIndex) || (episodeIndex as number) < -1 || (episodeIndex as number) >= episodes.length ||
    typeof hasPrevious !== 'boolean' ||
    typeof hasNext !== 'boolean'
  ) {
    return null;
  }
  return {
    hasVideo, title, isPlaying, currentTime, duration, volume, muted, isFullscreen,
    episodes: [...episodes], episodeIndex: episodeIndex as number, hasPrevious, hasNext,
  };
}
