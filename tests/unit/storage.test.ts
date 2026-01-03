import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageManager } from '@/main/storage';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('StorageManager', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    storageManager = new StorageManager();
  });

  afterEach(async () => {
    await storageManager.cleanup();
  });

  describe('initialize', () => {
    it('should create temporary directory', async () => {
      await storageManager.initialize();
      const tempDir = storageManager.getTempDir();
      
      expect(tempDir).toBeTruthy();
      expect(tempDir).toContain('saltplayer-');
      
      // Verify directory exists
      const stats = await fs.stat(tempDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create unique directory each time', async () => {
      const manager1 = new StorageManager();
      const manager2 = new StorageManager();
      
      await manager1.initialize();
      await manager2.initialize();
      
      const dir1 = manager1.getTempDir();
      const dir2 = manager2.getTempDir();
      
      expect(dir1).not.toBe(dir2);
      
      await manager1.cleanup();
      await manager2.cleanup();
    });
  });

  describe('getTempDir', () => {
    it('should throw error if not initialized', () => {
      expect(() => storageManager.getTempDir()).toThrow('Storage manager not initialized');
    });

    it('should return temp directory after initialization', async () => {
      await storageManager.initialize();
      const tempDir = storageManager.getTempDir();
      
      expect(tempDir).toBeTruthy();
      expect(typeof tempDir).toBe('string');
    });
  });

  describe('getAvailableSpace', () => {
    it('should return available space as number', async () => {
      await storageManager.initialize();
      const space = await storageManager.getAvailableSpace();
      
      expect(typeof space).toBe('number');
      expect(space).toBeGreaterThan(0);
    });
  });

  describe('getDirectorySize', () => {
    it('should return 0 for empty directory', async () => {
      await storageManager.initialize();
      const size = await storageManager.getDirectorySize();
      
      expect(size).toBe(0);
    });

    it('should calculate directory size with files', async () => {
      await storageManager.initialize();
      const tempDir = storageManager.getTempDir();
      
      // Create test files
      await fs.writeFile(path.join(tempDir, 'test1.txt'), 'Hello World'); // 11 bytes
      await fs.writeFile(path.join(tempDir, 'test2.txt'), 'Test'); // 4 bytes
      
      const size = await storageManager.getDirectorySize();
      
      expect(size).toBe(15);
    });

    it('should return 0 if not initialized', async () => {
      const size = await storageManager.getDirectorySize();
      expect(size).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should remove temporary directory', async () => {
      await storageManager.initialize();
      const tempDir = storageManager.getTempDir();
      
      await storageManager.cleanup();
      
      // Directory should not exist
      await expect(fs.stat(tempDir)).rejects.toThrow();
    });

    it('should handle cleanup when not initialized', async () => {
      // Should not throw
      await expect(storageManager.cleanup()).resolves.toBeUndefined();
    });

    it('should remove directory with files', async () => {
      await storageManager.initialize();
      const tempDir = storageManager.getTempDir();
      
      // Create test files
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'Test content');
      
      await storageManager.cleanup();
      
      // Directory should not exist
      await expect(fs.stat(tempDir)).rejects.toThrow();
    });
  });

  describe('ensureSpace', () => {
    it('should not throw for reasonable space requirements', async () => {
      await storageManager.initialize();
      
      await expect(
        storageManager.ensureSpace(1024 * 1024)
      ).resolves.toBeUndefined();
    });

    it('should warn about low disk space', async () => {
      await storageManager.initialize();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Request more space than "available" (mock returns 10GB)
      await storageManager.ensureSpace(20 * 1024 * 1024 * 1024);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Low disk space')
      );
      
      consoleSpy.mockRestore();
    });
  });
});

