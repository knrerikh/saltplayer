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
  startWindowDrag: vi.fn(),
  moveWindowBy: vi.fn(),
  endWindowDrag: vi.fn(),
  setWindowFullscreen: vi.fn(),
  onTorrentStatus: vi.fn(),
  onVideoUrl: vi.fn(),
  onError: vi.fn(),
  onWindowFullscreen: vi.fn(),
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


// A state update outside act() means a test asserts before React has settled, so it
// may pass or fail by timing. Turn React's warning into a failure instead of noise.
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('not wrapped in act(')) {
    throw new Error(`React state update outside act(): ${args[0].split('\n')[0]}`);
  }
  consoleError(...args);
};
