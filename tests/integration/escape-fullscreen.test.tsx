import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import App from '@/renderer/App';
import { mockElectronAPI } from '../helpers/electron-api';

describe('Esc leaves window fullscreen (#26)', () => {
  let electron: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    electron = mockElectronAPI();
  });

  it('asks the main process to leave fullscreen', () => {
    render(<App />);
    electron.setWindowFullscreen(true);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(electron.api.exitWindowFullscreen).toHaveBeenCalledTimes(1);
  });

  it('does nothing in a normal window', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(electron.api.exitWindowFullscreen).not.toHaveBeenCalled();
  });

  it('first closes an open menu, then leaves fullscreen on the next press', () => {
    const { container } = render(<App />);
    electron.playVideo('http://127.0.0.1:1234/video.mkv');
    electron.sendSubtitles({
      tracks: [{ index: 2, language: 'eng', title: 'English', url: 'http://127.0.0.1:1234/subtitle/2.vtt' }],
      hasEmbeddedSubtitles: true,
    });
    electron.setWindowFullscreen(true);
    fireEvent.click(container.querySelector('.subtitle-control-arrow')!);
    expect(container.querySelector('.subtitle-menu')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(container.querySelector('.subtitle-menu')).toBeNull();
    expect(electron.api.exitWindowFullscreen).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(electron.api.exitWindowFullscreen).toHaveBeenCalledTimes(1);
  });
});
