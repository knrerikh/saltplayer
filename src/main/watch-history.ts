import { playbackKey, type WatchedFile } from '@/shared/playback-key';
import { JsonFile } from './json-file';

/** Positions under this are not resumed: the video had barely started. */
export const MIN_RESUME_S = 30;
/** Resuming starts this much earlier, to pick the scene up again. */
export const RESUME_REWIND_S = 5;
/** Past this share of the duration a file counts as watched to the end. */
export const FINISHED_SHARE = 0.95;
export const WATCH_HISTORY_LIMIT = 200;

interface WatchEntry {
  key: string;
  infoHash?: string;
  fileName: string;
  position: number;
  duration: number;
  finished: boolean;
  updatedAt: number;
}

interface WatchHistoryOptions {
  /** Playback → Resume Playback: when off, nothing is recorded or resumed. */
  isEnabled?: () => boolean;
}

const isWatchEntry = (value: unknown): value is WatchEntry => {
  const entry = value as Partial<WatchEntry> | null;
  return (
    typeof entry?.key === 'string' &&
    typeof entry.fileName === 'string' &&
    Number.isFinite(entry.position) &&
    Number.isFinite(entry.duration) &&
    typeof entry.finished === 'boolean' &&
    Number.isFinite(entry.updatedAt) &&
    (entry.infoHash === undefined || typeof entry.infoHash === 'string')
  );
};

/**
 * Where each file was left, newest first, in `watch-history.json` in `userData`: the
 * position to resume a file from, and the episode of a season watched last.
 */
export class WatchHistory {
  private entries: WatchEntry[] = [];
  private readonly file: JsonFile;
  private readonly isEnabled: () => boolean;

  constructor(filePath: string, options: WatchHistoryOptions = {}) {
    this.file = new JsonFile(filePath);
    this.isEnabled = options.isEnabled ?? (() => true);
  }

  async load(): Promise<void> {
    const stored = await this.file.read();
    this.entries = Array.isArray(stored) ? stored.filter(isWatchEntry).slice(0, WATCH_HISTORY_LIMIT) : [];
  }

  record({ fileName, ...source }: WatchedFile, position: number, duration: number): Promise<void> {
    if (!this.isEnabled() || !(duration > 0) || !(position >= 0)) return Promise.resolve();

    const entry: WatchEntry = {
      key: playbackKey(source, fileName),
      infoHash: source.infoHash,
      fileName,
      position,
      duration,
      finished: position >= duration * FINISHED_SHARE,
      updatedAt: Date.now(),
    };
    this.entries = [entry, ...this.entries.filter(({ key }) => key !== entry.key)].slice(0, WATCH_HISTORY_LIMIT);
    return this.file.write(this.entries);
  }

  /** Where to start the file with this key, or null to start from the beginning. */
  resumePosition(key: string): number | null {
    if (!this.isEnabled()) return null;
    const entry = this.entries.find((candidate) => candidate.key === key);
    if (!entry || entry.finished || entry.position < MIN_RESUME_S) return null;
    return entry.position - RESUME_REWIND_S;
  }

  /** The file of this torrent played last, if any. */
  lastWatched(infoHash: string): { fileName: string; finished: boolean } | null {
    if (!this.isEnabled()) return null;
    const entry = this.entries.find((candidate) => candidate.infoHash === infoHash);
    return entry ? { fileName: entry.fileName, finished: entry.finished } : null;
  }

  clear(): Promise<void> {
    this.entries = [];
    return this.file.write(this.entries);
  }
}
