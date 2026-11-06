import * as path from 'path';

export interface MediaTools {
  ffmpeg: string;
  ffprobe: string;
}

interface Location {
  platform: NodeJS.Platform;
  arch: string;
  /** The repository root, where `scripts/fetch-ffmpeg.mjs` puts the binaries (`vendor/ffmpeg`). */
  projectRoot: string;
  /** Set for an installed app, which carries the binaries in its resources folder. */
  resourcesPath?: string;
}

/** Where the bundled ffmpeg and ffprobe are: in the resources folder when installed, in `vendor/` in development. */
export function mediaToolPaths({ platform, arch, projectRoot, resourcesPath }: Location): MediaTools {
  const dir = resourcesPath
    ? path.join(resourcesPath, 'ffmpeg')
    : path.join(projectRoot, 'vendor', 'ffmpeg', `${platform}-${arch}`);
  const suffix = platform === 'win32' ? '.exe' : '';
  return {
    ffmpeg: path.join(dir, `ffmpeg${suffix}`),
    ffprobe: path.join(dir, `ffprobe${suffix}`),
  };
}

/**
 * `process.defaultApp` is set only when Electron runs the project folder (`electron .`).
 * The `app` module is not used because it is mocked away in most tests.
 */
function installedResourcesPath(): string | undefined {
  return process.resourcesPath && !process.defaultApp ? process.resourcesPath : undefined;
}

export function hostMediaTools(): MediaTools {
  return mediaToolPaths({
    platform: process.platform,
    arch: process.arch,
    // dist/main (bundle) and src/main (tests) are both two levels below the root.
    projectRoot: path.resolve(__dirname, '..', '..'),
    resourcesPath: installedResourcesPath(),
  });
}
