import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TorrentInput from '@/renderer/components/TorrentInput';
import StatusBar from '@/renderer/components/StatusBar';
import { TorrentStatus, TorrentMetadata } from '@/shared/types';

describe('Component Integration Tests', () => {
  beforeEach(() => {
    // Setup mock electronAPI
    (global.window as any).electronAPI = {
      loadTorrent: vi.fn(),
      stopTorrent: vi.fn(),
      playbackControl: vi.fn(),
      playbackSeek: vi.fn(),
      quit: vi.fn(),
      onTorrentStatus: vi.fn(),
      onVideoUrl: vi.fn(),
      onError: vi.fn(),
      removeAllListeners: vi.fn(),
    };
  });

  describe('TorrentInput', () => {
    it('should render input field and buttons', () => {
      const onLoad = vi.fn();
      render(<TorrentInput onLoad={onLoad} isLoading={false} />);

      expect(screen.getByPlaceholderText(/Enter magnet link/i)).toBeInTheDocument();
      expect(screen.getByText('Load')).toBeInTheDocument();
      expect(screen.getByText('Open File')).toBeInTheDocument();
    });

    it('should call onLoad when Load button is clicked', async () => {
      const user = userEvent.setup();
      const onLoad = vi.fn();
      render(<TorrentInput onLoad={onLoad} isLoading={false} />);

      const input = screen.getByPlaceholderText(/Enter magnet link/i);
      const loadButton = screen.getByText('Load');

      await user.type(input, 'magnet:?xt=urn:btih:test123');
      await user.click(loadButton);

      expect(onLoad).toHaveBeenCalledWith('magnet:?xt=urn:btih:test123');
    });

    it('should call onLoad when Enter is pressed', async () => {
      const user = userEvent.setup();
      const onLoad = vi.fn();
      render(<TorrentInput onLoad={onLoad} isLoading={false} />);

      const input = screen.getByPlaceholderText(/Enter magnet link/i);

      await user.type(input, 'magnet:?xt=urn:btih:test123{Enter}');

      expect(onLoad).toHaveBeenCalledWith('magnet:?xt=urn:btih:test123');
    });

    it('should disable inputs while loading', () => {
      const onLoad = vi.fn();
      render(<TorrentInput onLoad={onLoad} isLoading={true} />);

      expect(screen.getByPlaceholderText(/Enter magnet link/i)).toBeDisabled();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should not call onLoad with empty input', async () => {
      const user = userEvent.setup();
      const onLoad = vi.fn();
      render(<TorrentInput onLoad={onLoad} isLoading={false} />);

      const loadButton = screen.getByText('Load');
      await user.click(loadButton);

      expect(onLoad).not.toHaveBeenCalled();
    });

    it('should trim whitespace from input', async () => {
      const user = userEvent.setup();
      const onLoad = vi.fn();
      render(<TorrentInput onLoad={onLoad} isLoading={false} />);

      const input = screen.getByPlaceholderText(/Enter magnet link/i);
      const loadButton = screen.getByText('Load');

      await user.type(input, '  magnet:?xt=urn:btih:test  ');
      await user.click(loadButton);

      expect(onLoad).toHaveBeenCalledWith('magnet:?xt=urn:btih:test');
    });
  });

  describe('StatusBar', () => {
    const mockStatus: TorrentStatus = {
      progress: 45.5,
      downloadSpeed: 1024 * 1024 * 2.5, // 2.5 MB/s
      uploadSpeed: 1024 * 512, // 512 KB/s
      numPeers: 15,
      downloaded: 1024 * 1024 * 100, // 100 MB
      uploaded: 1024 * 1024 * 20, // 20 MB
      timeRemaining: 300,
      isReady: true,
      isBuffering: false,
    };

    const mockMetadata: TorrentMetadata = {
      name: 'Test Movie.mp4',
      files: [],
      totalSize: 1024 * 1024 * 700,
      infoHash: 'abc123',
    };

    it('should display "Ready" when no status', () => {
      render(<StatusBar status={null} metadata={null} />);
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('should display torrent name', () => {
      render(<StatusBar status={mockStatus} metadata={mockMetadata} />);
      expect(screen.getByText('Test Movie.mp4')).toBeInTheDocument();
    });

    it('should display progress percentage', () => {
      render(<StatusBar status={mockStatus} metadata={mockMetadata} />);
      expect(screen.getByText('45.5%')).toBeInTheDocument();
    });

    it('should display number of peers', () => {
      render(<StatusBar status={mockStatus} metadata={mockMetadata} />);
      expect(screen.getByText('15')).toBeInTheDocument();
    });

    it('should format download speed', () => {
      render(<StatusBar status={mockStatus} metadata={mockMetadata} />);
      expect(screen.getByText(/2\.50 MB\/s/i)).toBeInTheDocument();
    });

    it('should format upload speed', () => {
      render(<StatusBar status={mockStatus} metadata={mockMetadata} />);
      expect(screen.getByText(/512\.00 KB\/s/i)).toBeInTheDocument();
    });

    it('should format downloaded size', () => {
      render(<StatusBar status={mockStatus} metadata={mockMetadata} />);
      expect(screen.getByText(/100\.00 MB/i)).toBeInTheDocument();
    });

    it('should display progress bar', () => {
      render(<StatusBar status={mockStatus} metadata={mockMetadata} />);
      const progressBar = document.querySelector('.progress-fill');
      expect(progressBar).toHaveStyle({ width: '45.5%' });
    });
  });

  describe('Component Integration Flow', () => {
    it('should handle full user flow: input -> load -> status update', async () => {
      const user = userEvent.setup();
      let onLoadCallback: (source: string) => void;
      
      const MockApp = () => {
        const [isLoading, setIsLoading] = React.useState(false);
        const [status, setStatus] = React.useState<TorrentStatus | null>(null);
        const [metadata, setMetadata] = React.useState<TorrentMetadata | null>(null);

        const handleLoad = async (source: string) => {
          setIsLoading(true);
          // Simulate loading
          setTimeout(() => {
            setMetadata({
              name: 'Movie.mp4',
              files: [],
              totalSize: 1024 * 1024 * 500,
              infoHash: 'abc',
            });
            setStatus({
              progress: 10,
              downloadSpeed: 1024 * 1024,
              uploadSpeed: 0,
              numPeers: 5,
              downloaded: 0,
              uploaded: 0,
              timeRemaining: 600,
              isReady: false,
              isBuffering: true,
            });
            setIsLoading(false);
          }, 100);
        };

        return (
          <>
            <TorrentInput onLoad={handleLoad} isLoading={isLoading} />
            <StatusBar status={status} metadata={metadata} />
          </>
        );
      };

      render(<MockApp />);

      // Initial state
      expect(screen.getByText('Ready')).toBeInTheDocument();

      // User enters magnet link
      const input = screen.getByPlaceholderText(/Enter magnet link/i);
      await user.type(input, 'magnet:?xt=urn:btih:test');
      await user.click(screen.getByText('Load'));

      // Wait for status update
      await waitFor(() => {
        expect(screen.getByText('Movie.mp4')).toBeInTheDocument();
      }, { timeout: 200 });

      expect(screen.getByText('10.0%')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  describe('StatusBar Speed Quality Indicator', () => {
    const mockMetadata: TorrentMetadata = {
      name: 'Test Movie.mp4',
      files: [],
      totalSize: 1024 * 1024 * 700,
      infoHash: 'abc123',
    };

    it('should show gray arrow when download speed is 0', () => {
      const status: TorrentStatus = {
        progress: 50,
        downloadSpeed: 0,
        uploadSpeed: 0,
        numPeers: 10,
        downloaded: 1024 * 1024 * 100,
        uploaded: 0,
        timeRemaining: 300,
        isReady: true,
        isBuffering: false,
      };

      render(<StatusBar status={status} metadata={mockMetadata} />);
      const arrow = screen.getByText('↓');
      expect(arrow.style.color).toBe('var(--text-secondary)');
    });

    it('should show green arrow when speed is sufficient for playback', () => {
      // 1 GB file, 100 seconds duration -> requires ~10 MB/s + 30% buffer = ~13 MB/s
      const videoFile = { name: 'test.mp4', size: 1024 * 1024 * 1024, path: '/test.mp4' };
      const status: TorrentStatus = {
        progress: 50,
        downloadSpeed: 15 * 1024 * 1024, // 15 MB/s - more than required 13 MB/s
        uploadSpeed: 0,
        numPeers: 10,
        downloaded: 1024 * 1024 * 500,
        uploaded: 0,
        timeRemaining: 300,
        isReady: true,
        isBuffering: false,
      };

      render(
        <StatusBar 
          status={status} 
          metadata={mockMetadata}
          currentVideoFile={videoFile}
          videoDuration={100}
        />
      );
      const arrow = screen.getByText('↓');
      expect(arrow.style.color).toBe('#4aff4a'); // Green
    });

    it('should show yellow arrow when speed is close to minimum (80-100%)', () => {
      // 1 GB file, 100 seconds duration -> requires ~13 MB/s
      const videoFile = { name: 'test.mp4', size: 1024 * 1024 * 1024, path: '/test.mp4' };
      const status: TorrentStatus = {
        progress: 50,
        downloadSpeed: 11 * 1024 * 1024, // 11 MB/s - ~85% of required 13 MB/s
        uploadSpeed: 0,
        numPeers: 10,
        downloaded: 1024 * 1024 * 500,
        uploaded: 0,
        timeRemaining: 300,
        isReady: true,
        isBuffering: false,
      };

      render(
        <StatusBar 
          status={status} 
          metadata={mockMetadata}
          currentVideoFile={videoFile}
          videoDuration={100}
        />
      );
      const arrow = screen.getByText('↓');
      expect(arrow.style.color).toBe('#ffaa00'); // Yellow
    });

    it('should show red arrow when speed is insufficient (< 80%)', () => {
      // 1 GB file, 100 seconds duration -> requires ~13 MB/s
      const videoFile = { name: 'test.mp4', size: 1024 * 1024 * 1024, path: '/test.mp4' };
      const status: TorrentStatus = {
        progress: 50,
        downloadSpeed: 8 * 1024 * 1024, // 8 MB/s - ~62% of required 13 MB/s
        uploadSpeed: 0,
        numPeers: 10,
        downloaded: 1024 * 1024 * 500,
        uploaded: 0,
        timeRemaining: 300,
        isReady: true,
        isBuffering: false,
      };

      render(
        <StatusBar 
          status={status} 
          metadata={mockMetadata}
          currentVideoFile={videoFile}
          videoDuration={100}
        />
      );
      const arrow = screen.getByText('↓');
      expect(arrow.style.color).toBe('#ff4a4a'); // Red
    });

    it('should use fallback thresholds when video info is not available', () => {
      const status: TorrentStatus = {
        progress: 50,
        downloadSpeed: 1 * 1024 * 1024, // 1 MB/s - between 500 KB/s and 2 MB/s
        uploadSpeed: 0,
        numPeers: 10,
        downloaded: 1024 * 1024 * 500,
        uploaded: 0,
        timeRemaining: 300,
        isReady: true,
        isBuffering: false,
      };

      render(<StatusBar status={status} metadata={mockMetadata} />);
      const arrow = screen.getByText('↓');
      expect(arrow.style.color).toBe('#ffaa00'); // Yellow (fallback)
    });

    it('should show green with fallback when speed > 2 MB/s without video info', () => {
      const status: TorrentStatus = {
        progress: 50,
        downloadSpeed: 3 * 1024 * 1024, // 3 MB/s
        uploadSpeed: 0,
        numPeers: 10,
        downloaded: 1024 * 1024 * 500,
        uploaded: 0,
        timeRemaining: 300,
        isReady: true,
        isBuffering: false,
      };

      render(<StatusBar status={status} metadata={mockMetadata} />);
      const arrow = screen.getByText('↓');
      expect(arrow.style.color).toBe('#4aff4a'); // Green (fallback)
    });

    it('should show red with fallback when speed < 500 KB/s without video info', () => {
      const status: TorrentStatus = {
        progress: 50,
        downloadSpeed: 200 * 1024, // 200 KB/s
        uploadSpeed: 0,
        numPeers: 10,
        downloaded: 1024 * 1024 * 500,
        uploaded: 0,
        timeRemaining: 300,
        isReady: true,
        isBuffering: false,
      };

      render(<StatusBar status={status} metadata={mockMetadata} />);
      const arrow = screen.getByText('↓');
      expect(arrow.style.color).toBe('#ff4a4a'); // Red (fallback)
    });

    it('should calculate minimum speed correctly with 30% buffer', () => {
      // 2 GB file, 7200 seconds (2 hours) duration
      // Required speed without buffer: ~284 KB/s
      // With 30% buffer: ~369 KB/s
      const videoFile = { name: 'movie.mp4', size: 2 * 1024 * 1024 * 1024, path: '/movie.mp4' };
      const status: TorrentStatus = {
        progress: 50,
        downloadSpeed: 400 * 1024, // 400 KB/s - more than required 369 KB/s
        uploadSpeed: 0,
        numPeers: 10,
        downloaded: 1024 * 1024 * 500,
        uploaded: 0,
        timeRemaining: 300,
        isReady: true,
        isBuffering: false,
      };

      render(
        <StatusBar 
          status={status} 
          metadata={mockMetadata}
          currentVideoFile={videoFile}
          videoDuration={7200}
        />
      );
      const arrow = screen.getByText('↓');
      expect(arrow.style.color).toBe('#4aff4a'); // Green
    });

    it('should use fallback calculation when duration is 0 but file size exists', () => {
      // 1.5 GB file with 0 duration -> should use 90 min assumption
      const videoFile = { name: 'movie.mp4', size: 1.5 * 1024 * 1024 * 1024, path: '/movie.mp4' };
      const status: TorrentStatus = {
        progress: 50,
        downloadSpeed: 400 * 1024, // 400 KB/s
        uploadSpeed: 0,
        numPeers: 10,
        downloaded: 1024 * 1024 * 500,
        uploaded: 0,
        timeRemaining: 300,
        isReady: true,
        isBuffering: false,
      };

      render(
        <StatusBar 
          status={status} 
          metadata={mockMetadata}
          currentVideoFile={videoFile}
          videoDuration={0}
        />
      );
      const arrow = screen.getByText('↓');
      // Should use fallback: 1.5GB / 90min * 1.2 = ~356 KB/s required
      // 400 KB/s is more than enough
      expect(arrow.style.color).toBe('#4aff4a'); // Green
    });
  });
});

