# AGENTS.md - Developer Guide for Salt Player

## Build Commands

```bash
# Development
npm run dev              # Start all dev processes (main + renderer + electron)
npm run dev:main        # Watch main process
npm run dev:renderer    # Watch renderer process

# Build
npm run build           # Build both main and renderer
npm run build:main     # Build main process only
npm run build:renderer # Build renderer only
npm run start          # Run Electron app (requires build first)

# Package (create distributables)
npm run package                    # Build for current OS
npm run package -- --mac          # macOS
npm run package -- --win           # Windows
npm run package -- --linux        # Linux
npm run package -- --publish always # Publish to GitHub Releases
```

## Test Commands

```bash
npm test              # Run all tests (vitest)
npm run test:unit     # Run unit tests only
npm run test:integration  # Run integration tests only
npm run test:coverage # Run tests with coverage
npm run test:watch    # Watch mode for tests

# Run single test file
vitest run tests/unit/<filename>
vitest run tests/integration/<filename>

# Run single test
vitest run -t "test name"
```

## Project Structure

```
src/
├── main/              # Electron main process (Node.js)
│   ├── main.ts       # App entry point
│   ├── preload.ts    # Preload script (context bridge)
│   ├── torrent.ts    # Torrent engine (WebTorrent + FFmpeg)
│   ├── storage.ts    # Persistent storage
│   └── ipc-handlers.ts
├── renderer/          # Electron renderer process (browser)
│   ├── App.tsx       # Root React component
│   ├── index.tsx     # Entry point
│   ├── components/   # React components
│   └── styles.css
└── shared/            # Shared types
    └── types.ts
```

## Code Style Guidelines

### Imports

- Use path aliases: `@/` for shared types (`@/shared/types`)
- Order: external libs → internal modules → relative paths
- Named imports for React: `import { useState, useEffect } from 'react'`

```typescript
// Good
import React, { useState, useEffect, useMemo } from 'react';
import { TorrentStatus, SubtitleData } from '@/shared/types';
import TorrentInput from './components/TorrentInput';

// Avoid
import * as React from 'react';
import { * } from '@/shared/types';
```

### TypeScript

- Use explicit types for function parameters and return types
- Use interfaces for object shapes, types for unions/primitives
- Avoid `any`, use `unknown` when type is truly unknown

```typescript
// Good
interface VideoPlayerProps {
  videoUrl: string | null;
  onClose: () => void;
}

function getSubtitleDisplayName(track: SubtitleTrack): string {
  // ...
}

// Avoid
function handleSomething(data) {  // missing types
  // ...
}
```

### Naming Conventions

- **Files**: kebab-case for configs, PascalCase for components, camelCase for utilities
  - `video-player.tsx`, `ipc-handlers.ts`, `TorrentEngine.ts`
- **Components**: PascalCase, `.tsx` extension
- **Functions/variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE for config values, camelCase for others
- **Interfaces**: PascalCase, descriptive names (`TorrentMetadata`, not `TM`)

### React Patterns

- Use Functional components with hooks
- Destructure props in function signature
- Keep components focused (single responsibility)
- Use `useMemo` for expensive calculations
- Use `useCallback` for functions passed as props
- Add dependencies array to useEffect

```typescript
// Good
const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  onClose,
}) => {
  const isPlaying = useMemo(() => {
    return videoUrl?.includes('transcode=true') || false;
  }, [videoUrl]);

  const handlePlay = useCallback(() => {
    // ...
  }, [dependencies]);
};

// Cleanup effects
useEffect(() => {
  const subscription = something.onData(handler);
  return () => subscription.off(handler);
}, [dependencies]);
```

### Error Handling

- Use try/catch for async operations
- Log errors with context: `console.error('Error loading torrent:', err)`
- Set error state in UI, show user-friendly messages
- Never expose internal errors to end users

```typescript
// Good
try {
  const meta = await window.electronAPI.loadTorrent(source);
  setMetadata(meta);
} catch (err: unknown) {
  console.error('Failed to load torrent:', err);
  setError({
    code: 'LOAD_ERROR',
    message: err instanceof Error ? err.message : 'Unknown error',
  });
}
```

### CSS

- Use CSS classes, not inline styles (except dynamic values)
- Follow existing class naming in `styles.css`
- Keep styles in `src/renderer/styles.css`

### Electron Specific

- Use contextBridge for IPC (never expose `ipcRenderer` directly)
- Define API in Window interface (see `App.tsx`)
- Use IPC_CHANNELS constants for channel names
- Handle both development and production paths

```typescript
// In preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  loadTorrent: (source: string) => ipcRenderer.invoke('torrent:load', source),
});
```

### Testing

- Place tests in `tests/unit/` or `tests/integration/`
- Name test files: `*.test.ts` or `*.test.tsx`
- Use Vitest (already configured)
- Use @testing-library/react for component tests

### Git Conventions

- Branch naming: `feature/description`, `fix/description`, `hotfix/description`
- Commit messages: imperative mood (`"Add subtitle menu"` not `"Added..."`)
- PR title format: `feat: description` or `fix: description`

### Build Configuration

- Webpack configs: `webpack.main.config.js`, `webpack.renderer.config.js`
- electron-builder config in `package.json` under `build` key
- Output directory: `release/`
- Ignore warnings in webpack for known issues (fs-native-extensions)

### Creating Releases

**Automatic (via CI/CD):**
1. Create and push a version tag:
   ```bash
   git tag v1.3.0
   git push origin v1.3.0
   ```
2. GitHub Actions automatically builds and publishes to GitHub Releases

**Manual:**
1. Build locally: `npm run build && npm run package -- --mac --win --linux`
2. Create release: `gh release create v1.3.0 --title "Salt Player 1.3.0" --notes "..."`
3. Upload artifacts: `gh release upload v1.3.0 release/*`

### Additional Notes

- FFmpeg binaries bundled via `ffmpeg-static`, `ffprobe-static`
- WebTorrent for torrent streaming
- Fluent-FFmpeg for transcoding
- Buffer polyfill required for browser polyfills in webpack
