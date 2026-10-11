import * as fs from 'fs';
import * as path from 'path';
import type { Readable } from 'stream';
import { isVideoFile } from '@/shared/video-files';

/** An inclusive byte range, as in an HTTP `Range: bytes=start-end` header. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * What the streaming server plays: a WebTorrent file and a file on disk both have
 * this shape, so ranges, probing and transcoding work the same for either.
 */
export interface MediaSource {
  name: string;
  length: number;
  createReadStream(range?: ByteRange): Readable;
}

export interface LocalVideo extends MediaSource {
  path: string;
}

/**
 * Opens a video on disk for streaming. The path comes from the renderer (a drop or
 * the file picker), so only an absolute path to a regular file with a video
 * extension is accepted.
 */
export async function openLocalVideo(filePath: string): Promise<LocalVideo> {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    throw new Error('Expected an absolute path to a video file');
  }
  const name = path.basename(filePath);
  if (!isVideoFile(name)) throw new Error(`Not a video file: ${name}`);

  const stats = await fs.promises.stat(filePath);
  if (!stats.isFile()) throw new Error(`Not a file: ${filePath}`);

  return {
    name,
    length: stats.size,
    path: filePath,
    createReadStream: (range) => fs.createReadStream(filePath, range),
  };
}
