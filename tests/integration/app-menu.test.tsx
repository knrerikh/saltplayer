import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '@/renderer/App';
import { mockElectronAPI } from '../helpers/electron-api';

const VIDEO_URL = 'http://127.0.0.1:1234/Movie.mkv';
const MOVIE = {
  name: 'Movie.mkv',
  files: [{ name: 'Movie.mkv', size: 1024, path: '/videos/Movie.mkv' }],
  totalSize: 1024,
};

describe('Application menu in the page (#31)', () => {
  let electron: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    electron = mockElectronAPI();
    electron.api.loadTorrent.mockResolvedValue(MOVIE);
    electron.api.stopTorrent.mockResolvedValue(undefined);
  });

  const dialog = () => screen.queryByRole('dialog', { name: 'Open URL' });
  const urlField = () => screen.getByPlaceholderText(/magnet link or \.torrent url/i);

  describe('File → Open URL…', () => {
    function renderPlayer() {
      render(<App />);
      electron.playVideo(VIDEO_URL);
    }

    it('focuses the URL field of the start screen instead of a second one (#50)', () => {
      render(<App />);
      const startField = screen.getByPlaceholderText(/enter magnet link/i) as HTMLInputElement;
      fireEvent.change(startField, { target: { value: 'magnet:?xt=urn:btih:old' } });

      electron.sendMenuCommand('open-url');

      expect(dialog()).not.toBeInTheDocument();
      expect(startField).toHaveFocus();
      expect(startField.selectionStart).toBe(0);
      expect(startField.selectionEnd).toBe(startField.value.length);
    });

    it('asks for a URL while a video plays', () => {
      renderPlayer();

      electron.sendMenuCommand('open-url');

      expect(dialog()).toBeInTheDocument();
      expect(urlField()).toHaveFocus();
    });

    it('asks for a URL while the start screen is busy loading', () => {
      render(<App />);
      electron.startOpeningFromMain();

      electron.sendMenuCommand('open-url');

      expect(dialog()).toBeInTheDocument();
    });

    it('loads what was typed and closes', async () => {
      renderPlayer();
      electron.sendMenuCommand('open-url');

      fireEvent.change(urlField(), { target: { value: '  magnet:?xt=urn:btih:aaa  ' } });
      fireEvent.submit(urlField());

      expect(electron.api.loadTorrent).toHaveBeenCalledWith('magnet:?xt=urn:btih:aaa');
      expect(dialog()).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByText('Movie.mkv')).toBeInTheDocument());
    });

    it('does not submit an empty URL', () => {
      renderPlayer();
      electron.sendMenuCommand('open-url');

      fireEvent.submit(urlField());

      expect(electron.api.loadTorrent).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
    });

    it('closes on Cancel', () => {
      renderPlayer();
      electron.sendMenuCommand('open-url');

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(dialog()).not.toBeInTheDocument();
    });

    it('closes on Esc without leaving fullscreen', () => {
      renderPlayer();
      electron.setWindowFullscreen(true);
      electron.sendMenuCommand('open-url');

      fireEvent.keyDown(urlField(), { key: 'Escape' });

      expect(dialog()).not.toBeInTheDocument();
      expect(electron.api.setWindowFullscreen).not.toHaveBeenCalled();
    });

    it('does not toggle playback when Space is typed into it', () => {
      const { container } = render(<App />);
      electron.playVideo(VIDEO_URL);
      const video = container.querySelector('video')!;
      video.play = vi.fn();
      electron.sendMenuCommand('open-url');

      fireEvent.keyDown(urlField(), { code: 'Space', key: ' ' });

      expect(video.play).not.toHaveBeenCalled();
    });
  });

  it('File → Close Video stops the torrent and returns to the start screen', async () => {
    render(<App />);
    electron.playVideo(VIDEO_URL);

    electron.sendMenuCommand('close-video');

    expect(electron.api.stopTorrent).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/drag & drop/i)).toBeInTheDocument());
  });

  describe('opening from the menu or the Dock', () => {
    it('leaves the current video and shows loading', () => {
      const { container } = render(<App />);
      electron.playVideo(VIDEO_URL);

      electron.startOpeningFromMain();

      expect(container.querySelector('video')?.getAttribute('src')).toBeFalsy();
      expect(screen.getAllByText('Loading torrent...').length).toBeGreaterThan(0);
    });

    it('shows what opened', () => {
      render(<App />);

      electron.openFromMain(MOVIE);

      expect(screen.getByText('Movie.mkv')).toBeInTheDocument();
    });
  });
});
