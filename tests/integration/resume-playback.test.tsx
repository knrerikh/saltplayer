import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '@/renderer/App';
import { mockElectronAPI } from '../helpers/electron-api';

const SEASON = {
  name: 'Show S01',
  infoHash: 'aaa',
  totalSize: 3000,
  files: ['S01E01.mkv', 'S01E02.mkv'].map((name) => ({ name, size: 1000, path: `Show S01/${name}` })),
};
const DURATION = 3000;
const urlOf = (name: string, query = '') => `http://127.0.0.1:1234/${name}${query}`;
const E01 = { infoHash: 'aaa', path: 'Show S01/S01E01.mkv', fileName: 'S01E01.mkv' };

describe('Resume playback (#51)', () => {
  let electron: ReturnType<typeof mockElectronAPI>;
  let video: HTMLVideoElement;

  beforeEach(() => {
    electron = mockElectronAPI();
    electron.api.selectFile.mockResolvedValue(undefined);
    electron.api.stopTorrent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function watch(url: string, startAt: number | null = null) {
    render(<App />);
    electron.openFromMain(SEASON);
    electron.playVideo(url, startAt);
    video = document.querySelector('video')!;
    video.play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, 'duration', { value: DURATION, configurable: true });
    fireEvent(video, new Event('durationchange'));
  }

  function playAt(seconds: number) {
    Object.defineProperty(video, 'currentTime', { value: seconds, writable: true, configurable: true });
    fireEvent(video, new Event('timeupdate'));
  }

  const hint = () => screen.queryByText(/Resumed from/);

  describe('resuming', () => {
    it('starts a file where it was left, with a hint', () => {
      watch(urlOf('S01E01.mkv'), 595);

      expect(video.currentTime).toBe(595);
      expect(hint()).toHaveTextContent('Resumed from 9:55');
    });

    it('restarts a transcoded stream from that point and shows the right time', () => {
      watch(urlOf('S01E01.mkv', '?transcode=true'), 595);

      expect(new URL(video.src).searchParams.get('startTime')).toBe('595');
      playAt(1);
      expect(screen.getByText(/9:56/)).toBeInTheDocument();
    });

    it('starts over from the beginning on request', () => {
      watch(urlOf('S01E01.mkv'), 595);

      fireEvent.click(screen.getByRole('button', { name: 'Start over' }));

      expect(video.currentTime).toBe(0);
      expect(electron.api.playbackSeek).toHaveBeenCalledWith(0);
      expect(hint()).not.toBeInTheDocument();
    });

    it('hides the hint after a few seconds', () => {
      vi.useFakeTimers();
      watch(urlOf('S01E01.mkv'), 595);

      act(() => vi.advanceTimersByTime(6000));

      expect(hint()).not.toBeInTheDocument();
    });

    it('starts from the beginning with no hint when there is nothing to resume', () => {
      watch(urlOf('S01E01.mkv'));

      expect(hint()).not.toBeInTheDocument();
    });
  });

  describe('saving where playback is', () => {
    const saved = () => electron.api.savePlaybackPosition.mock.calls;

    function startPlaying() {
      watch(urlOf('S01E01.mkv'));
      fireEvent(video, new Event('play'));
    }

    it('saves every ten seconds of playback', () => {
      startPlaying();

      playAt(12);
      playAt(15);
      playAt(23);

      expect(saved()).toEqual([
        [E01, 12, DURATION],
        [E01, 23, DURATION],
      ]);
    });

    it('saves at once on pause', () => {
      startPlaying();
      playAt(15);

      fireEvent(video, new Event('pause'));

      expect(saved()).toContainEqual([E01, 15, DURATION]);
    });

    it('saves the last position when the video is closed', async () => {
      startPlaying();
      playAt(15);

      electron.sendMenuCommand('close-video');
      await act(async () => {});

      expect(saved().at(-1)).toEqual([E01, 15, DURATION]);
    });

    it('saves nothing for a file that never started playing', () => {
      watch(urlOf('S01E01.mkv'));
      fireEvent(video, new Event('pause'));

      electron.sendMenuCommand('close-video');

      expect(saved()).toEqual([]);
    });
  });
});
