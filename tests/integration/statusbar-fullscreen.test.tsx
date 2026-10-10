import React from 'react';
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import App from '@/renderer/App';

function mockElectronAPI() {
  let fullscreenCallback: ((isFullscreen: boolean) => void) | undefined;

  (global.window as any).electronAPI = {
    loadTorrent: vi.fn(),
    stopTorrent: vi.fn(),
    selectFile: vi.fn(),
    playbackControl: vi.fn(),
    playbackSeek: vi.fn(),
    selectAudioTrack: vi.fn(),
    quit: vi.fn(),
    openExternal: vi.fn(),
    startWindowDrag: vi.fn(),
    moveWindowBy: vi.fn(),
    endWindowDrag: vi.fn(),
    onTorrentStatus: vi.fn(),
    onVideoUrl: vi.fn(),
    onVideoMetadata: vi.fn(),
    onSubtitles: vi.fn(),
    onAudioTracks: vi.fn(),
    onError: vi.fn(),
    onWindowFullscreen: vi.fn((callback: (isFullscreen: boolean) => void) => {
      fullscreenCallback = callback;
    }),
    removeAllListeners: vi.fn(),
  };

  return {
    setWindowFullscreen(isFullscreen: boolean) {
      act(() => fullscreenCallback?.(isFullscreen));
    },
  };
}

describe('Status bar in fullscreen (#17)', () => {
  let api: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    api = mockElectronAPI();
  });

  it('is shown in a normal window', () => {
    const { container } = render(<App />);

    expect(container.querySelector('.status-bar')).not.toBeNull();
  });

  it('is hidden while the window is fullscreen', () => {
    const { container } = render(<App />);

    api.setWindowFullscreen(true);

    expect(container.querySelector('.status-bar')).toBeNull();
  });

  it('comes back when the window leaves fullscreen', () => {
    const { container } = render(<App />);

    api.setWindowFullscreen(true);
    api.setWindowFullscreen(false);

    expect(container.querySelector('.status-bar')).not.toBeNull();
  });

  it('stops listening when the app unmounts', () => {
    const { unmount } = render(<App />);

    unmount();

    expect(window.electronAPI.removeAllListeners).toHaveBeenCalledWith('window:fullscreen');
  });
});

describe('Player layout', () => {
  // happy-dom does not compute flex layout, so this guards the rule itself: without
  // min-height: 0 a flex item cannot shrink below its content, and a 1080p <video>
  // grows the container past the window, pushing the status bar off the bottom edge.
  it('lets the video container shrink below the video’s intrinsic height', () => {
    const css = readFileSync(path.resolve(__dirname, '../../src/renderer/styles.css'), 'utf8');
    const rule = css.match(/\n\.video-container\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rule).toMatch(/min-height:\s*0\s*;/);
  });
});
