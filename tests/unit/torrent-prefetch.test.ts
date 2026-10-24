import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TorrentEngine, PREFETCH_BYTES } from '@/main/torrent';
import { StorageManager } from '@/main/storage';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

const MB = 1024 * 1024;
const PIECE = 1 * MB;

const file = (name: string, length: number, offset: number) => ({
  name,
  length,
  offset,
  select: vi.fn(),
  deselect: vi.fn(),
});

function setup() {
  const episodes = [
    file('S01E01.mkv', 500 * MB, 0),
    file('S01E02.mkv', 500 * MB, 500 * MB),
    file('S01E03.mkv', 500 * MB, 1000 * MB),
  ];
  const torrent = { files: episodes, pieceLength: PIECE, select: vi.fn() };
  const engine = new TorrentEngine(new StorageManager());
  (engine as any).currentTorrent = torrent;
  (engine as any).prioritizeStreamingPieces(episodes[0], 0);
  torrent.select.mockClear();
  return { engine, torrent, episodes };
}

/** Piece range of the first PREFETCH_BYTES of a file at this offset. */
const startOf = (offset: number) => [offset / PIECE, (offset + PREFETCH_BYTES) / PIECE - 1];

describe('TorrentEngine.prefetchFile (#42)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('fetches the start of the next episode at normal priority', async () => {
    const { engine, torrent } = setup();

    await engine.prefetchFile('S01E02.mkv');

    expect(torrent.select).toHaveBeenCalledTimes(1);
    expect(torrent.select).toHaveBeenCalledWith(...startOf(500 * MB), false);
  });

  it('keeps fetching it after the playing episode is reprioritised by a seek', async () => {
    const { engine, torrent, episodes } = setup();
    await engine.prefetchFile('S01E02.mkv');
    torrent.select.mockClear();

    (engine as any).prioritizeStreamingPieces(episodes[0], 100 * MB);

    expect(torrent.select).toHaveBeenCalledWith(...startOf(500 * MB), false);
  });

  it('stops once that episode is the one playing', async () => {
    const { engine, torrent, episodes } = setup();
    await engine.prefetchFile('S01E02.mkv');

    (engine as any).prioritizeStreamingPieces(episodes[1], 0);
    torrent.select.mockClear();
    (engine as any).prioritizeStreamingPieces(episodes[1], 100 * MB);

    expect(torrent.select).not.toHaveBeenCalledWith(...startOf(500 * MB), false);
  });

  it('fetches a file shorter than the prefetch size whole', async () => {
    const { engine, torrent } = setup();
    torrent.files.push(file('Extra.mkv', 2 * MB, 1500 * MB));

    await engine.prefetchFile('Extra.mkv');

    expect(torrent.select).toHaveBeenCalledWith(1500, 1501, false);
  });

  it('ignores the episode already playing', async () => {
    const { engine, torrent } = setup();

    await engine.prefetchFile('S01E01.mkv');

    expect(torrent.select).not.toHaveBeenCalled();
  });

  it('does nothing for a local file, which has no torrent', async () => {
    const engine = new TorrentEngine(new StorageManager());

    await expect(engine.prefetchFile('Movie.mkv')).resolves.toBeUndefined();
  });

  it('rejects a name that is not in the torrent', async () => {
    const { engine } = setup();

    await expect(engine.prefetchFile('nope.mkv')).rejects.toThrow('File not found: nope.mkv');
  });

  it('forgets the prefetch when the torrent stops', async () => {
    const { engine } = setup();
    await engine.prefetchFile('S01E02.mkv');
    (engine as any).currentTorrent = null;

    await engine.stop();

    expect((engine as any).prefetchedFile).toBeNull();
  });
});
