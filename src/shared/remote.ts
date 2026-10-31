/** A command the remote page sends; the player carries it out like the matching key or button. */
export type RemoteCommand = { type: 'toggle-play' };

/** What the remote page shows; the player pushes it whenever it changes. */
export interface RemoteState {
  hasVideo: boolean;
  title: string | null;
  isPlaying: boolean;
  /** Seconds. */
  currentTime: number;
  /** Seconds; 0 while unknown. */
  duration: number;
}

/** Remote control as the dialog shows it. */
export interface RemoteStatus {
  enabled: boolean;
  /** One pairing link per local network address, best first. */
  urls: string[];
  /** The first link as a QR code image (data URL). */
  qrDataUrl: string | null;
  port: number | null;
}

export const REMOTE_DISABLED: RemoteStatus = { enabled: false, urls: [], qrDataUrl: null, port: null };

/** The remote is untrusted input: anything but a known, well-formed command is rejected. */
export function parseRemoteCommand(value: unknown): RemoteCommand | null {
  if (typeof value !== 'object' || value === null) return null;
  const { type } = value as Record<string, unknown>;
  return type === 'toggle-play' ? { type } : null;
}

/** The page is untrusted too: take a state only if every field has the right type. */
export function parseRemoteState(value: unknown): RemoteState | null {
  if (typeof value !== 'object' || value === null) return null;
  const { hasVideo, title, isPlaying, currentTime, duration } = value as Record<string, unknown>;
  if (
    typeof hasVideo !== 'boolean' ||
    !(title === null || typeof title === 'string') ||
    typeof isPlaying !== 'boolean' ||
    typeof currentTime !== 'number' || !Number.isFinite(currentTime) ||
    typeof duration !== 'number' || !Number.isFinite(duration)
  ) {
    return null;
  }
  return { hasVideo, title, isPlaying, currentTime, duration };
}
