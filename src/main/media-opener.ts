import * as path from 'path';
import { IPC_CHANNELS, type ErrorInfo, type TorrentMetadata } from '@/shared/types';
import { isVideoFile } from '@/shared/video-files';
import type { TorrentEngine } from './torrent';
import type { RecentSources } from './recent-sources';

interface MediaOpenerDeps {
  engine: Pick<TorrentEngine, 'load' | 'openLocalFile'>;
  recents: Pick<RecentSources, 'add'>;
  /** `app.addRecentDocument`: the Dock and Jump List keep files opened from disk. */
  addRecentDocument(filePath: string): void;
  /** Sends to the page in the main window. */
  send(channel: string, ...args: unknown[]): void;
}

/**
 * Opens torrents and video files and remembers each one that opened, for Open Recent.
 * The page opens what it is given (a typed magnet, a drop); the menu opens through
 * `open()`, which also tells the page, since the page did not start it.
 */
export class MediaOpener {
  constructor(private readonly deps: MediaOpenerDeps) {}

  loadTorrent(source: string): Promise<TorrentMetadata> {
    return this.remembered(source, this.deps.engine.load(source));
  }

  openVideoFile(filePath: string): Promise<TorrentMetadata> {
    return this.remembered(filePath, this.deps.engine.openLocalFile(filePath));
  }

  async open(source: string): Promise<void> {
    const { send } = this.deps;
    send(IPC_CHANNELS.MEDIA_OPENING);
    try {
      const metadata = await (isVideoFile(source) ? this.openVideoFile(source) : this.loadTorrent(source));
      send(IPC_CHANNELS.MEDIA_OPENED, metadata);
    } catch (error) {
      const info: ErrorInfo = {
        code: 'LOAD_ERROR',
        message: error instanceof Error ? error.message : String(error),
      };
      send(IPC_CHANNELS.ERROR, info);
    }
  }

  private async remembered(source: string, opening: Promise<TorrentMetadata>): Promise<TorrentMetadata> {
    const metadata = await opening;
    if (path.isAbsolute(source)) this.deps.addRecentDocument(source);
    await this.deps.recents.add(source, metadata);
    return metadata;
  }
}
