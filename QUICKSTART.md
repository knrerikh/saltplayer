# Quick Start Guide

Get Saltplayer running in 5 minutes.

## For Users

### Download & Install

1. Visit [Releases](https://github.com/yourusername/saltplayer/releases)
2. Download for your platform
3. Install and launch
4. Paste a magnet link or drop a .torrent file
5. Enjoy! 🎬

## For Developers

### One-Line Setup

```bash
git clone https://github.com/yourusername/saltplayer.git && cd saltplayer && npm install && npm run dev
```

### Step-by-Step

```bash
# 1. Clone
git clone https://github.com/yourusername/saltplayer.git
cd saltplayer

# 2. Install
npm install

# 3. Run
npm run dev
```

### Essential Commands

```bash
# Development
npm run dev              # Run with hot reload
npm start                # Run without hot reload

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report

# Building
npm run build            # Build for production
npm run package          # Create distributable

# Code Quality
npm run lint             # Lint code (if configured)
npm run type-check       # TypeScript checks
```

## Test the App

Use this public domain test torrent (Sintel short film):

```
magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10
```

Or download any Linux distribution torrent for testing.

## Project Overview

```
saltplayer/
├── src/main/          # Electron main process (torrent engine)
├── src/renderer/      # React UI (video player)
├── tests/             # Unit & integration tests
└── docs/              # Documentation
```

## Key Files

- **Main Process**: `src/main/main.ts`, `src/main/torrent.ts`
- **UI**: `src/renderer/App.tsx`, `src/renderer/components/`
- **Types**: `src/shared/types.ts`
- **Tests**: `tests/unit/`, `tests/integration/`
- **Config**: `package.json`, `tsconfig.json`, `vitest.config.ts`

## Troubleshooting

### npm install fails
```bash
# Windows
npm install --global windows-build-tools

# macOS
xcode-select --install

# Linux
sudo apt-get install build-essential
```

### Port 3000 in use
```bash
# Kill process on port 3000
# macOS/Linux: lsof -ti:3000 | xargs kill -9
# Windows: netstat -ano | findstr :3000, then taskkill /PID <PID> /F
```

### Tests fail
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm test
```

## Next Steps

- 📖 Read [User Guide](docs/USER_GUIDE.md)
- 🏗️ Check [Architecture](docs/ARCHITECTURE.md)
- 🧪 Review [Testing Guide](docs/TESTING.md)
- 🚀 See [Deployment Guide](docs/DEPLOYMENT.md)
- 🤝 Read [Contributing Guide](CONTRIBUTING.md)

## Need Help?

- 🐛 [Report a bug](https://github.com/yourusername/saltplayer/issues)
- 💬 [Ask a question](https://github.com/yourusername/saltplayer/discussions)
- 📚 [Read the docs](docs/)

## Quick Links

- **Website**: https://github.com/yourusername/saltplayer
- **Releases**: https://github.com/yourusername/saltplayer/releases
- **Issues**: https://github.com/yourusername/saltplayer/issues
- **License**: [MIT](LICENSE)

---

**Happy streaming!** 🎬✨

