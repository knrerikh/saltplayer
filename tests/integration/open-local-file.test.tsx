import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '@/renderer/App';
import TorrentInput from '@/renderer/components/TorrentInput';
import StatusBar from '@/renderer/components/StatusBar';
import { VIDEO_EXTENSIONS } from '@/shared/video-files';
import { mockElectronAPI } from '../helpers/electron-api';

/** A File as Electron hands it to the page: with the absolute path on disk. */
function diskFile(filePath: string): File {
  const file = new File(['bytes'], filePath.split('/').pop()!);
  Object.defineProperty(file, 'path', { value: filePath });
  return file;
}

const dropZone = () => screen.getByText(/drag & drop/i);
const filePicker = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

function drop(...files: File[]) {
  fireEvent.drop(dropZone(), { dataTransfer: { files } });
}

function pick(file: File) {
  fireEvent.change(filePicker(), { target: { files: [file] } });
}

describe('Opening local video files (#33)', () => {
  describe('TorrentInput', () => {
    const onLoad = vi.fn();
    const onOpenFile = vi.fn();

    beforeEach(() => {
      onLoad.mockReset();
      onOpenFile.mockReset();
      render(<TorrentInput onLoad={onLoad} onOpenFile={onOpenFile} isLoading={false} />);
    });

    it('lets the file picker choose videos as well as torrents', () => {
      const accepted = filePicker().accept.split(',');

      expect(accepted).toEqual(expect.arrayContaining(['.torrent', ...VIDEO_EXTENSIONS]));
    });

    it.each(['/Movies/Film.mkv', '/Downloads/Film.torrent'])('opens a dropped %s', (filePath) => {
      drop(diskFile(filePath));

      expect(onOpenFile).toHaveBeenCalledWith(filePath);
    });

    it('opens the first playable file of several dropped', () => {
      drop(diskFile('/Movies/cover.jpg'), diskFile('/Movies/Film.MP4'));

      expect(onOpenFile).toHaveBeenCalledTimes(1);
      expect(onOpenFile).toHaveBeenCalledWith('/Movies/Film.MP4');
    });

    it('ignores a drop with nothing playable', () => {
      drop(diskFile('/Movies/notes.txt'));

      expect(onOpenFile).not.toHaveBeenCalled();
    });

    it('opens a picked file', () => {
      pick(diskFile('/Movies/Film.webm'));

      expect(onOpenFile).toHaveBeenCalledWith('/Movies/Film.webm');
      expect(onLoad).not.toHaveBeenCalled();
    });
  });

  describe('App', () => {
    let electron: ReturnType<typeof mockElectronAPI>;

    beforeEach(() => {
      electron = mockElectronAPI();
      render(<App />);
    });

    it('plays a video file from disk without going through the torrent engine', async () => {
      electron.api.openVideoFile.mockResolvedValue({ name: 'Film.mkv', files: [], totalSize: 1 });

      drop(diskFile('/Movies/Film.mkv'));

      await waitFor(() => expect(electron.api.openVideoFile).toHaveBeenCalledWith('/Movies/Film.mkv'));
      expect(electron.api.loadTorrent).not.toHaveBeenCalled();
    });

    it('still loads a .torrent file as a torrent', async () => {
      electron.api.loadTorrent.mockResolvedValue({ name: 'Film', files: [], totalSize: 1, infoHash: 'abc' });

      drop(diskFile('/Downloads/Film.torrent'));

      await waitFor(() => expect(electron.api.loadTorrent).toHaveBeenCalledWith('/Downloads/Film.torrent'));
      expect(electron.api.openVideoFile).not.toHaveBeenCalled();
    });

    it('shows why a file could not be opened', async () => {
      electron.api.openVideoFile.mockRejectedValue(new Error('Not a file: /Movies/Film.mkv'));

      drop(diskFile('/Movies/Film.mkv'));

      expect(await screen.findByText(/Not a file/)).toBeInTheDocument();
    });
  });

  describe('StatusBar', () => {
    it('shows the name and size of a local file, which has no torrent status', () => {
      const metadata = { name: 'Film.mkv', files: [], totalSize: 3 * 1024 * 1024 };

      render(<StatusBar status={null} metadata={metadata} />);

      expect(screen.getByText('Film.mkv')).toBeInTheDocument();
      expect(screen.getByText('3.00 MB')).toBeInTheDocument();
      expect(screen.queryByText(/Peers/)).not.toBeInTheDocument();
    });
  });
});
