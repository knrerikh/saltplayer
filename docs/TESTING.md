# Testing Guide

## Overview

Saltplayer uses **Vitest** as the testing framework with a focus on critical business logic and integration points.

## Test Structure

```
tests/
├── unit/                  # Unit tests
│   ├── torrent.test.ts    # TorrentEngine tests
│   ├── storage.test.ts    # StorageManager tests
│   └── utils.test.ts      # Utility function tests
├── integration/           # Integration tests
│   ├── ipc.test.ts        # IPC communication tests
│   └── components.test.tsx# Component integration tests
└── setup.ts               # Test environment setup
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Generate coverage report
npm run test:coverage
```

## Unit Tests

### TorrentEngine Tests

Tests for torrent-related functionality:

- ✅ Magnet link validation
- ✅ Video file selection logic
- ✅ File size comparison
- ✅ Extension filtering
- ✅ Edge cases (empty lists, no video files)

**Example:**

```typescript
it('should select largest video file from list', () => {
  const files = [
    { name: 'movie.mp4', size: 700 * 1024 * 1024 },
    { name: 'trailer.mp4', size: 50 * 1024 * 1024 },
  ];
  
  const selected = TorrentEngine.selectVideoFile(files);
  expect(selected.name).toBe('movie.mp4');
});
```

### StorageManager Tests

Tests for temporary file management:

- ✅ Directory creation
- ✅ Directory cleanup
- ✅ Size calculation
- ✅ Space checking
- ✅ Error handling

**Example:**

```typescript
it('should create temporary directory', async () => {
  await storageManager.initialize();
  const tempDir = storageManager.getTempDir();
  
  expect(tempDir).toContain('saltplayer-');
  const stats = await fs.stat(tempDir);
  expect(stats.isDirectory()).toBe(true);
});
```

### Utility Tests

Tests for helper functions:

- ✅ Speed formatting (bytes/sec to human-readable)
- ✅ Size formatting (bytes to KB/MB/GB)
- ✅ Time formatting (seconds to mm:ss)
- ✅ Input validation

## Integration Tests

### IPC Communication Tests

Tests for main ↔ renderer communication:

- ✅ Loading torrents via IPC
- ✅ Playback control messages
- ✅ Status update events
- ✅ Error propagation
- ✅ Listener registration

**Example:**

```typescript
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
```

### Component Tests

Tests for React components with context:

- ✅ TorrentInput user interactions
- ✅ StatusBar data display
- ✅ VideoPlayer controls
- ✅ Full user flows

**Example:**

```typescript
it('should call onLoad when Load button is clicked', async () => {
  const user = userEvent.setup();
  const onLoad = vi.fn();
  render(<TorrentInput onLoad={onLoad} isLoading={false} />);

  const input = screen.getByPlaceholderText(/Enter magnet link/i);
  await user.type(input, 'magnet:?xt=urn:btih:test123');
  await user.click(screen.getByText('Load'));

  expect(onLoad).toHaveBeenCalledWith('magnet:?xt=urn:btih:test123');
});
```

## Test Coverage Goals

### Critical Modules (>60% coverage)

- ✅ TorrentEngine
- ✅ StorageManager
- ✅ IPC handlers

### Important Modules (>40% coverage)

- ✅ React components
- ✅ Utility functions

### Less Critical

- UI styles
- Configuration files

## Mocking Strategy

### Electron API

```typescript
(global.window as any).electronAPI = {
  loadTorrent: vi.fn(),
  stopTorrent: vi.fn(),
  // ... other methods
};
```

### File System

```typescript
vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
}));
```

### WebTorrent

For full integration tests, WebTorrent is mocked at the API level to avoid network calls.

## Writing New Tests

### Unit Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { YourModule } from '@/main/your-module';

describe('YourModule', () => {
  describe('yourMethod', () => {
    it('should do something', () => {
      const result = YourModule.yourMethod(input);
      expect(result).toBe(expected);
    });
    
    it('should handle edge case', () => {
      const result = YourModule.yourMethod(edgeInput);
      expect(result).toBe(edgeExpected);
    });
  });
});
```

### Component Test Template

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YourComponent } from '@/renderer/components/YourComponent';

describe('YourComponent', () => {
  it('should render correctly', () => {
    render(<YourComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
  
  it('should handle user interaction', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<YourComponent onAction={onAction} />);
    
    await user.click(screen.getByText('Button'));
    expect(onAction).toHaveBeenCalled();
  });
});
```

## CI/CD Integration

Tests run automatically on:

- Every commit to feature branches
- Pull requests to main
- Before releases

**GitHub Actions workflow:**

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

## Debugging Tests

### Run specific test file

```bash
npx vitest tests/unit/torrent.test.ts
```

### Run tests matching pattern

```bash
npx vitest -t "should select largest"
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Vitest",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "test"],
  "console": "integratedTerminal"
}
```

## Best Practices

1. **Test behavior, not implementation**
2. **One assertion concept per test**
3. **Use descriptive test names**
4. **Keep tests fast (<100ms per test)**
5. **Avoid testing external libraries**
6. **Mock external dependencies**
7. **Clean up after tests (beforeEach/afterEach)**

## Known Limitations

- **No E2E tests**: Full Electron app not tested end-to-end in CI
- **Network mocking**: WebTorrent network calls are mocked
- **Platform-specific**: Tests run on Linux in CI only

## Future Improvements

- [ ] E2E tests with Playwright
- [ ] Visual regression tests
- [ ] Performance benchmarks
- [ ] Snapshot tests for UI

