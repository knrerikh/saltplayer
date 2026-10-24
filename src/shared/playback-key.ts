/** Where a file being played comes from: a torrent, or a path on disk. */
export interface PlaybackSource {
  infoHash?: string;
  path?: string;
}

/** A file the page played, as it reports where playback was. */
export interface WatchedFile extends PlaybackSource {
  fileName: string;
}

/**
 * What identifies a file for resuming it: the torrent's info hash and the file's name
 * inside it, or the path of a file on disk. Main and the page build it the same way.
 */
export function playbackKey({ infoHash, path }: PlaybackSource, fileName: string): string {
  return infoHash ? `${infoHash}/${fileName}` : path ?? fileName;
}
