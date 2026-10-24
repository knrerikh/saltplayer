import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  WatchHistory,
  MIN_RESUME_S,
  RESUME_REWIND_S,
  WATCH_HISTORY_LIMIT,
} from '@/main/watch-history';
import { playbackKey } from '@/shared/playback-key';

const episode = (n: number) => ({ infoHash: 'aaa', fileName: `S01E0${n}.mkv` });
const keyOf = (n: number) => playbackKey({ infoHash: 'aaa' }, `S01E0${n}.mkv`);

describe('playbackKey (#51)', () => {
  it('names a torrent file by info hash and file name', () => {
    expect(playbackKey({ infoHash: 'aaa', path: 'Show/S01E01.mkv' }, 'S01E01.mkv')).toBe('aaa/S01E01.mkv');
  });

  it('names a local file by its path', () => {
    expect(playbackKey({ path: '/videos/Movie.mkv' }, 'Movie.mkv')).toBe('/videos/Movie.mkv');
  });
});

describe('WatchHistory (#51)', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-history-test-'));
    filePath = path.join(dir, 'watch-history.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resumes a little before where playback stopped', async () => {
    const history = new WatchHistory(filePath);
    await history.record(episode(1), 600, 3000);

    expect(history.resumePosition(keyOf(1))).toBe(600 - RESUME_REWIND_S);
  });

  it('does not resume what was only just started', async () => {
    const history = new WatchHistory(filePath);
    await history.record(episode(1), MIN_RESUME_S - 1, 3000);

    expect(history.resumePosition(keyOf(1))).toBeNull();
  });

  it('does not resume a file watched to the end, and remembers it as finished', async () => {
    const history = new WatchHistory(filePath);
    await history.record(episode(1), 2900, 3000);

    expect(history.resumePosition(keyOf(1))).toBeNull();
    expect(history.lastWatched('aaa')).toEqual({ fileName: 'S01E01.mkv', finished: true });
  });

  it('ignores a position with no known duration', async () => {
    const history = new WatchHistory(filePath);
    await history.record(episode(1), 600, 0);

    expect(history.resumePosition(keyOf(1))).toBeNull();
  });

  it('knows the episode of a torrent watched last', async () => {
    const history = new WatchHistory(filePath);
    await history.record(episode(3), 600, 3000);
    await history.record(episode(2), 900, 3000);
    await history.record({ infoHash: 'bbb', fileName: 'Other.mkv' }, 600, 3000);

    expect(history.lastWatched('aaa')).toEqual({ fileName: 'S01E02.mkv', finished: false });
    expect(history.lastWatched('zzz')).toBeNull();
  });

  it('resumes a local file by its path', async () => {
    const history = new WatchHistory(filePath);
    await history.record({ path: '/videos/Movie.mkv', fileName: 'Movie.mkv' }, 600, 3000);

    expect(history.resumePosition('/videos/Movie.mkv')).toBe(600 - RESUME_REWIND_S);
  });

  it('survives a restart', async () => {
    await new WatchHistory(filePath).record(episode(1), 600, 3000);

    const reloaded = new WatchHistory(filePath);
    await reloaded.load();

    expect(reloaded.resumePosition(keyOf(1))).toBe(600 - RESUME_REWIND_S);
  });

  it('keeps only the newest entries', async () => {
    const history = new WatchHistory(filePath);
    for (let i = 0; i <= WATCH_HISTORY_LIMIT; i++) {
      await history.record({ path: `/v/${i}.mkv`, fileName: `${i}.mkv` }, 600, 3000);
    }

    expect(history.resumePosition('/v/0.mkv')).toBeNull();
    expect(history.resumePosition(`/v/${WATCH_HISTORY_LIMIT}.mkv`)).not.toBeNull();
  });

  it('forgets everything on clear, on disk too', async () => {
    const history = new WatchHistory(filePath);
    await history.record(episode(1), 600, 3000);
    await history.clear();

    const reloaded = new WatchHistory(filePath);
    await reloaded.load();

    expect(history.resumePosition(keyOf(1))).toBeNull();
    expect(reloaded.lastWatched('aaa')).toBeNull();
  });

  it('records and answers nothing while turned off', async () => {
    let enabled = true;
    const history = new WatchHistory(filePath, { isEnabled: () => enabled });
    await history.record(episode(1), 600, 3000);

    enabled = false;
    await history.record(episode(2), 900, 3000);

    expect(history.resumePosition(keyOf(1))).toBeNull();
    expect(history.lastWatched('aaa')).toBeNull();
    enabled = true;
    expect(history.lastWatched('aaa')).toEqual({ fileName: 'S01E01.mkv', finished: false });
  });

  it('starts empty from a corrupt file and skips malformed entries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.writeFileSync(filePath, '{oops');
    const corrupt = new WatchHistory(filePath);
    await corrupt.load();
    expect(corrupt.lastWatched('aaa')).toBeNull();

    fs.writeFileSync(
      filePath,
      JSON.stringify([
        { key: 'aaa/S01E01.mkv', infoHash: 'aaa', fileName: 'S01E01.mkv', position: 600, duration: 3000, finished: false, updatedAt: 1 },
        { key: 'aaa/S01E02.mkv', position: 'soon' },
        null,
      ]),
    );
    const partial = new WatchHistory(filePath);
    await partial.load();

    expect(partial.resumePosition('aaa/S01E01.mkv')).toBe(600 - RESUME_REWIND_S);
    expect(partial.resumePosition('aaa/S01E02.mkv')).toBeNull();
  });
});
