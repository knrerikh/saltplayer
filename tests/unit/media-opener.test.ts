import { describe, it, expect, vi } from 'vitest';
import { MediaOpener } from '@/main/media-opener';
import { IPC_CHANNELS, type TorrentMetadata } from '@/shared/types';

const torrent: TorrentMetadata = { name: 'Show S01', files: [], totalSize: 0, infoHash: 'aaa' };
const video: TorrentMetadata = { name: 'Movie.mkv', files: [], totalSize: 0 };

function setup() {
  const deps = {
    engine: {
      load: vi.fn().mockResolvedValue(torrent),
      openLocalFile: vi.fn().mockResolvedValue(video),
    },
    recents: { add: vi.fn().mockResolvedValue(undefined) },
    addRecentDocument: vi.fn(),
    send: vi.fn(),
  };
  return { deps, opener: new MediaOpener(deps) };
}

describe('MediaOpener (#31)', () => {
  it('remembers a torrent loaded from the page', async () => {
    const { deps, opener } = setup();

    await expect(opener.loadTorrent('magnet:?xt=urn:btih:aaa')).resolves.toBe(torrent);

    expect(deps.recents.add).toHaveBeenCalledWith('magnet:?xt=urn:btih:aaa', torrent);
    expect(deps.addRecentDocument).not.toHaveBeenCalled();
  });

  it('remembers a video file and adds it to the system recent documents', async () => {
    const { deps, opener } = setup();

    await expect(opener.openVideoFile('/videos/Movie.mkv')).resolves.toBe(video);

    expect(deps.recents.add).toHaveBeenCalledWith('/videos/Movie.mkv', video);
    expect(deps.addRecentDocument).toHaveBeenCalledWith('/videos/Movie.mkv');
  });

  it('adds a .torrent file to the system recent documents', async () => {
    const { deps, opener } = setup();

    await opener.loadTorrent('/downloads/show.torrent');

    expect(deps.addRecentDocument).toHaveBeenCalledWith('/downloads/show.torrent');
  });

  it('remembers nothing that failed to open', async () => {
    const { deps, opener } = setup();
    deps.engine.load.mockRejectedValue(new Error('Timeout'));

    await expect(opener.loadTorrent('magnet:?xt=urn:btih:bad')).rejects.toThrow('Timeout');

    expect(deps.recents.add).not.toHaveBeenCalled();
  });

  describe('open (from the menu)', () => {
    it('tells the page a video file is opening, then what opened', async () => {
      const { deps, opener } = setup();

      await opener.open('/videos/Movie.mkv');

      expect(deps.engine.openLocalFile).toHaveBeenCalledWith('/videos/Movie.mkv');
      expect(deps.send.mock.calls).toEqual([
        [IPC_CHANNELS.MEDIA_OPENING],
        [IPC_CHANNELS.MEDIA_OPENED, video],
      ]);
      expect(deps.recents.add).toHaveBeenCalledWith('/videos/Movie.mkv', video);
    });

    it.each(['/downloads/show.torrent', 'magnet:?xt=urn:btih:aaa', 'https://example.com/show.torrent'])(
      'loads %s as a torrent',
      async (source) => {
        const { deps, opener } = setup();

        await opener.open(source);

        expect(deps.engine.load).toHaveBeenCalledWith(source);
        expect(deps.send).toHaveBeenLastCalledWith(IPC_CHANNELS.MEDIA_OPENED, torrent);
      },
    );

    it('reports a failure to the page instead of throwing', async () => {
      const { deps, opener } = setup();
      deps.engine.openLocalFile.mockRejectedValue(new Error('ENOENT: no such file'));

      await opener.open('/videos/Gone.mkv');

      expect(deps.send).toHaveBeenLastCalledWith(IPC_CHANNELS.ERROR, {
        code: 'LOAD_ERROR',
        message: 'ENOENT: no such file',
      });
      expect(deps.recents.add).not.toHaveBeenCalled();
    });
  });
});
