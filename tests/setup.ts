import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Mock Electron API
global.window = global.window || {};

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

// Mock file with path property for drag & drop tests
class MockFile extends File {
  path: string;
  
  constructor(bits: BlobPart[], name: string, options?: FilePropertyBag) {
    super(bits, name, options);
    this.path = `/mock/path/${name}`;
  }
}

(global as any).File = MockFile;

