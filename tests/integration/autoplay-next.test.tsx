import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '@/renderer/App';
import { mockElectronAPI } from '../helpers/electron-api';

const SEASON = {
  name: 'Show S01',
  infoHash: 'aaa',
  totalSize: 3000,
  files: ['S01E01.mkv', 'S01E02.mkv', 'S01E03.mkv'].map((name) => ({ name, size: 1000, path: name })),
};
const DURATION = 1000;
const urlOf = (name: string) => `http://127.0.0.1:1234/${name}`;

describe('Autoplay the next episode (#42)', () => {
  let electron: ReturnType<typeof mockElectronAPI>;
  let video: HTMLVideoElement;

  beforeEach(() => {
    electron = mockElectronAPI();
    electron.api.selectFile.mockResolvedValue(undefined);
  });

  function watch(episode: string) {
    electron.playVideo(urlOf(episode));
    video = document.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: DURATION, configurable: true });
    fireEvent(video, new Event('durationchange'));
  }

  function renderSeason(episode = 'S01E01.mkv') {
    render(<App />);
    electron.openFromMain(SEASON);
    watch(episode);
  }

  function playTo(seconds: number) {
    Object.defineProperty(video, 'currentTime', { value: seconds, writable: true, configurable: true });
    fireEvent(video, new Event('timeupdate'));
  }

  const overlay = () => screen.queryByRole('status');

  it('counts down over the last five seconds', () => {
    renderSeason();

    playTo(DURATION - 6);
    expect(overlay()).not.toBeInTheDocument();

    playTo(DURATION - 4.2);
    expect(overlay()).toHaveTextContent('Next episode in 5 s');

    playTo(DURATION - 0.5);
    expect(overlay()).toHaveTextContent('Next episode in 1 s');
  });

  it('switches to the next episode when the video ends', () => {
    renderSeason();
    playTo(DURATION - 1);

    fireEvent(video, new Event('ended'));

    expect(electron.api.selectFile).toHaveBeenCalledWith('S01E02.mkv');
    expect(electron.api.selectFile).toHaveBeenCalledTimes(1);
  });

  it('switches at once on Play now', () => {
    renderSeason();
    playTo(DURATION - 3);

    fireEvent.click(screen.getByRole('button', { name: 'Play now' }));
    fireEvent(video, new Event('ended'));

    expect(electron.api.selectFile).toHaveBeenCalledTimes(1);
    expect(electron.api.selectFile).toHaveBeenCalledWith('S01E02.mkv');
    expect(overlay()).not.toBeInTheDocument();
  });

  it('lets the episode end normally after Cancel', () => {
    renderSeason();
    playTo(DURATION - 3);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    playTo(DURATION - 1);
    fireEvent(video, new Event('ended'));

    expect(overlay()).not.toBeInTheDocument();
    expect(electron.api.selectFile).not.toHaveBeenCalled();
  });

  it('cancels on Esc without leaving fullscreen', () => {
    renderSeason();
    electron.setWindowFullscreen(true);
    playTo(DURATION - 3);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(overlay()).not.toBeInTheDocument();
    expect(electron.api.setWindowFullscreen).not.toHaveBeenCalled();
  });

  it('stops after the last episode', () => {
    renderSeason('S01E03.mkv');
    playTo(DURATION - 3);

    fireEvent(video, new Event('ended'));

    expect(overlay()).not.toBeInTheDocument();
    expect(electron.api.selectFile).not.toHaveBeenCalled();
  });

  it('counts down again in the next episode', () => {
    renderSeason();
    playTo(DURATION - 1);
    fireEvent(video, new Event('ended'));

    watch('S01E02.mkv');
    expect(overlay()).not.toBeInTheDocument();
    playTo(DURATION - 3);

    expect(overlay()).toHaveTextContent('Next episode in 3 s');
  });

  describe('when turned off in the Playback menu', () => {
    it('neither counts down nor switches', () => {
      renderSeason();
      electron.changeSettings({ autoplayNext: false });
      playTo(DURATION - 3);

      fireEvent(video, new Event('ended'));

      expect(overlay()).not.toBeInTheDocument();
      expect(electron.api.selectFile).not.toHaveBeenCalled();
    });

    it('takes the setting stored in main on start', async () => {
      electron.api.getSettings.mockResolvedValue({ autoplayNext: false });
      renderSeason();
      await act(async () => {});
      playTo(DURATION - 3);

      expect(overlay()).not.toBeInTheDocument();
    });
  });

  describe('prefetching the next episode', () => {
    it('starts two minutes before the end, once', () => {
      renderSeason();

      playTo(DURATION - 130);
      expect(electron.api.prefetchFile).not.toHaveBeenCalled();

      playTo(DURATION - 119);
      playTo(DURATION - 100);
      expect(electron.api.prefetchFile).toHaveBeenCalledTimes(1);
      expect(electron.api.prefetchFile).toHaveBeenCalledWith('S01E02.mkv');
    });

    it('does not fetch past the last episode', () => {
      renderSeason('S01E03.mkv');

      playTo(DURATION - 60);

      expect(electron.api.prefetchFile).not.toHaveBeenCalled();
    });
  });
});
