import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import App from '@/renderer/App';
import { MAX_EPISODE_NAME_LENGTH, MAX_REMOTE_EPISODES, type RemoteStatus } from '@/shared/remote';
import { mockElectronAPI } from '../helpers/electron-api';

const ON: RemoteStatus = { enabled: true, urls: ['http://192.168.1.5:8642/?t=secret'], qrDataUrl: null, port: 8642 };
const NAMES = ['S01E01.mkv', 'S01E02.mkv', 'S01E03.mkv'];
const torrent = (names: string[]) => ({
  name: 'Show S01',
  infoHash: 'aaa',
  totalSize: 1000 * names.length,
  files: names.map((name) => ({ name, size: 1000, path: `Show S01/${name}` })),
});
const urlOf = (name: string) => `http://127.0.0.1:1234/${encodeURIComponent(name)}`;

describe('Remote control: episodes (#67)', () => {
  let electron: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    electron = mockElectronAPI();
    electron.api.selectFile.mockResolvedValue(undefined);
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLVideoElement.prototype.pause = vi.fn();
  });

  function watch(episode: string, names = NAMES) {
    render(<App />);
    electron.openFromMain(torrent(names));
    electron.playVideo(urlOf(episode));
  }

  describe('commands', () => {
    it('next-episode selects the following file', () => {
      watch('S01E01.mkv');

      electron.sendRemoteCommand({ type: 'next-episode' });

      expect(electron.api.selectFile).toHaveBeenCalledTimes(1);
      expect(electron.api.selectFile).toHaveBeenCalledWith('S01E02.mkv');
    });

    it('previous-episode selects the preceding file', () => {
      watch('S01E03.mkv');

      electron.sendRemoteCommand({ type: 'previous-episode' });

      expect(electron.api.selectFile).toHaveBeenCalledTimes(1);
      expect(electron.api.selectFile).toHaveBeenCalledWith('S01E02.mkv');
    });

    it('does nothing at the ends', () => {
      watch('S01E01.mkv');
      electron.sendRemoteCommand({ type: 'previous-episode' });

      electron.playVideo(urlOf('S01E03.mkv'));
      electron.sendRemoteCommand({ type: 'next-episode' });

      expect(electron.api.selectFile).not.toHaveBeenCalled();
    });

    it('does nothing without a video', () => {
      render(<App />);
      electron.openFromMain(torrent(NAMES));

      electron.sendRemoteCommand({ type: 'next-episode' });
      electron.sendRemoteCommand({ type: 'select-episode', name: 'S01E02.mkv' });

      expect(electron.api.selectFile).not.toHaveBeenCalled();
    });

    it('select-episode selects a file of the playlist', () => {
      watch('S01E01.mkv');

      electron.sendRemoteCommand({ type: 'select-episode', name: 'S01E03.mkv' });

      expect(electron.api.selectFile).toHaveBeenCalledTimes(1);
      expect(electron.api.selectFile).toHaveBeenCalledWith('S01E03.mkv');
    });

    it.each(['S01E09.mkv', 'Show S01/S01E02.mkv', '../../etc/passwd'])('select-episode ignores %s, which is not in the playlist', (name) => {
      watch('S01E01.mkv');

      electron.sendRemoteCommand({ type: 'select-episode', name });

      expect(electron.api.selectFile).not.toHaveBeenCalled();
    });

    it('does nothing for a single local file', () => {
      watch('Film.mkv', ['Film.mkv']);

      electron.sendRemoteCommand({ type: 'next-episode' });
      electron.sendRemoteCommand({ type: 'select-episode', name: 'Film.mkv' });

      expect(electron.api.selectFile).not.toHaveBeenCalled();
    });
  });

  describe('state sent to the phone', () => {
    const lastState = () => electron.api.sendRemoteState.mock.lastCall![0];

    function watchRemotely(episode: string, names = NAMES) {
      watch(episode, names);
      electron.pushRemoteStatus(ON);
    }

    it('carries file names, the position and what is before and after', () => {
      watchRemotely('S01E02.mkv');

      expect(lastState()).toEqual(expect.objectContaining({
        episodes: NAMES, episodeIndex: 1, hasPrevious: true, hasNext: true,
      }));
    });

    it('carries no paths', () => {
      watchRemotely('S01E02.mkv');

      expect(JSON.stringify(lastState())).not.toContain('Show S01/');
    });

    it('lists the episodes in the order of the player, not of the torrent', () => {
      watchRemotely('S01E02.mkv', ['S01E10.mkv', 'S01E02.mkv', 'S01E01.mkv']);

      expect(lastState().episodes).toEqual(['S01E01.mkv', 'S01E02.mkv', 'S01E10.mkv']);
    });

    it('says there is no previous episode at the first and no next at the last', () => {
      watchRemotely('S01E01.mkv');
      expect(lastState()).toEqual(expect.objectContaining({ episodeIndex: 0, hasPrevious: false, hasNext: true }));

      electron.playVideo(urlOf('S01E03.mkv'));
      expect(lastState()).toEqual(expect.objectContaining({ episodeIndex: 2, hasPrevious: true, hasNext: false }));
    });

    it('goes out once, at once, when the episode changes', () => {
      watchRemotely('S01E01.mkv');
      electron.api.sendRemoteState.mockClear();

      electron.playVideo(urlOf('S01E02.mkv'));

      expect(electron.api.sendRemoteState).toHaveBeenCalledTimes(1);
      expect(lastState()).toEqual(expect.objectContaining({ title: 'S01E02.mkv', episodeIndex: 1 }));
    });

    it('goes out once when the playlist arrives', () => {
      render(<App />);
      electron.pushRemoteStatus(ON);
      electron.api.sendRemoteState.mockClear();

      electron.openFromMain(torrent(NAMES));

      expect(electron.api.sendRemoteState).toHaveBeenCalledTimes(1);
      expect(lastState()).toEqual(expect.objectContaining({ episodes: NAMES, episodeIndex: -1 }));
    });

    it('sends an empty list for a single local file', () => {
      watchRemotely('Film.mkv', ['Film.mkv']);

      expect(lastState()).toEqual(expect.objectContaining({
        episodes: [], episodeIndex: -1, hasPrevious: false, hasNext: false,
      }));
    });

    it('caps the list and leaves out names too long to send', () => {
      const many = Array.from({ length: MAX_REMOTE_EPISODES + 20 }, (_, i) => `e${String(i).padStart(4, '0')}.mkv`);
      const tooLong = `${'x'.repeat(MAX_EPISODE_NAME_LENGTH)}.mkv`;
      watchRemotely('e0001.mkv', [...many, tooLong]);

      expect(lastState().episodes).toHaveLength(MAX_REMOTE_EPISODES);
      expect(lastState().episodes).not.toContain(tooLong);
      expect(lastState().episodeIndex).toBe(1);
    });
  });
});
