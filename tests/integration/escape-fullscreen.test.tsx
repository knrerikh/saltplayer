import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import App from '@/renderer/App';
import { mockElectronAPI } from '../helpers/electron-api';

const VIDEO_URL = 'http://127.0.0.1:1234/video.mkv';

describe('Fullscreen (#26, #29)', () => {
  let electron: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    electron = mockElectronAPI();
  });

  function renderPlayer() {
    const view = render(<App />);
    electron.playVideo(VIDEO_URL);
    return view;
  }

  describe('player fullscreen button', () => {
    it('asks the main process to make the window fullscreen', () => {
      const { getByTitle } = renderPlayer();

      fireEvent.click(getByTitle('Fullscreen'));

      expect(electron.api.setWindowFullscreen).toHaveBeenCalledWith(true);
    });

    it('asks to leave fullscreen when the window already is', () => {
      const { getByTitle } = renderPlayer();
      electron.setWindowFullscreen(true);

      fireEvent.click(getByTitle('Exit fullscreen'));

      expect(electron.api.setWindowFullscreen).toHaveBeenCalledWith(false);
    });

    it('never uses the HTML Fullscreen API, whose Esc handling the page cannot override', () => {
      const requestFullscreen = (HTMLElement.prototype.requestFullscreen = vi.fn());
      const { getByTitle } = renderPlayer();

      fireEvent.click(getByTitle('Fullscreen'));

      expect(requestFullscreen).not.toHaveBeenCalled();
    });
  });

  describe('Esc', () => {
    it('leaves fullscreen', () => {
      render(<App />);
      electron.setWindowFullscreen(true);

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(electron.api.setWindowFullscreen).toHaveBeenCalledWith(false);
    });

    it('does nothing in a normal window', () => {
      render(<App />);

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(electron.api.setWindowFullscreen).not.toHaveBeenCalled();
    });

    it('closes an open subtitle menu first, then leaves fullscreen on the next press', () => {
      const { container } = renderPlayer();
      electron.sendSubtitles({
        tracks: [{ index: 2, language: 'eng', title: 'English', url: 'http://127.0.0.1:1234/subtitle/2.vtt' }],
        hasEmbeddedSubtitles: true,
      });
      electron.setWindowFullscreen(true);
      fireEvent.click(container.querySelector('.subtitle-control-arrow')!);

      fireEvent.keyDown(container.querySelector('.subtitle-control-arrow')!, { key: 'Escape' });

      expect(container.querySelector('.subtitle-menu')).toBeNull();
      expect(electron.api.setWindowFullscreen).not.toHaveBeenCalled();

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(electron.api.setWindowFullscreen).toHaveBeenCalledWith(false);
    });

    it('closes an open audio track menu first, then leaves fullscreen on the next press', () => {
      const { container, getByTitle } = renderPlayer();
      electron.sendAudioTracks({
        tracks: [
          { index: 1, language: 'eng', title: 'English', codec: 'aac', channels: 2 },
          { index: 2, language: 'rus', title: 'Russian', codec: 'ac3', channels: 6 },
        ],
        currentTrackIndex: 0,
      });
      electron.setWindowFullscreen(true);
      fireEvent.click(getByTitle('Audio track'));
      expect(container.querySelector('.audio-menu')).not.toBeNull();

      fireEvent.keyDown(getByTitle('Audio track'), { key: 'Escape' });

      expect(container.querySelector('.audio-menu')).toBeNull();
      expect(electron.api.setWindowFullscreen).not.toHaveBeenCalled();

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(electron.api.setWindowFullscreen).toHaveBeenCalledWith(false);
    });
  });
});
