import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import App from '@/renderer/App';
import { mockElectronAPI } from '../helpers/electron-api';

const DIRECT = 'http://127.0.0.1:1234/video.mkv';
const TRANSCODED = `${DIRECT}?transcode=true`;
const TRACK = 'http://127.0.0.1:1234/subtitle/2.vtt';

describe('Subtitles follow the restarted stream (#79)', () => {
  let electron: ReturnType<typeof mockElectronAPI>;
  let video: HTMLVideoElement;

  beforeEach(() => {
    electron = mockElectronAPI();
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLVideoElement.prototype.pause = vi.fn();
  });

  function watch(url: string, startAt: number | null = null) {
    render(<App />);
    electron.playVideo(url, startAt);
    electron.sendSubtitles({
      hasEmbeddedSubtitles: true,
      tracks: [{ index: 2, language: 'eng', url: TRACK }],
    });
    video = document.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 600, configurable: true });
    fireEvent(video, new Event('durationchange'));
    fireEvent.click(screen.getByTitle('Enable subtitles'));
  }

  const track = () => document.querySelector('track');

  it('a transcoded stream resumed at a position loads the track from there', () => {
    watch(TRANSCODED, 130.9);

    expect(track()?.getAttribute('src')).toBe(`${TRACK}?startTime=130`);
  });

  it('a transcoded stream from the start loads the whole track', () => {
    watch(TRANSCODED);

    expect(track()?.getAttribute('src')).toBe(TRACK);
  });

  it('a seek reloads the track from the new time, as a new element that is shown', () => {
    watch(TRANSCODED);
    const before = track();

    electron.sendRemoteCommand({ type: 'seek-to', time: 250.7 });

    expect(track()?.getAttribute('src')).toBe(`${TRACK}?startTime=250`);
    expect(track()).not.toBe(before);
    expect(track()?.hasAttribute('default')).toBe(true);
  });

  it('seeking back to the start loads the whole track again', () => {
    watch(TRANSCODED, 300);

    electron.sendRemoteCommand({ type: 'seek-to', time: 0 });

    expect(track()?.getAttribute('src')).toBe(TRACK);
  });

  it('a direct video never gets a start time, and keeps its track on a seek', () => {
    watch(DIRECT, 130);
    const before = track();
    expect(before?.getAttribute('src')).toBe(TRACK);

    electron.sendRemoteCommand({ type: 'seek-to', time: 250 });

    expect(track()).toBe(before);
    expect(track()?.getAttribute('src')).toBe(TRACK);
  });
});
