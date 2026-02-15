import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TorrentEngine } from '@/main/torrent';
import { StorageManager } from '@/main/storage';

// Mock Electron's BrowserWindow
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

// Mock WebTorrent
const mockWebTorrent = {
  add: vi.fn(),
  destroy: vi.fn(),
  on: vi.fn(),
};

// Mock file object
const createMockFile = (name: string, size: number, offset: number) => ({
  name,
  length: size,
  offset,
  select: vi.fn(),
  deselect: vi.fn(),
  createReadStream: vi.fn(),
});

// Mock torrent object
const createMockTorrent = (files: any[]) => ({
  name: 'Test Torrent',
  files,
  length: files.reduce((sum, f) => sum + f.length, 0),
  infoHash: 'abc123',
  ready: true,
  progress: 0,
  downloadSpeed: 0,
  uploadSpeed: 0,
  numPeers: 0,
  downloaded: 0,
  uploaded: 0,
  timeRemaining: Infinity,
  pieceLength: 16384, // 16KB pieces
  select: vi.fn(),
  on: vi.fn(),
});

describe('TorrentEngine - Optimization', () => {
  let storageManager: StorageManager;
  let torrentEngine: TorrentEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    storageManager = new StorageManager();
    torrentEngine = new TorrentEngine(storageManager);
  });

  afterEach(async () => {
    await torrentEngine.destroy();
  });

  describe('File Selection and Deselection', () => {
    it('should deselect all files except the selected one', async () => {
      // Create mock files representing a multi-episode torrent
      const file1 = createMockFile('Episode 01.mp4', 500 * 1024 * 1024, 0);
      const file2 = createMockFile('Episode 02.mp4', 500 * 1024 * 1024, 500 * 1024 * 1024);
      const file3 = createMockFile('Episode 03.mp4', 500 * 1024 * 1024, 1000 * 1024 * 1024);
      
      const mockTorrent = createMockTorrent([file1, file2, file3]);

      // Mock the private method by accessing it through the class
      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      
      // Set current torrent
      (torrentEngine as any).currentTorrent = mockTorrent;

      // Call prioritization for file1
      prioritizeMethod(file1);

      // Verify all files were deselected first
      expect(file1.deselect).toHaveBeenCalled();
      expect(file2.deselect).toHaveBeenCalled();
      expect(file3.deselect).toHaveBeenCalled();

      // Verify only file1 was selected
      expect(file1.select).toHaveBeenCalled();
      expect(file2.select).not.toHaveBeenCalled();
      expect(file3.select).not.toHaveBeenCalled();
    });

    it('should handle single file torrents correctly', async () => {
      const file1 = createMockFile('Movie.mp4', 1024 * 1024 * 1024, 0);
      const mockTorrent = createMockTorrent([file1]);

      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      (torrentEngine as any).currentTorrent = mockTorrent;

      prioritizeMethod(file1);

      // Should still deselect and reselect
      expect(file1.deselect).toHaveBeenCalled();
      expect(file1.select).toHaveBeenCalled();
    });
  });

  describe('Sequential Piece Prioritization', () => {
    it('should prioritize first pieces with high priority', async () => {
      const fileSize = 500 * 1024 * 1024; // 500MB
      const file1 = createMockFile('Episode 01.mp4', fileSize, 0);
      
      const mockTorrent = createMockTorrent([file1]);
      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      (torrentEngine as any).currentTorrent = mockTorrent;

      prioritizeMethod(file1);

      // Verify torrent.select was called for critical pieces
      // First 10 pieces should be prioritized with high priority (true)
      expect(mockTorrent.select).toHaveBeenCalled();
      
      // Check that select was called with high priority for critical pieces
      const criticalCalls = (mockTorrent.select as any).mock.calls.filter(
        (call: any[]) => call[2] === true
      );
      expect(criticalCalls.length).toBeGreaterThan(0);
      expect(criticalCalls.length).toBeLessThanOrEqual(10);
    });

    it('should calculate correct piece ranges for file', async () => {
      const pieceLength = 16384; // 16KB
      const fileSize = pieceLength * 100; // 100 pieces
      const file1 = createMockFile('Video.mp4', fileSize, 0);
      
      const mockTorrent = createMockTorrent([file1]);
      mockTorrent.pieceLength = pieceLength;
      
      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      (torrentEngine as any).currentTorrent = mockTorrent;

      prioritizeMethod(file1);

      // Should call select for pieces 0-9 (critical) and 10-99 (sequential)
      expect(mockTorrent.select).toHaveBeenCalled();
      
      // Verify at least two select calls: one for critical, one for remaining
      expect((mockTorrent.select as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle files with offset correctly', async () => {
      const pieceLength = 16384; // 16KB
      const fileSize = pieceLength * 50; // 50 pieces
      const offset = pieceLength * 100; // Starts at piece 100
      
      const file2 = createMockFile('Episode 02.mp4', fileSize, offset);
      
      const mockTorrent = createMockTorrent([file2]);
      mockTorrent.pieceLength = pieceLength;
      
      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      (torrentEngine as any).currentTorrent = mockTorrent;

      prioritizeMethod(file2);

      // Should prioritize pieces starting from piece 100
      expect(mockTorrent.select).toHaveBeenCalled();
      
      // Check that first select call starts at piece 100
      const firstCall = (mockTorrent.select as any).mock.calls[0];
      expect(firstCall[0]).toBe(100); // Start piece should be 100
    });

    it('should handle small files with fewer than 10 pieces', async () => {
      const pieceLength = 16384; // 16KB
      const fileSize = pieceLength * 5; // Only 5 pieces
      
      const file1 = createMockFile('Small.mp4', fileSize, 0);
      
      const mockTorrent = createMockTorrent([file1]);
      mockTorrent.pieceLength = pieceLength;
      
      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      (torrentEngine as any).currentTorrent = mockTorrent;

      prioritizeMethod(file1);

      // Should prioritize all 5 pieces as critical
      expect(mockTorrent.select).toHaveBeenCalled();
      
      // Should only have critical piece calls, no sequential call
      const calls = (mockTorrent.select as any).mock.calls;
      const criticalCalls = calls.filter((call: any[]) => call[2] === true);
      expect(criticalCalls.length).toBe(5);
    });
  });

  describe('Bandwidth Optimization', () => {
    it('should prevent downloading multiple episodes simultaneously', async () => {
      // Simulate a TV series torrent with 10 episodes
      const episodes = Array.from({ length: 10 }, (_, i) => 
        createMockFile(`Episode ${String(i + 1).padStart(2, '0')}.mp4`, 500 * 1024 * 1024, i * 500 * 1024 * 1024)
      );
      
      const mockTorrent = createMockTorrent(episodes);
      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      (torrentEngine as any).currentTorrent = mockTorrent;

      // Select first episode
      prioritizeMethod(episodes[0]);

      // All episodes should be deselected
      episodes.forEach(ep => {
        expect(ep.deselect).toHaveBeenCalled();
      });

      // Only first episode should be selected
      expect(episodes[0].select).toHaveBeenCalled();
      episodes.slice(1).forEach(ep => {
        expect(ep.select).not.toHaveBeenCalled();
      });
    });

    it('should switch to new episode when selectFile is called', async () => {
      const episode1 = createMockFile('Episode 01.mp4', 500 * 1024 * 1024, 0);
      const episode2 = createMockFile('Episode 02.mp4', 500 * 1024 * 1024, 500 * 1024 * 1024);
      
      const mockTorrent = createMockTorrent([episode1, episode2]);
      (torrentEngine as any).currentTorrent = mockTorrent;
      
      // Mock server methods
      (torrentEngine as any).server = { close: vi.fn() };
      (torrentEngine as any).startStreamingServer = vi.fn();

      // Select second episode
      await torrentEngine.selectFile('Episode 02.mp4');

      // Should restart streaming server with new file
      expect((torrentEngine as any).startStreamingServer).toHaveBeenCalledWith(mockTorrent, episode2);
    });

    it('should re-apply optimization when switching episodes', async () => {
      const episode1 = createMockFile('Episode 01.mp4', 500 * 1024 * 1024, 0);
      const episode2 = createMockFile('Episode 02.mp4', 500 * 1024 * 1024, 500 * 1024 * 1024);
      
      const mockTorrent = createMockTorrent([episode1, episode2]);
      (torrentEngine as any).currentTorrent = mockTorrent;
      
      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      
      // 1. Select first episode
      prioritizeMethod(episode1);
      
      // Verify episode 1 selected, episode 2 deselected
      expect(episode1.select).toHaveBeenCalled();
      expect(episode2.deselect).toHaveBeenCalled();
      
      // Reset mocks to clear call history
      vi.clearAllMocks();
      
      // 2. Switch to second episode (simulate what happens in selectFile -> startStreamingServer)
      prioritizeMethod(episode2);
      
      // Verify episode 2 selected, episode 1 deselected
      expect(episode2.select).toHaveBeenCalled(); // New file selected
      expect(episode1.deselect).toHaveBeenCalled(); // Old file deselected
      
      // Verify correct piece range calculation for second file
      // Episode 2 starts at 500MB
      expect(mockTorrent.select).toHaveBeenCalled();
      const firstCall = (mockTorrent.select as any).mock.calls[0];
      // 500MB / 16KB = 32000 pieces
      expect(firstCall[0]).toBe(32000); 
    });
  });

  describe('Seek Reprioritization', () => {
    it('should reprioritize selected file from seek target byte', async () => {
      const pieceLength = 100;
      const file = createMockFile('Episode 01.mp4', 1000, 0);
      const mockTorrent = createMockTorrent([file]);
      mockTorrent.pieceLength = pieceLength;

      (torrentEngine as any).currentTorrent = mockTorrent;
      (torrentEngine as any).selectedFile = file;
      (torrentEngine as any).lastKnownDurationSec = 100;

      const prioritizeSpy = vi.spyOn(torrentEngine as any, 'prioritizeStreamingPieces');

      await torrentEngine.seek(30);

      expect(prioritizeSpy).toHaveBeenCalledWith(file, 300);
    });

    it('should clamp seek ratio to file bounds', async () => {
      const file = createMockFile('Episode 01.mp4', 1000, 0);
      const mockTorrent = createMockTorrent([file]);

      (torrentEngine as any).currentTorrent = mockTorrent;
      (torrentEngine as any).selectedFile = file;
      (torrentEngine as any).lastKnownDurationSec = 100;

      const prioritizeSpy = vi.spyOn(torrentEngine as any, 'prioritizeStreamingPieces');

      await torrentEngine.seek(200);

      expect(prioritizeSpy).toHaveBeenCalledWith(file, 1000);
    });

    it('should skip seek reprioritization when duration/time is invalid', async () => {
      const file = createMockFile('Episode 01.mp4', 1000, 0);
      const mockTorrent = createMockTorrent([file]);

      (torrentEngine as any).currentTorrent = mockTorrent;
      (torrentEngine as any).selectedFile = file;

      const prioritizeSpy = vi.spyOn(torrentEngine as any, 'prioritizeStreamingPieces');

      (torrentEngine as any).lastKnownDurationSec = 0;
      await torrentEngine.seek(30);
      await torrentEngine.seek(-1);

      expect(prioritizeSpy).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null currentTorrent gracefully', async () => {
      const file = createMockFile('Video.mp4', 1024 * 1024 * 1024, 0);
      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      
      // currentTorrent is null
      (torrentEngine as any).currentTorrent = null;

      // Should not throw
      expect(() => prioritizeMethod(file)).not.toThrow();
      
      // File methods should not be called
      expect(file.deselect).not.toHaveBeenCalled();
      expect(file.select).not.toHaveBeenCalled();
    });

    it('should handle files with zero offset', async () => {
      const file = createMockFile('Video.mp4', 1024 * 1024 * 1024, 0);
      const mockTorrent = createMockTorrent([file]);
      
      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      (torrentEngine as any).currentTorrent = mockTorrent;

      // Should not throw
      expect(() => prioritizeMethod(file)).not.toThrow();
      
      // Should start from piece 0
      expect(mockTorrent.select).toHaveBeenCalled();
      const firstCall = (mockTorrent.select as any).mock.calls[0];
      expect(firstCall[0]).toBe(0);
    });

    it('should handle very large files correctly', async () => {
      const pieceLength = 16384; // 16KB
      const fileSize = 10 * 1024 * 1024 * 1024; // 10GB
      const file = createMockFile('Large.mp4', fileSize, 0);
      
      const mockTorrent = createMockTorrent([file]);
      mockTorrent.pieceLength = pieceLength;
      
      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      (torrentEngine as any).currentTorrent = mockTorrent;

      // Should not throw
      expect(() => prioritizeMethod(file)).not.toThrow();
      
      // Should still prioritize only first 10 pieces as critical
      expect(mockTorrent.select).toHaveBeenCalled();
      const criticalCalls = (mockTorrent.select as any).mock.calls.filter(
        (call: any[]) => call[2] === true
      );
      expect(criticalCalls.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Console Logging', () => {
    it('should log prioritization information', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      
      const file = createMockFile('Episode 01.mp4', 500 * 1024 * 1024, 0);
      const mockTorrent = createMockTorrent([file]);
      
      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      (torrentEngine as any).currentTorrent = mockTorrent;

      prioritizeMethod(file);

      // Should log file name and piece information
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Prioritized streaming for file:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('File pieces:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Critical pieces:'));
      
      consoleSpy.mockRestore();
    });
  });

  describe('Progress Calculation', () => {
    it('should calculate progress relative to selected file', async () => {
      // Mock a file that is 50% downloaded
      const file = createMockFile('Episode 01.mp4', 500 * 1024 * 1024, 0);
      (file as any).progress = 0.5;

      // Mock a torrent that is 10% downloaded overall (e.g. 1 file out of 10)
      const mockTorrent = createMockTorrent([file]);
      mockTorrent.progress = 0.1;
      
      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      const getStatusMethod = (torrentEngine as any).getStatus.bind(torrentEngine);
      
      (torrentEngine as any).currentTorrent = mockTorrent;
      
      prioritizeMethod(file);

      const status = getStatusMethod();
      
      // Should reflect FILE progress (50%), not torrent progress (10%)
      expect(status.progress).toBe(50);
    });

    it('should fallback to torrent progress if no file is selected', async () => {
      const mockTorrent = createMockTorrent([]);
      mockTorrent.progress = 0.75;
      
      const getStatusMethod = (torrentEngine as any).getStatus.bind(torrentEngine);
      (torrentEngine as any).currentTorrent = mockTorrent;
      (torrentEngine as any).selectedFile = null;

      const status = getStatusMethod();
      
      expect(status.progress).toBe(75);
    });

    it('should calculate buffering status based on selected file', async () => {
      const file = createMockFile('Episode 01.mp4', 500 * 1024 * 1024, 0);
      (file as any).progress = 0.01; // 1% downloaded
      
      const mockTorrent = createMockTorrent([file]);
      mockTorrent.progress = 0.01;

      const prioritizeMethod = (torrentEngine as any).prioritizeStreamingPieces.bind(torrentEngine);
      const getStatusMethod = (torrentEngine as any).getStatus.bind(torrentEngine);
      
      (torrentEngine as any).currentTorrent = mockTorrent;
      prioritizeMethod(file);

      // Should be buffering (< 5%)
      expect(getStatusMethod().isBuffering).toBe(true);

      // Update progress to 10%
      (file as any).progress = 0.1;
      
      // Should not be buffering (> 5%)
      expect(getStatusMethod().isBuffering).toBe(false);
    });
  });
});

