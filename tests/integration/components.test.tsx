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
});

