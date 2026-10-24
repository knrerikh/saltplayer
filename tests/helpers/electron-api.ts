import { vi } from 'vitest';
import { act } from '@testing-library/react';
import type { AudioData, MenuCommand, SubtitleData, TorrentMetadata } from '@/shared/types';

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
    mediaOpening?: () => void;
    mediaOpened?: (metadata: TorrentMetadata) => void;
    menuCommand?: (command: MenuCommand) => void;
  } = {};

  const api = {
    loadTorrent: vi.fn(),
    openVideoFile: vi.fn(),
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
    onMediaOpening: vi.fn((callback: () => void) => {
      listeners.mediaOpening = callback;
    }),
    onMediaOpened: vi.fn((callback: (metadata: TorrentMetadata) => void) => {
      listeners.mediaOpened = callback;
    }),
    onMenuCommand: vi.fn((callback: (command: MenuCommand) => void) => {
      listeners.menuCommand = callback;
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
    /** Main started opening a source itself (the app menu, the Dock), then finished. */
    openFromMain(metadata: TorrentMetadata) {
      act(() => listeners.mediaOpening?.());
      act(() => listeners.mediaOpened?.(metadata));
    },
    startOpeningFromMain() {
      act(() => listeners.mediaOpening?.());
    },
    sendMenuCommand(command: MenuCommand) {
      act(() => listeners.menuCommand?.(command));
    },
  };
}
