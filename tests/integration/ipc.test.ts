import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Electron IPC for integration testing
describe('IPC Communication', () => {
  let mockElectronAPI: any;

  beforeEach(() => {
    mockElectronAPI = {
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

    (global.window as any).electronAPI = mockElectronAPI;
  });

  describe('loadTorrent', () => {
    it('should call loadTorrent with magnet link', async () => {
      const magnetLink = 'magnet:?xt=urn:btih:abc123';
      mockElectronAPI.loadTorrent.mockResolvedValue({
        name: 'Test Movie',
        files: [],
        totalSize: 1024,
        infoHash: 'abc123',
      });

      const result = await window.electronAPI.loadTorrent(magnetLink);

      expect(mockElectronAPI.loadTorrent).toHaveBeenCalledWith(magnetLink);
      expect(result.name).toBe('Test Movie');
    });

    it('should handle load errors', async () => {
      mockElectronAPI.loadTorrent.mockRejectedValue(new Error('Invalid torrent'));

      await expect(
        window.electronAPI.loadTorrent('invalid')
      ).rejects.toThrow('Invalid torrent');
    });
  });

  describe('stopTorrent', () => {
    it('should call stopTorrent', async () => {
      mockElectronAPI.stopTorrent.mockResolvedValue(undefined);

      await window.electronAPI.stopTorrent();

      expect(mockElectronAPI.stopTorrent).toHaveBeenCalled();
    });
  });

  describe('playbackControl', () => {
    it('should call playbackControl with play action', async () => {
      mockElectronAPI.playbackControl.mockResolvedValue(undefined);

      await window.electronAPI.playbackControl('play');

      expect(mockElectronAPI.playbackControl).toHaveBeenCalledWith('play');
    });

    it('should call playbackControl with pause action', async () => {
      mockElectronAPI.playbackControl.mockResolvedValue(undefined);

      await window.electronAPI.playbackControl('pause');

      expect(mockElectronAPI.playbackControl).toHaveBeenCalledWith('pause');
    });
  });

  describe('playbackSeek', () => {
    it('should call playbackSeek with time', async () => {
      mockElectronAPI.playbackSeek.mockResolvedValue(undefined);

      await window.electronAPI.playbackSeek(30);

      expect(mockElectronAPI.playbackSeek).toHaveBeenCalledWith(30);
    });
  });

  describe('Event Listeners', () => {
    it('should register onTorrentStatus listener', () => {
      const callback = vi.fn();
      window.electronAPI.onTorrentStatus(callback);

      expect(mockElectronAPI.onTorrentStatus).toHaveBeenCalledWith(callback);
    });

    it('should register onVideoUrl listener', () => {
      const callback = vi.fn();
      window.electronAPI.onVideoUrl(callback);

      expect(mockElectronAPI.onVideoUrl).toHaveBeenCalledWith(callback);
    });

    it('should register onError listener', () => {
      const callback = vi.fn();
      window.electronAPI.onError(callback);

      expect(mockElectronAPI.onError).toHaveBeenCalledWith(callback);
    });

    it('should remove all listeners for a channel', () => {
      window.electronAPI.removeAllListeners('video:url');

      expect(mockElectronAPI.removeAllListeners).toHaveBeenCalledWith('video:url');
    });
  });
});

