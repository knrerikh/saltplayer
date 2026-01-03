import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomBytes } from 'crypto';

export class StorageManager {
  private tempDir: string | null = null;
  private readonly baseTempDir: string;

  constructor() {
    this.baseTempDir = os.tmpdir();
  }

  /**
   * Initialize storage manager and create temporary directory
   */
  async initialize(): Promise<void> {
    // Clean up old sessions first
    await this.cleanupOldSessions();

    const randomId = randomBytes(8).toString('hex');
    this.tempDir = path.join(this.baseTempDir, `saltplayer-${randomId}`);
    
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log(`Temporary directory created: ${this.tempDir}`);
    } catch (error) {
      console.error('Error creating temporary directory:', error);
      throw error;
    }
  }

  /**
   * Clean up old session directories on startup
   */
  private async cleanupOldSessions(): Promise<void> {
    try {
      const files = await fs.readdir(this.baseTempDir);
      const saltDirs = files.filter(f => f.startsWith('saltplayer-'));
      
      if (saltDirs.length > 0) {
        console.log(`Found ${saltDirs.length} old session(s) to clean up.`);
      }

      for (const dir of saltDirs) {
        const fullPath = path.join(this.baseTempDir, dir);
        try {
          await fs.rm(fullPath, { recursive: true, force: true });
          console.log(`Cleaned up old session: ${fullPath}`);
        } catch (err) {
          console.warn(`Failed to clean old session ${fullPath}:`, err);
        }
      }
    } catch (error) {
      console.warn('Error checking for old sessions:', error);
    }
  }

  /**
   * Get the temporary directory path
   */
  getTempDir(): string {
    if (!this.tempDir) {
      throw new Error('Storage manager not initialized');
    }
    return this.tempDir;
  }

  /**
   * Get available disk space in bytes
   */
  async getAvailableSpace(): Promise<number> {
    // This is a simplified implementation
    // In production, you might want to use a library like 'check-disk-space'
    return 10 * 1024 * 1024 * 1024; // Return 10GB as placeholder
  }

  /**
   * Get current directory size in bytes
   */
  async getDirectorySize(): Promise<number> {
    if (!this.tempDir) {
      return 0;
    }

    try {
      const files = await fs.readdir(this.tempDir);
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          totalSize += stats.size;
        }
      }

      return totalSize;
    } catch (error) {
      console.error('Error calculating directory size:', error);
      return 0;
    }
  }

  /**
   * Clean up temporary directory and all files
   */
  async cleanup(): Promise<void> {
    if (!this.tempDir) {
      return;
    }

    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
      console.log(`Temporary directory cleaned: ${this.tempDir}`);
      this.tempDir = null;
    } catch (error) {
      console.error('Error cleaning up temporary directory:', error);
      // Don't throw - best effort cleanup
    }
  }

  /**
   * Remove old files to free up space if needed
   */
  async ensureSpace(requiredBytes: number): Promise<void> {
    const availableSpace = await this.getAvailableSpace();
    
    if (availableSpace < requiredBytes) {
      console.warn(`Low disk space: ${availableSpace} bytes available, ${requiredBytes} required`);
      // In a full implementation, we might delete old chunks here
      // For MVP, we'll just log a warning
    }
  }
}
