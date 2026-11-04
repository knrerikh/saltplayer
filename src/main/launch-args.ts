import * as path from 'path';
import { isVideoFile } from '@/shared/video-files';

interface LaunchContext {
  isPackaged: boolean;
  /** What a relative path in `argv` is relative to: the launching process's directory. */
  workingDirectory: string;
}

function isMediaPath(arg: string): boolean {
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
