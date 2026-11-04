import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileFromArgv } from '@/main/launch-args';

// path.resolve is platform-aware ('/movies/a.mkv' becomes 'D:\movies\a.mkv' on Windows),
// so expectations are resolved the same way instead of written as literals.
const abs = (p: string) => path.resolve(p);
const workingDirectory = abs('/home/user');
const packaged = { isPackaged: true, workingDirectory };
const development = { isPackaged: false, workingDirectory };

describe('fileFromArgv (#46)', () => {
  it('finds the file after the executable of a packaged app', () => {
    expect(fileFromArgv(['/Applications/Salt Player', abs('/movies/film.mkv')], packaged)).toBe(abs('/movies/film.mkv'));
  });

  it('finds a .torrent file', () => {
    expect(fileFromArgv(['salt-player', abs('/dl/show.torrent')], packaged)).toBe(abs('/dl/show.torrent'));
  });

  it('matches extensions in any case', () => {
    expect(fileFromArgv(['salt-player', abs('/dl/FILM.MKV')], packaged)).toBe(abs('/dl/FILM.MKV'));
    expect(fileFromArgv(['salt-player', abs('/dl/Show.Torrent')], packaged)).toBe(abs('/dl/Show.Torrent'));
  });

  it('skips the executable even when it looks like a video', () => {
    expect(fileFromArgv(['/opt/player.mkv'], packaged)).toBeNull();
  });

  it('skips the app entry in development, "." or a script path', () => {
    expect(fileFromArgv(['electron', '.', abs('/movies/a.mp4')], development)).toBe(abs('/movies/a.mp4'));
    expect(fileFromArgv(['electron', '/repo/dist/main/main.mp4', abs('/movies/a.mp4')], development)).toBe(
      abs('/movies/a.mp4'),
    );
    expect(fileFromArgv(['electron', '.'], development)).toBeNull();
  });

  it('does not skip a second argument in a packaged app', () => {
    expect(fileFromArgv(['salt-player', abs('/movies/a.mp4')], packaged)).toBe(abs('/movies/a.mp4'));
  });

  it('skips flags, including those Chromium and macOS add', () => {
    expect(
      fileFromArgv(['salt-player', '--no-sandbox', '-psn_0_12345', '--flag=/x/y.mkv', abs('/movies/a.mkv')], packaged),
    ).toBe(abs('/movies/a.mkv'));
  });

  it('resolves a relative path against the working directory, not the current one', () => {
    expect(fileFromArgv(['salt-player', 'films/a.mkv'], packaged)).toBe(path.resolve(workingDirectory, 'films/a.mkv'));
    expect(fileFromArgv(['salt-player', '../a.mkv'], packaged)).toBe(path.resolve(workingDirectory, '../a.mkv'));
    expect(fileFromArgv(['salt-player', 'films/a.mkv'], packaged)).not.toBe(abs('films/a.mkv'));
  });

  it('ignores arguments that are not a video or a torrent', () => {
    expect(fileFromArgv(['salt-player', 'notes.txt', 'magnet:?xt=urn:btih:abc', abs('/m/a.mp4')], packaged)).toBe(
      abs('/m/a.mp4'),
    );
  });

  it('takes the first match', () => {
    expect(fileFromArgv(['salt-player', abs('/m/a.mp4'), abs('/m/b.mkv')], packaged)).toBe(abs('/m/a.mp4'));
  });

  it('returns null when nothing names media', () => {
    expect(fileFromArgv(['salt-player'], packaged)).toBeNull();
    expect(fileFromArgv(['salt-player', '--inspect', 'readme.md'], packaged)).toBeNull();
    expect(fileFromArgv([], packaged)).toBeNull();
  });

  it.runIf(process.platform === 'win32')('handles Windows paths', () => {
    const exe = 'C:\\Program Files\\Salt Player\\Salt Player.exe';
    expect(fileFromArgv([exe, 'C:\\Videos\\a.mkv'], { isPackaged: true, workingDirectory: 'C:\\Users\\me' })).toBe(
      'C:\\Videos\\a.mkv',
    );
    expect(fileFromArgv([exe, 'films\\a.mkv'], { isPackaged: true, workingDirectory: 'C:\\Users\\me' })).toBe(
      'C:\\Users\\me\\films\\a.mkv',
    );
  });
});
