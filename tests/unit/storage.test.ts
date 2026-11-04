import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageManager } from '@/main/storage';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

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

  describe('stale session cleanup (#44)', () => {
    let base: string;

    // Our own folder, not a saltplayer-* one in os.tmpdir(), which parallel tests sweep.
    beforeEach(async () => {
      base = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
    });

    afterEach(async () => {
      await fs.rm(base, { recursive: true, force: true });
    });

    async function session(name: string, marker?: string): Promise<string> {
      const dir = path.join(base, name);
      await fs.mkdir(dir);
      if (marker !== undefined) await fs.writeFile(path.join(dir, 'session.pid'), marker);
      return dir;
    }

    const exists = (dir: string) => fs.stat(dir).then(() => true, () => false);

    it('writes its pid into the session folder', async () => {
      const manager = new StorageManager({ baseDir: base });
      await manager.initialize();
      const marker = await fs.readFile(path.join(manager.getTempDir(), 'session.pid'), 'utf-8');
      expect(marker.trim()).toBe(String(process.pid));
      await manager.cleanup();
    });

    it('does not count the marker in the directory size', async () => {
      const manager = new StorageManager({ baseDir: base });
      await manager.initialize();
      expect(await manager.getDirectorySize()).toBe(0);
      await manager.cleanup();
    });

    it('keeps the folder of a live session', async () => {
      const live = await session('saltplayer-live', '4242');
      const manager = new StorageManager({ baseDir: base, isProcessAlive: (pid) => pid === 4242 });
      await manager.initialize();
      expect(await exists(live)).toBe(true);
      await manager.cleanup();
    });

    it('removes the folder of a session whose owner is gone', async () => {
      const dead = await session('saltplayer-dead', '4242');
      const manager = new StorageManager({ baseDir: base, isProcessAlive: () => false });
      await manager.initialize();
      expect(await exists(dead)).toBe(false);
      await manager.cleanup();
    });

    it.each([
      ['no marker', undefined],
      ['an empty marker', ''],
      ['an unreadable marker', 'not a pid'],
    ])('removes a folder with %s', async (_label, marker) => {
      const old = await session('saltplayer-old', marker);
      const manager = new StorageManager({ baseDir: base, isProcessAlive: () => true });
      await manager.initialize();
      expect(await exists(old)).toBe(false);
      await manager.cleanup();
    });

    it('leaves folders that are not ours alone', async () => {
      const other = await session('something-else');
      const manager = new StorageManager({ baseDir: base, isProcessAlive: () => false });
      await manager.initialize();
      expect(await exists(other)).toBe(true);
      await manager.cleanup();
    });

    describe('default liveness check', () => {
      it('treats this process as alive', async () => {
        const mine = await session('saltplayer-mine', String(process.pid));
        const manager = new StorageManager({ baseDir: base });
        await manager.initialize();
        expect(await exists(mine)).toBe(true);
        await manager.cleanup();
      });

      it.each([
        ['ESRCH', false],
        ['EPERM', true],
      ])('%s: folder kept = %s', async (code, kept) => {
        const dir = await session('saltplayer-other', '999999');
        const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
          throw Object.assign(new Error(code), { code });
        });
        const manager = new StorageManager({ baseDir: base });
        await manager.initialize();
        kill.mockRestore();
        expect(await exists(dir)).toBe(kept);
        await manager.cleanup();
      });
    });
  });
});

