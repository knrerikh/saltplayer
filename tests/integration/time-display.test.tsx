import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '@/renderer/App';
import { mockElectronAPI } from '../helpers/electron-api';

const MOVIE = { name: 'Movie.mkv', totalSize: 1000, files: [{ name: 'Movie.mkv', size: 1000, path: 'Movie.mkv' }] };

/** Plays Movie.mkv of the given length and moves to `position`. */
function play(length: number, position: number) {
  const electron = mockElectronAPI();
  render(<App />);
  electron.openFromMain(MOVIE);
  electron.playVideo('http://127.0.0.1:1234/Movie.mkv');
  const video = document.querySelector('video')!;
  video.play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(video, 'duration', { value: length, configurable: true });
  fireEvent(video, new Event('durationchange'));
  Object.defineProperty(video, 'currentTime', { value: position, writable: true, configurable: true });
  fireEvent(video, new Event('timeupdate'));
}

describe('Control bar time (#120)', () => {
  it('reads mm:ss for a video under an hour', () => {
    play(17 * 60 + 36, 8);

    expect(screen.getByText('00:08 / 17:36')).toBeInTheDocument();
  });

  it('reads hh:mm:ss for a video of an hour or more, from its first second', () => {
    play(3600 + 52 * 60 + 10, 8);

    expect(screen.getByText('00:00:08 / 01:52:10')).toBeInTheDocument();
  });
});
