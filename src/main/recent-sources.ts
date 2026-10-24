import * as fs from 'fs';
import * as path from 'path';
import type { TorrentMetadata } from '@/shared/types';

/** A source opened before, as File → Open Recent lists it. */
export interface RecentSource {
  /** What to open again: a magnet link, a torrent URL, or a path on disk. */
  source: string;
  /** The torrent's or the file's name. */
  label: string;
  /** What makes two entries the same: a torrent's info hash, otherwise the source. */
  key: string;
}

export const RECENT_SOURCES_LIMIT = 10;

interface RecentSourcesOptions {
  limit?: number;
  onChange?: (entries: readonly RecentSource[]) => void;
}

const isRecentSource = (value: unknown): value is RecentSource => {
  const entry = value as Partial<RecentSource> | null;
  return (
    typeof entry?.source === 'string' &&
    typeof entry.label === 'string' &&
    typeof entry.key === 'string'
  );
};

/**
 * The newest-first list behind Open Recent, kept in a JSON file so it survives a
 * restart. It is the app's only persistent state; failing to read or write it never
 * stops a video from opening.
 */
export class RecentSources {
  private entries: RecentSource[] = [];
  private saving: Promise<void> = Promise.resolve();
  private readonly limit: number;
  private readonly onChange: (entries: readonly RecentSource[]) => void;

  constructor(private readonly filePath: string, options: RecentSourcesOptions = {}) {
    this.limit = options.limit ?? RECENT_SOURCES_LIMIT;
    this.onChange = options.onChange ?? (() => {});
  }

  async load(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await fs.promises.readFile(this.filePath, 'utf8'));
      this.entries = Array.isArray(parsed) ? parsed.filter(isRecentSource).slice(0, this.limit) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Could not read recent sources:', error);
      }
      this.entries = [];
    }
  }

  list(): readonly RecentSource[] {
    return this.entries;
  }

  add(source: string, metadata: TorrentMetadata): Promise<void> {
    const entry: RecentSource = { source, label: metadata.name, key: metadata.infoHash ?? source };
    this.entries = [entry, ...this.entries.filter(({ key }) => key !== entry.key)].slice(0, this.limit);
    return this.changed();
  }

  clear(): Promise<void> {
    this.entries = [];
    return this.changed();
  }

  private changed(): Promise<void> {
    this.onChange(this.entries);
    const snapshot = JSON.stringify(this.entries, null, 2);
    // Writes run one after another so an older snapshot never lands last.
    this.saving = this.saving.then(() => this.write(snapshot));
    return this.saving;
  }

  private async write(contents: string): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;
    try {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.promises.writeFile(tempPath, contents);
      await fs.promises.rename(tempPath, this.filePath);
    } catch (error) {
      console.error('Could not save recent sources:', error);
    }
  }
}
