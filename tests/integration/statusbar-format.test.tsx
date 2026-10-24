import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBar from '@/renderer/components/StatusBar';
import type { TorrentMetadata, TorrentStatus } from '@/shared/types';

const KB = 1024;
const MB = 1024 * KB;
const movie: TorrentMetadata = {
  name: 'Movie',
  files: [{ name: 'Movie.mkv', size: 3000 * MB, path: 'Movie.mkv' }],
  totalSize: 3000 * MB,
  infoHash: 'aaa',
};

function renderWith(speeds: Partial<TorrentStatus>) {
  const status: TorrentStatus = {
    progress: 9.7,
    downloadSpeed: 0,
    uploadSpeed: 0,
    numPeers: 28,
    downloaded: 354 * MB,
    uploaded: 0,
    timeRemaining: 0,
    isReady: true,
    isBuffering: false,
    ...speeds,
  };
  render(<StatusBar status={status} metadata={movie} currentVideoFile={movie.files[0]} videoDuration={3500} />);
}

const download = () => screen.getByText('↓').nextElementSibling!;
const upload = () => screen.getByText('↑').nextElementSibling!;
const downloadArrowColour = () => (screen.getByText('↓') as HTMLElement).style.color;

describe('StatusBar speeds (#58)', () => {
  it('shows peer chatter while nothing downloads as idle', () => {
    renderWith({ downloadSpeed: 909.8, uploadSpeed: 1.48 * KB });

    expect(download()).toHaveTextContent('0.0 KB/s');
    expect(upload()).toHaveTextContent('0.0 KB/s');
    expect(downloadArrowColour()).toBe('var(--text-secondary)');
  });

  it('shows real downloading from 2 KB/s', () => {
    renderWith({ downloadSpeed: 2 * KB });

    expect(download()).toHaveTextContent('2.0 KB/s');
    expect(downloadArrowColour()).not.toBe('var(--text-secondary)');
  });

  it.each([
    [512 * KB, '512.0 KB/s'],
    [2.5 * MB, '2.5 MB/s'],
    [12.34 * MB, '12.3 MB/s'],
  ])('formats %d B/s as %s, one decimal, never in B/s', (downloadSpeed, shown) => {
    renderWith({ downloadSpeed });

    expect(download()).toHaveTextContent(shown);
  });
});
