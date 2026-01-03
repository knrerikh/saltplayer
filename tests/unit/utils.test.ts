import { describe, it, expect } from 'vitest';

// Utility functions that might be extracted from components
describe('Utility Functions', () => {
  describe('formatSpeed', () => {
    const formatSpeed = (bytes: number): string => {
      if (bytes === 0) return '0 B/s';
      const k = 1024;
      const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    it('should format 0 bytes', () => {
      expect(formatSpeed(0)).toBe('0 B/s');
    });

    it('should format bytes per second', () => {
      expect(formatSpeed(500)).toBe('500.00 B/s');
    });

    it('should format kilobytes per second', () => {
      expect(formatSpeed(1024)).toBe('1.00 KB/s');
      expect(formatSpeed(2048)).toBe('2.00 KB/s');
    });

    it('should format megabytes per second', () => {
      expect(formatSpeed(1024 * 1024)).toBe('1.00 MB/s');
      expect(formatSpeed(5 * 1024 * 1024)).toBe('5.00 MB/s');
    });

    it('should format gigabytes per second', () => {
      expect(formatSpeed(1024 * 1024 * 1024)).toBe('1.00 GB/s');
    });

    it('should handle decimal values', () => {
      expect(formatSpeed(1536)).toBe('1.50 KB/s');
    });
  });

  describe('formatSize', () => {
    const formatSize = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    it('should format 0 bytes', () => {
      expect(formatSize(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(formatSize(500)).toBe('500.00 B');
    });

    it('should format kilobytes', () => {
      expect(formatSize(1024)).toBe('1.00 KB');
      expect(formatSize(2048)).toBe('2.00 KB');
    });

    it('should format megabytes', () => {
      expect(formatSize(1024 * 1024)).toBe('1.00 MB');
      expect(formatSize(5 * 1024 * 1024)).toBe('5.00 MB');
    });

    it('should format gigabytes', () => {
      expect(formatSize(1024 * 1024 * 1024)).toBe('1.00 GB');
      expect(formatSize(700 * 1024 * 1024)).toBe('700.00 MB');
    });
  });

  describe('formatTime', () => {
    const formatTime = (seconds: number): string => {
      if (!isFinite(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    it('should format 0 seconds', () => {
      expect(formatTime(0)).toBe('0:00');
    });

    it('should format seconds less than a minute', () => {
      expect(formatTime(30)).toBe('0:30');
      expect(formatTime(5)).toBe('0:05');
    });

    it('should format minutes and seconds', () => {
      expect(formatTime(90)).toBe('1:30');
      expect(formatTime(125)).toBe('2:05');
    });

    it('should format hours (as minutes)', () => {
      expect(formatTime(3600)).toBe('60:00');
      expect(formatTime(3665)).toBe('61:05');
    });

    it('should handle Infinity', () => {
      expect(formatTime(Infinity)).toBe('0:00');
    });

    it('should handle decimal values', () => {
      expect(formatTime(90.7)).toBe('1:30');
    });
  });

  describe('validateMagnetLink', () => {
    const validateMagnetLink = (link: string): boolean => {
      return link.startsWith('magnet:?') && link.includes('xt=urn:btih:');
    };

    it('should validate correct magnet link', () => {
      const validLink = 'magnet:?xt=urn:btih:abc123def456';
      expect(validateMagnetLink(validLink)).toBe(true);
    });

    it('should reject HTTP URLs', () => {
      expect(validateMagnetLink('http://example.com/file.torrent')).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(validateMagnetLink('')).toBe(false);
    });

    it('should reject magnet without btih', () => {
      expect(validateMagnetLink('magnet:?xt=urn:sha1:abc')).toBe(false);
    });
  });
});

