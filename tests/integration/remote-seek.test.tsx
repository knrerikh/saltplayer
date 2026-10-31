import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import App from '@/renderer/App';
import type { RemoteStatus } from '@/shared/remote';
import { mockElectronAPI } from '../helpers/electron-api';

const DIRECT = 'http://127.0.0.1:1234/video.mkv';
const TRANSCODED = `${DIRECT}?transcode=true`;
const DURATION = 600;
const ON: RemoteStatus = { enabled: true, urls: ['http://192.168.1.5:8642/?t=secret'], qrDataUrl: null, port: 8642 };

describe('Remote control: seek (#65)', () => {
  let electron: ReturnType<typeof mockElectronAPI>;
  let video: HTMLVideoElement;

  beforeEach(() => {
    electron = mockElectronAPI();
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLVideoElement.prototype.pause = vi.fn();
  });

  function watch(url: string | null, duration = DURATION) {
    render(<App />);
    if (url) electron.playVideo(url);
    video = document.querySelector('video')!;
    if (!video) return;
    Object.defineProperty(video, 'duration', { value: duration, configurable: true });
    fireEvent(video, new Event('durationchange'));
  }

  function playAt(seconds: number) {
    Object.defineProperty(video, 'currentTime', { value: seconds, writable: true, configurable: true });
    fireEvent(video, new Event('timeupdate'));
  }

  describe('a direct video', () => {
    beforeEach(() => {
      watch(DIRECT);
      playAt(100);
    });

    it('seek-by moves from the current time and tells the engine', () => {
      electron.sendRemoteCommand({ type: 'seek-by', seconds: 30 });

      expect(video.currentTime).toBe(130);
      expect(electron.api.playbackSeek).toHaveBeenCalledWith(130);
    });

    it('seek-by goes back', () => {
      electron.sendRemoteCommand({ type: 'seek-by', seconds: -10 });

      expect(video.currentTime).toBe(90);
    });

    it('seek-to moves to that time', () => {
      electron.sendRemoteCommand({ type: 'seek-to', time: 400 });

      expect(video.currentTime).toBe(400);
      expect(electron.api.playbackSeek).toHaveBeenCalledWith(400);
    });

    it('stops at the start and at the end', () => {
      electron.sendRemoteCommand({ type: 'seek-by', seconds: -3000 });
      expect(video.currentTime).toBe(0);

      electron.sendRemoteCommand({ type: 'seek-to', time: DURATION + 50 });
      expect(video.currentTime).toBe(DURATION);
      expect(electron.api.playbackSeek).toHaveBeenLastCalledWith(DURATION);
    });
  });

  it('restarts a transcoded stream from the new time', () => {
    watch(TRANSCODED);
    playAt(100);

    electron.sendRemoteCommand({ type: 'seek-to', time: 250.7 });

    expect(new URL(video.src).searchParams.get('startTime')).toBe('250');
    expect(electron.api.playbackSeek).toHaveBeenCalledWith(250.7);
  });

  it('does nothing without a video', () => {
    watch(null);

    electron.sendRemoteCommand({ type: 'seek-to', time: 50 });
    electron.sendRemoteCommand({ type: 'seek-by', seconds: 10 });

    expect(electron.api.playbackSeek).not.toHaveBeenCalled();
  });

  it('does nothing before the duration is known', () => {
    watch(DIRECT, NaN);
    playAt(5);

    electron.sendRemoteCommand({ type: 'seek-by', seconds: 10 });

    expect(video.currentTime).toBe(5);
    expect(electron.api.playbackSeek).not.toHaveBeenCalled();
  });

  it('sends the new time to the phone at once, not on the next tick', () => {
    vi.useFakeTimers();
    try {
      watch(DIRECT);
      playAt(100);
      electron.pushRemoteStatus(ON);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      electron.api.sendRemoteState.mockClear();

      electron.sendRemoteCommand({ type: 'seek-by', seconds: 30 });

      expect(electron.api.sendRemoteState).toHaveBeenCalledTimes(1);
      expect(electron.api.sendRemoteState).toHaveBeenCalledWith(
        expect.objectContaining({ currentTime: 130, duration: DURATION }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
