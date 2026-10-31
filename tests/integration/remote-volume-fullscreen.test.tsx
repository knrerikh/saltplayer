import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '@/renderer/App';
import type { RemoteStatus } from '@/shared/remote';
import { mockElectronAPI } from '../helpers/electron-api';

const VIDEO_URL = 'http://127.0.0.1:1234/video.mkv';
const ON: RemoteStatus = { enabled: true, urls: ['http://192.168.1.5:8642/?t=secret'], qrDataUrl: null, port: 8642 };

describe('Remote control: volume, mute, fullscreen and close (#66)', () => {
  let electron: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    electron = mockElectronAPI();
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLVideoElement.prototype.pause = vi.fn();
  });

  const video = () => document.querySelector('video') as HTMLVideoElement;
  const slider = () => document.querySelector('input.volume-control') as HTMLInputElement;
  const muteButton = () => screen.getByRole('button', { name: /^(mute|unmute)$/i });

  function watch() {
    render(<App />);
    electron.playVideo(VIDEO_URL);
  }

  describe('volume', () => {
    it('set-volume changes the video and the slider', () => {
      watch();

      electron.sendRemoteCommand({ type: 'set-volume', volume: 0.3 });

      expect(video().volume).toBe(0.3);
      expect(slider().value).toBe('0.3');
    });

    it('works without a video, and the next video starts at that volume', () => {
      render(<App />);
      electron.sendRemoteCommand({ type: 'set-volume', volume: 0.4 });

      electron.playVideo(VIDEO_URL);

      expect(video().volume).toBe(0.4);
      expect(slider().value).toBe('0.4');
    });

    it('carries the volume and mute over to the next file', () => {
      watch();
      fireEvent.change(slider(), { target: { value: '0.5' } });
      fireEvent.click(muteButton());

      electron.playVideo('http://127.0.0.1:1234/next.mkv');

      expect(video().volume).toBe(0.5);
      expect(video().muted).toBe(true);
      expect(slider().value).toBe('0.5');
      expect(muteButton()).toHaveAttribute('title', 'Unmute');
    });
  });

  describe('mute', () => {
    it('set-muted mutes and unmutes the video and the button', () => {
      watch();
      expect(muteButton()).toHaveAttribute('title', 'Mute');

      electron.sendRemoteCommand({ type: 'set-muted', muted: true });
      expect(video().muted).toBe(true);
      expect(muteButton()).toHaveAttribute('title', 'Unmute');

      electron.sendRemoteCommand({ type: 'set-muted', muted: false });
      expect(video().muted).toBe(false);
      expect(muteButton()).toHaveAttribute('title', 'Mute');
    });

    it('the button toggles mute in the player', () => {
      watch();

      fireEvent.click(muteButton());
      expect(video().muted).toBe(true);

      fireEvent.click(muteButton());
      expect(video().muted).toBe(false);
    });

    it('the button does not toggle playback', () => {
      watch();

      fireEvent.click(muteButton());

      expect(HTMLVideoElement.prototype.pause).not.toHaveBeenCalled();
    });
  });

  describe('fullscreen', () => {
    it('toggle-fullscreen asks the window for the opposite of the current state', () => {
      watch();

      electron.sendRemoteCommand({ type: 'toggle-fullscreen' });
      expect(electron.api.setWindowFullscreen).toHaveBeenLastCalledWith(true);

      electron.setWindowFullscreen(true);
      electron.sendRemoteCommand({ type: 'toggle-fullscreen' });
      expect(electron.api.setWindowFullscreen).toHaveBeenLastCalledWith(false);
    });

    it('does nothing without a video', () => {
      render(<App />);

      electron.sendRemoteCommand({ type: 'toggle-fullscreen' });

      expect(electron.api.setWindowFullscreen).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('close-video stops the torrent and returns to the start screen', async () => {
      watch();

      electron.sendRemoteCommand({ type: 'close-video' });

      expect(electron.api.stopTorrent).toHaveBeenCalled();
      await waitFor(() => expect(screen.getByText(/drag & drop/i)).toBeInTheDocument());
    });

    it('does nothing without a video', () => {
      render(<App />);

      electron.sendRemoteCommand({ type: 'close-video' });

      expect(electron.api.stopTorrent).not.toHaveBeenCalled();
    });
  });

  describe('state sent to the phone', () => {
    beforeEach(() => {
      watch();
      electron.pushRemoteStatus(ON);
      electron.api.sendRemoteState.mockClear();
    });

    const lastState = () => electron.api.sendRemoteState.mock.lastCall![0];

    it('carries volume, mute and fullscreen', () => {
      electron.sendRemoteCommand({ type: 'set-volume', volume: 0.2 });
      electron.sendRemoteCommand({ type: 'set-muted', muted: true });
      electron.setWindowFullscreen(true);

      expect(lastState()).toEqual(expect.objectContaining({ volume: 0.2, muted: true, isFullscreen: true }));
    });

    it('goes out at once after set-volume', () => {
      electron.sendRemoteCommand({ type: 'set-volume', volume: 0.6 });

      expect(electron.api.sendRemoteState).toHaveBeenCalledTimes(1);
      expect(lastState()).toEqual(expect.objectContaining({ volume: 0.6 }));
    });

    it('goes out at once after set-muted', () => {
      electron.sendRemoteCommand({ type: 'set-muted', muted: true });

      expect(electron.api.sendRemoteState).toHaveBeenCalledTimes(1);
      expect(lastState()).toEqual(expect.objectContaining({ muted: true }));
    });

    it('goes out at once after a fullscreen change', () => {
      electron.setWindowFullscreen(true);

      expect(electron.api.sendRemoteState).toHaveBeenCalledTimes(1);
      expect(lastState()).toEqual(expect.objectContaining({ isFullscreen: true }));
    });

    it('goes out at once after a volume change in the app', () => {
      fireEvent.change(slider(), { target: { value: '0.7' } });

      expect(lastState()).toEqual(expect.objectContaining({ volume: 0.7 }));
    });

    it('goes out at once after the mute button', () => {
      fireEvent.click(muteButton());

      expect(lastState()).toEqual(expect.objectContaining({ muted: true }));
    });

    it('says there is no video after close-video', async () => {
      electron.sendRemoteCommand({ type: 'close-video' });

      await waitFor(() => expect(lastState()).toEqual(expect.objectContaining({ hasVideo: false })));
    });
  });
});
