import { describe, it, expect } from 'vitest';
import { TorrentEngine } from '@/main/torrent';

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
});

