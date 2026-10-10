import { vi } from 'vitest';
import { act } from '@testing-library/react';
import type { AudioData, SubtitleData } from '@/shared/types';

/**
 * Installs a complete `window.electronAPI` mock for rendering `<App />` and returns
 * helpers that deliver main-process events the way preload would.
 */
export function mockElectronAPI() {
  const listeners: {
    videoUrl?: (url: string) => void;
    subtitles?: (data: SubtitleData) => void;
    audioTracks?: (data: AudioData) => void;
    windowFullscreen?: (isFullscreen: boolean) => void;
  } = {};

  const api = {
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
    setWindowFullscreen: vi.fn(),
    onTorrentStatus: vi.fn(),
    onVideoUrl: vi.fn((callback: (url: string) => void) => {
      listeners.videoUrl = callback;
    }),
    onVideoMetadata: vi.fn(),
    onSubtitles: vi.fn((callback: (data: SubtitleData) => void) => {
      listeners.subtitles = callback;
    }),
    onAudioTracks: vi.fn((callback: (data: AudioData) => void) => {
      listeners.audioTracks = callback;
    }),
    onError: vi.fn(),
    onWindowFullscreen: vi.fn((callback: (isFullscreen: boolean) => void) => {
      listeners.windowFullscreen = callback;
    }),
    removeAllListeners: vi.fn(),
  };
  (globalThis.window as any).electronAPI = api;

  return {
    api,
    setWindowFullscreen(isFullscreen: boolean) {
      act(() => listeners.windowFullscreen?.(isFullscreen));
    },
    playVideo(url: string) {
      act(() => listeners.videoUrl?.(url));
    },
    sendSubtitles(data: SubtitleData) {
      act(() => listeners.subtitles?.(data));
    },
    sendAudioTracks(data: AudioData) {
      act(() => listeners.audioTracks?.(data));
    },
  };
}
