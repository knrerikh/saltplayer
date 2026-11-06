import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { mediaToolPaths } from '@/main/media-tools';

const projectRoot = path.resolve('project');
const resourcesPath = path.resolve('app', 'resources');

describe('mediaToolPaths', () => {
  it('uses the vendor folder of the host in development', () => {
    expect(mediaToolPaths({ platform: 'darwin', arch: 'arm64', projectRoot })).toEqual({
      ffmpeg: path.join(projectRoot, 'vendor', 'ffmpeg', 'darwin-arm64', 'ffmpeg'),
      ffprobe: path.join(projectRoot, 'vendor', 'ffmpeg', 'darwin-arm64', 'ffprobe'),
    });
  });

  it('uses the ffmpeg resources folder of the installed app', () => {
    expect(mediaToolPaths({ platform: 'linux', arch: 'x64', projectRoot, resourcesPath })).toEqual({
      ffmpeg: path.join(resourcesPath, 'ffmpeg', 'ffmpeg'),
      ffprobe: path.join(resourcesPath, 'ffmpeg', 'ffprobe'),
    });
  });

  it('adds .exe on Windows', () => {
    const tools = mediaToolPaths({ platform: 'win32', arch: 'x64', projectRoot, resourcesPath });
    expect(path.basename(tools.ffmpeg)).toBe('ffmpeg.exe');
    expect(path.basename(tools.ffprobe)).toBe('ffprobe.exe');
  });
});
