import type { TorrentMetadata } from '@/shared/types';
import { JsonFile } from './json-file';

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
 * restart. Failing to read or write it never stops a video from opening.
 */
export class RecentSources {
  private entries: RecentSource[] = [];
  private readonly file: JsonFile;
  private readonly limit: number;
  private readonly onChange: (entries: readonly RecentSource[]) => void;

  constructor(filePath: string, options: RecentSourcesOptions = {}) {
    this.file = new JsonFile(filePath);
    this.limit = options.limit ?? RECENT_SOURCES_LIMIT;
    this.onChange = options.onChange ?? (() => {});
  }

  async load(): Promise<void> {
    const parsed = await this.file.read();
    this.entries = Array.isArray(parsed) ? parsed.filter(isRecentSource).slice(0, this.limit) : [];
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
    return this.file.write(this.entries);
  }
}
