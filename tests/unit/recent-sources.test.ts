import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RecentSources } from '@/main/recent-sources';
import type { TorrentMetadata } from '@/shared/types';

const torrent = (name: string, infoHash: string): TorrentMetadata => ({
  name,
  files: [],
  totalSize: 0,
  infoHash,
});

const localVideo = (name: string): TorrentMetadata => ({ name, files: [], totalSize: 0 });

describe('RecentSources (#31)', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recent-sources-test-'));
    filePath = path.join(dir, 'recent-sources.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lists the newest source first, labelled with its name', async () => {
    const recents = new RecentSources(filePath);
    await recents.add('magnet:?xt=urn:btih:aaa', torrent('Show S01', 'aaa'));
    await recents.add('/videos/Movie.mkv', localVideo('Movie.mkv'));

    expect(recents.list()).toEqual([
      { source: '/videos/Movie.mkv', label: 'Movie.mkv', key: '/videos/Movie.mkv' },
      { source: 'magnet:?xt=urn:btih:aaa', label: 'Show S01', key: 'aaa' },
    ]);
  });

  it('keeps one entry per torrent, however it was opened', async () => {
    const recents = new RecentSources(filePath);
    await recents.add('magnet:?xt=urn:btih:aaa', torrent('Show S01', 'aaa'));
    await recents.add('/downloads/show.torrent', torrent('Show S01', 'aaa'));

    expect(recents.list()).toEqual([
      { source: '/downloads/show.torrent', label: 'Show S01', key: 'aaa' },
    ]);
  });

  it('moves a file opened again to the top', async () => {
    const recents = new RecentSources(filePath);
    await recents.add('/videos/a.mkv', localVideo('a.mkv'));
    await recents.add('/videos/b.mkv', localVideo('b.mkv'));
    await recents.add('/videos/a.mkv', localVideo('a.mkv'));

    expect(recents.list().map((entry) => entry.label)).toEqual(['a.mkv', 'b.mkv']);
  });

  it('drops the oldest entries past the limit', async () => {
    const recents = new RecentSources(filePath, { limit: 3 });
    for (const name of ['1', '2', '3', '4']) {
      await recents.add(`/videos/${name}.mkv`, localVideo(`${name}.mkv`));
    }

    expect(recents.list().map((entry) => entry.label)).toEqual(['4.mkv', '3.mkv', '2.mkv']);
  });

  it('survives a restart', async () => {
    const first = new RecentSources(filePath);
    await first.add('magnet:?xt=urn:btih:aaa', torrent('Show S01', 'aaa'));

    const second = new RecentSources(filePath);
    await second.load();

    expect(second.list()).toEqual(first.list());
  });

  it('clears the list on disk too', async () => {
    const recents = new RecentSources(filePath);
    await recents.add('/videos/a.mkv', localVideo('a.mkv'));
    await recents.clear();

    const reloaded = new RecentSources(filePath);
    await reloaded.load();

    expect(recents.list()).toEqual([]);
    expect(reloaded.list()).toEqual([]);
  });

  it('starts empty when there is no file yet', async () => {
    const recents = new RecentSources(filePath);
    await recents.load();

    expect(recents.list()).toEqual([]);
  });

  it('starts empty from a corrupt file', async () => {
    fs.writeFileSync(filePath, '{not json');
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recents = new RecentSources(filePath);
    await recents.load();

    expect(recents.list()).toEqual([]);
    expect(logError).toHaveBeenCalled();
  });

  it('skips malformed entries and applies the limit to what it reads', async () => {
    const valid = (n: number) => ({ source: `/v/${n}.mkv`, label: `${n}.mkv`, key: `/v/${n}.mkv` });
    fs.writeFileSync(
      filePath,
      JSON.stringify([valid(1), { source: 42 }, null, 'text', valid(2), valid(3)]),
    );
    const recents = new RecentSources(filePath, { limit: 2 });
    await recents.load();

    expect(recents.list()).toEqual([valid(1), valid(2)]);
  });

  it('reports every change', async () => {
    const onChange = vi.fn();
    const recents = new RecentSources(filePath, { onChange });

    await recents.add('/videos/a.mkv', localVideo('a.mkv'));
    await recents.clear();

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('keeps the list in memory when it cannot be saved', async () => {
    const recents = new RecentSources(path.join(filePath, 'not-a-dir', 'recent.json'));
    fs.writeFileSync(filePath, '');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await recents.add('/videos/a.mkv', localVideo('a.mkv'));

    expect(recents.list().map((entry) => entry.label)).toEqual(['a.mkv']);
  });

  it('saves the last state when changes overlap', async () => {
    const recents = new RecentSources(filePath);
    await Promise.all([
      recents.add('/videos/a.mkv', localVideo('a.mkv')),
      recents.add('/videos/b.mkv', localVideo('b.mkv')),
    ]);

    const reloaded = new RecentSources(filePath);
    await reloaded.load();

    expect(reloaded.list().map((entry) => entry.label)).toEqual(['b.mkv', 'a.mkv']);
  });
});
