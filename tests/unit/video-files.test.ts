import { describe, it, expect } from 'vitest';
import { VIDEO_EXTENSIONS, isVideoFile, pickMainVideoFile } from '@/shared/video-files';

const MB = 1024 * 1024;
const file = (name: string, sizeMb: number) => ({ name, length: sizeMb * MB });
const pick = (files: ReturnType<typeof file>[]) => pickMainVideoFile(files, (f) => f.length)?.name ?? null;

describe('isVideoFile', () => {
  it.each(VIDEO_EXTENSIONS)('recognises %s', (ext) => {
    expect(isVideoFile(`movie${ext}`)).toBe(true);
  });

  it('ignores case', () => {
    expect(isVideoFile('MOVIE.MKV')).toBe(true);
  });

  it.each(['readme.txt', 'cover.jpg', 'movie.mkv.part', 'mkv', 'Subs/movie.srt'])('rejects %s', (name) => {
    expect(isVideoFile(name)).toBe(false);
  });
});

describe('pickMainVideoFile (#20)', () => {
  it('returns null when there is no video', () => {
    expect(pick([])).toBeNull();
    expect(pick([file('readme.txt', 1), file('cover.jpg', 2)])).toBeNull();
  });

  it('ignores non-video files however large they are', () => {
    expect(pick([file('extras.iso', 4000), file('Movie.mkv', 700)])).toBe('Movie.mkv');
  });

  it('skips a sample that sorts before the movie', () => {
    expect(pick([file('Movie.mkv', 2000), file('Movie.sample.mkv', 30)])).toBe('Movie.mkv');
    expect(pick([file('A sample.mp4', 20), file('Movie.mp4', 1500)])).toBe('Movie.mp4');
  });

  it('starts a series at the first episode, not the largest one', () => {
    const season = [
      file('Show.S01E03.mkv', 900),
      file('Show.S01E01.mkv', 700),
      file('Show.S01E02.mkv', 1200),
    ];

    expect(pick(season)).toBe('Show.S01E01.mkv');
  });

  it('keeps short episodes over 50 MB as candidates even next to a long special', () => {
    expect(pick([file('Show.E00.Special.mkv', 3000), file('Show.E01.mkv', 120)])).toBe('Show.E00.Special.mkv');
    expect(pick([file('Show.E02.mkv', 3000), file('Show.E01.mkv', 120)])).toBe('Show.E01.mkv');
  });

  it('falls back to the only video when every file is tiny', () => {
    expect(pick([file('clip.mp4', 0)])).toBe('clip.mp4');
  });
});
