import { vi } from 'vitest';
import { act } from '@testing-library/react';
import type { RemoteCommand, RemoteStatus } from '@/shared/remote';
import type { AppSettings, AudioData, MenuCommand, SubtitleData, TorrentMetadata } from '@/shared/types';

/**
 * Installs a complete `window.electronAPI` mock for rendering `<App />` and returns
 * helpers that deliver main-process events the way preload would.
 */
export function mockElectronAPI() {
  const listeners: {
    videoUrl?: (url: string, startAt?: number | null) => void;
    subtitles?: (data: SubtitleData) => void;
    audioTracks?: (data: AudioData) => void;
    windowFullscreen?: (isFullscreen: boolean) => void;
    mediaOpening?: () => void;
    mediaOpened?: (metadata: TorrentMetadata) => void;
    menuCommand?: (command: MenuCommand) => void;
    settingsChanged?: (settings: AppSettings) => void;
    remoteStatus?: (status: RemoteStatus) => void;
    remoteCommand?: (command: RemoteCommand) => void;
  } = {};

  const api = {
    loadTorrent: vi.fn(),
    openVideoFile: vi.fn(),
    stopTorrent: vi.fn(),
    selectFile: vi.fn(),
    prefetchFile: vi.fn().mockResolvedValue(undefined),
    // Never settles unless a test says so: the page keeps its default settings and no
    // state update lands outside act().
    getSettings: vi.fn(() => new Promise<AppSettings>(() => {})),
    playbackControl: vi.fn(),
    playbackSeek: vi.fn(),
    savePlaybackPosition: vi.fn().mockResolvedValue(undefined),
    selectAudioTrack: vi.fn(),
    quit: vi.fn(),
    openExternal: vi.fn(),
    startWindowDrag: vi.fn(),
    moveWindowBy: vi.fn(),
    endWindowDrag: vi.fn(),
    setWindowFullscreen: vi.fn(),
    onTorrentStatus: vi.fn(),
    onVideoUrl: vi.fn((callback: (url: string, startAt?: number | null) => void) => {
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
    onSettingsChanged: vi.fn((callback: (settings: AppSettings) => void) => {
      listeners.settingsChanged = callback;
    }),
    setRemoteEnabled: vi.fn(),
    sendRemoteState: vi.fn(),
    onRemoteStatus: vi.fn((callback: (status: RemoteStatus) => void) => {
      listeners.remoteStatus = callback;
    }),
    onRemoteCommand: vi.fn((callback: (command: RemoteCommand) => void) => {
      listeners.remoteCommand = callback;
    }),
    removeAllListeners: vi.fn(),
  };
  (globalThis.window as any).electronAPI = api;

  return {
    api,
    setWindowFullscreen(isFullscreen: boolean) {
      act(() => listeners.windowFullscreen?.(isFullscreen));
    },
    /** Main hands over a stream, with where to resume it (#51). */
    playVideo(url: string, startAt: number | null = null) {
      act(() => listeners.videoUrl?.(url, startAt));
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
    /** Main turned the remote on or off. */
    pushRemoteStatus(status: RemoteStatus) {
      act(() => listeners.remoteStatus?.(status));
    },
    /** A phone sent a command. */
    sendRemoteCommand(command: RemoteCommand) {
      act(() => listeners.remoteCommand?.(command));
    },
    changeSettings(settings: AppSettings) {
      act(() => listeners.settingsChanged?.(settings));
    },
  };
}
