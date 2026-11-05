import * as path from 'path';
import { isVideoFile } from '@/shared/video-files';
import { isLinkSource } from './source-kind';
import { parseMagnetLink } from './magnet-link';

interface LaunchContext {
  isPackaged: boolean;
  /** What a relative path in `argv` is relative to: the launching process's directory. */
  workingDirectory: string;
}

function isMediaPath(arg: string): boolean {
  // A link may end in `.mkv`, but it is not a path.
  if (isLinkSource(arg)) return false;
  return isVideoFile(arg) || arg.toLowerCase().endsWith('.torrent');
}

/**
 * The file a launch asks to open: the absolute path of the first argument that names a
 * `.torrent` or a video. Skips the executable, in development the app entry that follows
 * it, and flags (Chromium adds switches, macOS may add `-psn_…`). It does not check that
 * the file exists; opening it reports that.
 */
export function fileFromArgv(argv: readonly string[], { isPackaged, workingDirectory }: LaunchContext): string | null {
  const file = argv.slice(isPackaged ? 1 : 2).find((arg) => !arg.startsWith('-') && isMediaPath(arg));
  return file === undefined ? null : path.resolve(workingDirectory, file);
}

/**
 * The magnet link a launch carries (Windows and Linux hand it over as an argument): the
 * first argument that is a valid `magnet:?` URI, skipping the executable and, in
 * development, the app entry. Anything else, a flag included, is never taken for one.
 */
export function magnetFromArgv(argv: readonly string[], { isPackaged }: Pick<LaunchContext, 'isPackaged'>): string | null {
  for (const arg of argv.slice(isPackaged ? 1 : 2)) {
    const magnet = parseMagnetLink(arg);
    if (magnet) return magnet.uri;
  }
  return null;
}
