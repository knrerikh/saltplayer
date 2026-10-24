import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBar from '@/renderer/components/StatusBar';
import type { TorrentMetadata, TorrentStatus } from '@/shared/types';

const GB = 1024 ** 3;
const episodes = [1, 2, 3].map((n) => ({ name: `S01E0${n}.mkv`, size: 3 * GB, path: `S01E0${n}.mkv` }));
const season: TorrentMetadata = { name: 'Show S01', files: episodes, totalSize: 9 * GB, infoHash: 'aaa' };
const status: TorrentStatus = {
  progress: 10,
  downloadSpeed: 0,
  uploadSpeed: 0,
  numPeers: 3,
  downloaded: 0.3 * GB,
  uploaded: 0,
  timeRemaining: 0,
  isReady: true,
  isBuffering: false,
};

const sizeShown = () => screen.getByText('Size:').nextElementSibling?.textContent;

describe('StatusBar size (#55)', () => {
  it('shows the size of the episode playing, not of the whole season', () => {
    render(<StatusBar status={status} metadata={season} currentVideoFile={episodes[1]} />);

    expect(sizeShown()).toBe('3.00 GB');
  });

  it('shows the episode size before the first status update too', () => {
    render(<StatusBar status={null} metadata={season} currentVideoFile={episodes[1]} />);

    expect(sizeShown()).toBe('3.00 GB');
  });

  it('falls back to the whole size while no file is playing yet', () => {
    render(<StatusBar status={null} metadata={season} currentVideoFile={null} />);

    expect(sizeShown()).toBe('9.00 GB');
  });
});
