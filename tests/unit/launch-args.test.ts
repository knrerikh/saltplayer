import { describe, it, expect } from 'vitest';
import { fileFromArgv } from '@/main/launch-args';

const packaged = { isPackaged: true, workingDirectory: '/home/user' };
const development = { isPackaged: false, workingDirectory: '/home/user' };

describe('fileFromArgv (#46)', () => {
  it('finds the file after the executable of a packaged app', () => {
    expect(fileFromArgv(['/Applications/Salt Player', '/movies/film.mkv'], packaged)).toBe('/movies/film.mkv');
  });

  it('finds a .torrent file', () => {
    expect(fileFromArgv(['salt-player', '/dl/show.torrent'], packaged)).toBe('/dl/show.torrent');
  });

  it('matches extensions in any case', () => {
    expect(fileFromArgv(['salt-player', '/dl/FILM.MKV'], packaged)).toBe('/dl/FILM.MKV');
    expect(fileFromArgv(['salt-player', '/dl/Show.Torrent'], packaged)).toBe('/dl/Show.Torrent');
  });

  it('skips the executable even when it looks like a video', () => {
    expect(fileFromArgv(['/opt/player.mkv'], packaged)).toBeNull();
  });

  it('skips the app entry in development, "." or a script path', () => {
    expect(fileFromArgv(['electron', '.', '/movies/a.mp4'], development)).toBe('/movies/a.mp4');
    expect(fileFromArgv(['electron', '/repo/dist/main/main.mp4', '/movies/a.mp4'], development)).toBe('/movies/a.mp4');
    expect(fileFromArgv(['electron', '.'], development)).toBeNull();
  });

  it('does not skip a second argument in a packaged app', () => {
    expect(fileFromArgv(['salt-player', '/movies/a.mp4'], packaged)).toBe('/movies/a.mp4');
  });

  it('skips flags, including those Chromium and macOS add', () => {
    expect(
      fileFromArgv(['salt-player', '--no-sandbox', '-psn_0_12345', '--flag=/x/y.mkv', '/movies/a.mkv'], packaged),
    ).toBe('/movies/a.mkv');
  });

  it('resolves a relative path against the working directory', () => {
    expect(fileFromArgv(['salt-player', 'films/a.mkv'], packaged)).toBe('/home/user/films/a.mkv');
    expect(fileFromArgv(['salt-player', '../a.mkv'], packaged)).toBe('/home/a.mkv');
  });

  it('ignores arguments that are not a video or a torrent', () => {
    expect(fileFromArgv(['salt-player', 'notes.txt', 'magnet:?xt=urn:btih:abc', '/m/a.mp4'], packaged)).toBe('/m/a.mp4');
  });

  it('takes the first match', () => {
    expect(fileFromArgv(['salt-player', '/m/a.mp4', '/m/b.mkv'], packaged)).toBe('/m/a.mp4');
  });

  it('returns null when nothing names media', () => {
    expect(fileFromArgv(['salt-player'], packaged)).toBeNull();
    expect(fileFromArgv(['salt-player', '--inspect', 'readme.md'], packaged)).toBeNull();
    expect(fileFromArgv([], packaged)).toBeNull();
  });
});
