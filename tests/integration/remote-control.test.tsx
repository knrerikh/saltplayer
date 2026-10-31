import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '@/renderer/App';
import type { RemoteStatus } from '@/shared/remote';
import { mockElectronAPI } from '../helpers/electron-api';

const VIDEO_URL = 'http://127.0.0.1:1234/video.mkv';

const ON: RemoteStatus = {
  enabled: true,
  urls: ['http://192.168.1.5:8642/?t=secret'],
  qrDataUrl: 'data:image/png;base64,AAAA',
  port: 8642,
  expiresAt: new Date(2026, 10, 30, 12).getTime(),
  portChanged: false,
};
const OFF: RemoteStatus = { enabled: false, urls: [], qrDataUrl: null, port: null, expiresAt: null, portChanged: false };

describe('Remote control (#64)', () => {
  let electron: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    electron = mockElectronAPI();
    electron.api.setRemoteEnabled.mockResolvedValue(ON);
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLVideoElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const openDialog = () => {
    electron.sendMenuCommand('remote-control');
    return screen.getByRole('dialog', { name: 'Remote Control' });
  };

  describe('dialog', () => {
    it('opens from Playback → Remote Control…, switched off', () => {
      render(<App />);
      expect(screen.queryByRole('dialog')).toBeNull();

      openDialog();

      expect(screen.getByRole('switch')).not.toBeChecked();
      expect(screen.queryByRole('img')).toBeNull();
    });

    it('turns the remote on with the switch and shows the link and QR code', async () => {
      render(<App />);
      openDialog();

      fireEvent.click(screen.getByRole('switch'));

      expect(electron.api.setRemoteEnabled).toHaveBeenCalledWith(true);
      expect(await screen.findByDisplayValue(ON.urls[0])).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /QR code/ })).toHaveAttribute('src', ON.qrDataUrl);
      expect(screen.getByRole('switch')).toBeChecked();
    });

    it('turns the remote off again', async () => {
      render(<App />);
      electron.pushRemoteStatus(ON);
      openDialog();
      electron.api.setRemoteEnabled.mockResolvedValue(OFF);

      fireEvent.click(screen.getByRole('switch'));

      expect(electron.api.setRemoteEnabled).toHaveBeenCalledWith(false);
      await waitFor(() => expect(screen.getByRole('switch')).not.toBeChecked());
      expect(screen.queryByDisplayValue(ON.urls[0])).toBeNull();
    });

    it('copies the link', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      render(<App />);
      electron.pushRemoteStatus(ON);
      openDialog();

      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

      expect(writeText).toHaveBeenCalledWith(ON.urls[0]);
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });

    it('says so when there is no local network to connect over', () => {
      render(<App />);
      electron.pushRemoteStatus({ ...ON, urls: [], qrDataUrl: null });
      openDialog();

      expect(screen.getByText(/No local network found/)).toBeInTheDocument();
    });

    it('shows the remote that main started at launch', async () => {
      electron.api.getRemoteStatus.mockResolvedValue(ON);
      render(<App />);
      await waitFor(() => expect(screen.getByText('Remote on')).toBeInTheDocument());
      openDialog();

      expect(screen.getByRole('switch')).toBeChecked();
    });

    it('shows when the link stops working (#74)', () => {
      render(<App />);
      electron.pushRemoteStatus(ON);
      openDialog();

      expect(screen.getByText(/Link valid until/)).toHaveTextContent(new Date(ON.expiresAt!).toLocaleDateString());
    });

    it('does not show an expiry while the remote is off', () => {
      render(<App />);
      openDialog();

      expect(screen.queryByText(/Link valid until/)).toBeNull();
    });

    it('warns that saved links do not work when the usual port was busy (#74)', () => {
      render(<App />);
      electron.pushRemoteStatus({ ...ON, portChanged: true });
      openDialog();

      expect(screen.getByText(/saved links will not work this time/)).toBeInTheDocument();
    });

    it('has no port warning when the usual port was free', () => {
      render(<App />);
      electron.pushRemoteStatus(ON);
      openDialog();

      expect(screen.queryByText(/saved links will not work/)).toBeNull();
    });

    describe('Reset link (#74)', () => {
      const RESET: RemoteStatus = { ...ON, urls: ['http://192.168.1.5:8642/?t=fresh'] };

      it('asks first, because open remotes stop working', () => {
        render(<App />);
        electron.pushRemoteStatus(ON);
        openDialog();

        fireEvent.click(screen.getByRole('button', { name: 'Reset link' }));

        expect(screen.getByText(/stop working/)).toBeInTheDocument();
        expect(electron.api.resetRemoteLink).not.toHaveBeenCalled();
      });

      it('issues the new link once confirmed, and shows it', async () => {
        electron.api.resetRemoteLink.mockResolvedValue(RESET);
        render(<App />);
        electron.pushRemoteStatus(ON);
        openDialog();

        fireEvent.click(screen.getByRole('button', { name: 'Reset link' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reset and show new code' }));

        expect(electron.api.resetRemoteLink).toHaveBeenCalledTimes(1);
        expect(await screen.findByDisplayValue(RESET.urls[0])).toBeInTheDocument();
        expect(screen.queryByDisplayValue(ON.urls[0])).toBeNull();
        expect(screen.queryByText(/stop working/)).toBeNull();
      });

      it('does nothing when cancelled', () => {
        render(<App />);
        electron.pushRemoteStatus(ON);
        openDialog();

        fireEvent.click(screen.getByRole('button', { name: 'Reset link' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(electron.api.resetRemoteLink).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Reset link' })).toBeInTheDocument();
      });

      it('is not offered while the remote is off', () => {
        render(<App />);
        openDialog();

        expect(screen.queryByRole('button', { name: 'Reset link' })).toBeNull();
      });
    });

    describe('Start at launch (#74)', () => {
      const SETTINGS = { autoplayNext: true, resumePlayback: true, remoteAtLaunch: false };

      it('is off by default and is turned on with the checkbox', () => {
        render(<App />);
        openDialog();
        const checkbox = screen.getByRole('checkbox', { name: 'Start remote control when Salt Player opens' });
        expect(checkbox).not.toBeChecked();

        fireEvent.click(checkbox);

        expect(electron.api.setRemoteAtLaunch).toHaveBeenCalledWith(true);
      });

      it('follows the setting main reports, and turns it off', () => {
        render(<App />);
        electron.changeSettings({ ...SETTINGS, remoteAtLaunch: true });
        openDialog();
        const checkbox = screen.getByRole('checkbox', { name: 'Start remote control when Salt Player opens' });
        expect(checkbox).toBeChecked();

        fireEvent.click(checkbox);

        expect(electron.api.setRemoteAtLaunch).toHaveBeenCalledWith(false);
      });
    });

    it('shows an error when the remote cannot be started', async () => {
      electron.api.setRemoteEnabled.mockRejectedValue(new Error('listen EACCES'));
      render(<App />);
      openDialog();

      fireEvent.click(screen.getByRole('switch'));

      expect(await screen.findByText(/listen EACCES/)).toBeInTheDocument();
      expect(screen.getByRole('switch')).not.toBeChecked();
    });

    it('closes on Esc without leaving fullscreen', () => {
      render(<App />);
      electron.setWindowFullscreen(true);
      openDialog();

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(electron.api.setWindowFullscreen).not.toHaveBeenCalled();
    });

    it('closes on a click on the backdrop but not on one inside', () => {
      const { container } = render(<App />);
      const dialog = openDialog();

      fireEvent.mouseDown(dialog);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.mouseDown(container.querySelector('.dialog-backdrop')!);
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('status bar', () => {
    it('shows Remote on while the remote is enabled, and opens the dialog', () => {
      render(<App />);
      expect(screen.queryByText('Remote on')).toBeNull();

      electron.pushRemoteStatus(ON);
      fireEvent.click(screen.getByText('Remote on'));

      expect(screen.getByRole('dialog', { name: 'Remote Control' })).toBeInTheDocument();
    });

    it('drops it when the remote is turned off', () => {
      render(<App />);
      electron.pushRemoteStatus(ON);

      electron.pushRemoteStatus(OFF);

      expect(screen.queryByText('Remote on')).toBeNull();
    });
  });

  describe('commands from the phone', () => {
    const renderPlayer = () => {
      const view = render(<App />);
      electron.playVideo(VIDEO_URL);
      return view.container.querySelector('video') as HTMLVideoElement;
    };

    it('toggle-play plays a paused video', () => {
      const video = renderPlayer();
      Object.defineProperty(video, 'paused', { value: true, configurable: true });
      vi.mocked(video.play).mockClear();

      electron.sendRemoteCommand({ type: 'toggle-play' });

      expect(video.play).toHaveBeenCalled();
    });

    it('toggle-play pauses a playing video', () => {
      const video = renderPlayer();
      Object.defineProperty(video, 'paused', { value: false, configurable: true });

      electron.sendRemoteCommand({ type: 'toggle-play' });

      expect(video.pause).toHaveBeenCalled();
    });
  });

  describe('state for the phone', () => {
    const renderPlayer = () => {
      const view = render(<App />);
      electron.playVideo(VIDEO_URL);
      return view.container.querySelector('video') as HTMLVideoElement;
    };

    it('is sent once the remote is on, and again when playback starts', () => {
      const video = renderPlayer();

      electron.pushRemoteStatus(ON);
      expect(electron.api.sendRemoteState).toHaveBeenLastCalledWith({
        hasVideo: true,
        title: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 1,
        muted: false,
        isFullscreen: false,
        episodes: [],
        episodeIndex: -1,
        hasPrevious: false,
        hasNext: false,
      });

      act(() => {
        fireEvent.play(video);
      });
      expect(electron.api.sendRemoteState).toHaveBeenLastCalledWith(expect.objectContaining({ isPlaying: true }));
    });

    it('is not sent while the remote is off', () => {
      const video = renderPlayer();

      act(() => {
        fireEvent.play(video);
      });
      act(() => {
        fireEvent.pause(video);
      });

      expect(electron.api.sendRemoteState).not.toHaveBeenCalled();
    });

    it('stops when the remote is turned off', () => {
      const video = renderPlayer();
      electron.pushRemoteStatus(ON);
      electron.pushRemoteStatus(OFF);
      electron.api.sendRemoteState.mockClear();

      act(() => {
        fireEvent.play(video);
      });

      expect(electron.api.sendRemoteState).not.toHaveBeenCalled();
    });

    it('carries the time at most once a second', () => {
      vi.useFakeTimers();
      const video = renderPlayer();
      electron.pushRemoteStatus(ON);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      electron.api.sendRemoteState.mockClear();

      for (const time of [10, 10.3, 10.6]) {
        video.currentTime = time;
        act(() => {
          fireEvent.timeUpdate(video);
        });
      }
      expect(electron.api.sendRemoteState).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(electron.api.sendRemoteState).toHaveBeenCalledTimes(1);
      expect(electron.api.sendRemoteState).toHaveBeenCalledWith(expect.objectContaining({ currentTime: 10.6 }));
    });
  });
});
