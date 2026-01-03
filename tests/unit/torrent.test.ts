import { describe, it, expect } from 'vitest';
import { TorrentEngine } from '@/main/torrent';
import { TorrentFile } from '@/shared/types';

describe('TorrentEngine', () => {
  describe('isValidMagnet', () => {
    it('should validate correct magnet link format', () => {
      const validMagnet = 'magnet:?xt=urn:btih:abc123def456';
      expect(TorrentEngine.isValidMagnet(validMagnet)).toBe(true);
    });

    it('should reject invalid magnet link format', () => {
      const invalidMagnet = 'http://example.com/file.torrent';
      expect(TorrentEngine.isValidMagnet(invalidMagnet)).toBe(false);
    });

    it('should reject magnet link without btih', () => {
      const invalidMagnet = 'magnet:?xt=urn:sha1:abc123';
      expect(TorrentEngine.isValidMagnet(invalidMagnet)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(TorrentEngine.isValidMagnet('')).toBe(false);
    });

    it('should reject non-magnet URLs', () => {
      expect(TorrentEngine.isValidMagnet('https://example.com')).toBe(false);
    });
  });

  describe('selectVideoFile', () => {
    it('should select largest video file from list', () => {
      const files: TorrentFile[] = [
        { name: 'movie.mp4', size: 1024 * 1024 * 700, path: 'movie.mp4' },
        { name: 'trailer.mp4', size: 1024 * 1024 * 50, path: 'trailer.mp4' },
        { name: 'readme.txt', size: 1024, path: 'readme.txt' },
      ];

      const selected = TorrentEngine.selectVideoFile(files);
      expect(selected?.name).toBe('movie.mp4');
    });

    it('should filter out non-video files', () => {
      const files: TorrentFile[] = [
        { name: 'document.pdf', size: 1024 * 1024 * 100, path: 'document.pdf' },
        { name: 'movie.mkv', size: 1024 * 1024 * 50, path: 'movie.mkv' },
        { name: 'readme.txt', size: 1024, path: 'readme.txt' },
      ];

      const selected = TorrentEngine.selectVideoFile(files);
      expect(selected?.name).toBe('movie.mkv');
    });

    it('should return null when no video files are present', () => {
      const files: TorrentFile[] = [
        { name: 'document.pdf', size: 1024 * 1024 * 100, path: 'document.pdf' },
        { name: 'readme.txt', size: 1024, path: 'readme.txt' },
      ];

      const selected = TorrentEngine.selectVideoFile(files);
      expect(selected).toBeNull();
    });

    it('should return null for empty file list', () => {
      const selected = TorrentEngine.selectVideoFile([]);
      expect(selected).toBeNull();
    });

    it('should handle various video formats', () => {
      const files: TorrentFile[] = [
        { name: 'video.avi', size: 1024 * 1024 * 10, path: 'video.avi' },
        { name: 'video.mov', size: 1024 * 1024 * 20, path: 'video.mov' },
        { name: 'video.webm', size: 1024 * 1024 * 30, path: 'video.webm' },
        { name: 'video.mkv', size: 1024 * 1024 * 40, path: 'video.mkv' },
      ];

      const selected = TorrentEngine.selectVideoFile(files);
      expect(selected?.name).toBe('video.mkv'); // Largest
    });

    it('should be case-insensitive for file extensions', () => {
      const files: TorrentFile[] = [
        { name: 'video.MP4', size: 1024 * 1024 * 50, path: 'video.MP4' },
        { name: 'video.MKV', size: 1024 * 1024 * 100, path: 'video.MKV' },
      ];

      const selected = TorrentEngine.selectVideoFile(files);
      expect(selected?.name).toBe('video.MKV');
    });
  });
});

