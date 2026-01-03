# Saltplayer

> Minimalist torrent player with progressive streaming

A lightweight, no-nonsense video player that lets you watch content from torrents **instantly** without waiting for full downloads or managing a media library.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

## ✨ Features

- 🚀 **Instant Playback** — Start watching as soon as enough data is buffered
- 🧲 **Magnet & Torrent Support** — Paste links or drop .torrent files
- 🎬 **Auto Video Selection** — Automatically picks the main video file
- 🖱️ **Click-to-Play/Pause** — Click anywhere on video to toggle playback
- ⌨️ **Spacebar Control** — Press spacebar to play/pause (respects input fields)
- 🎭 **Animated Feedback** — Visual play/pause icons with smooth fade effect
- 📺 **Episode Selection** — Built-in dropdown for multi-file torrents
- 🎨 **Minimalist UI** — Clean, dark interface with no distractions
- 🔒 **Privacy First** — No tracking, no accounts, no telemetry
- 🧹 **Auto Cleanup** — Temporary files deleted on exit and orphaned sessions on startup
- 📊 **Real-time Stats** — Download speed, peers, progress
- ⚡ **Lightweight** — Minimal resource usage

## 🎯 What Saltplayer Is NOT

- ❌ Not a media library manager
- ❌ Not a torrent search engine
- ❌ Not a permanent storage solution
- ❌ Not a download manager

**Saltplayer does one thing well:** play videos from torrents immediately.

## 📦 Installation

### Download Pre-built Binaries

Download the latest release for your platform:

- **Windows**: `Salt-Player-Setup-1.0.0.exe` or `Salt-Player-1.0.0-portable.exe`
- **macOS**: `Salt-Player-1.0.0.dmg`
- **Linux**: `Salt-Player-1.0.0.AppImage`, `.deb`, or `.rpm`

[Download from GitHub Releases](https://github.com/krerikh/saltplayer/releases/latest)

### Build from Source

```bash
# Clone the repository
git clone https://github.com/krerikh/saltplayer.git
cd saltplayer

# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build

# Package for distribution
npm run package
```

## 🚀 Quick Start

1. **Launch Saltplayer**
2. **Enter a magnet link** or **drag & drop a .torrent file**
3. **Press Enter** or click "Load"
4. **Video starts playing** after brief buffering

That's it! No configuration needed.

## 💻 Usage

### Magnet Links

```
magnet:?xt=urn:btih:...
```

Paste into input field and press Enter.

### Torrent Files

- Drag & drop `.torrent` file onto the application
- Or click "Open File" to browse

### Video Controls

- **Play/Pause**: Spacebar, click on video, or click play button
- **Episode Selection**: Use dropdown in title area (for multi-file torrents)
- **Seek**: Click progress bar
- **Volume**: Adjust slider
- **Fullscreen**: F key or button

## 🔧 Technical Details

### Architecture

- **Frontend**: React + TypeScript
- **Backend**: Electron Main Process
- **Streaming**: WebTorrent
- **Testing**: Vitest + Testing Library

### Supported Video Formats

- MP4, MKV, AVI, MOV, WEBM, M4V, FLV, WMV

### System Requirements

- **OS**: Windows 10+, macOS 10.13+, Ubuntu 18.04+
- **RAM**: 4GB minimum
- **Disk**: 2GB free space for temporary files
- **Network**: Internet connection

## 📚 Documentation

- [User Guide](docs/USER_GUIDE.md) — How to use Saltplayer
- [Architecture](docs/ARCHITECTURE.md) — Technical architecture
- [Contributing](CONTRIBUTING.md) — Development guide
- [Changelog](CHANGELOG.md) — Version history

## 🧪 Development

### Setup

```bash
npm install
```

### Commands

```bash
# Development mode with hot reload
npm run dev

# Build main and renderer processes
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Package for current platform
npm run package
```

### Project Structure

```
saltplayer/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # Entry point
│   │   ├── torrent.ts     # WebTorrent engine
│   │   ├── storage.ts     # Temp file management
│   │   └── ipc-handlers.ts# IPC communication
│   ├── renderer/          # React UI
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── styles.css
│   └── shared/            # Shared types
├── tests/                 # Unit & integration tests
├── build/                 # Build assets
└── docs/                  # Documentation
```

## 🧪 Testing

We maintain good test coverage for critical functionality:

```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Coverage report
npm run test:coverage
```

**Coverage targets**: >60% for critical modules (torrent engine, storage manager)

## 🛠️ Troubleshooting

### Video won't play

- Check that torrent has active seeders (Peers > 0)
- Verify the magnet link is valid
- Ensure video format is supported

### Slow buffering

- Low number of seeders
- Slow internet connection
- High demand on torrent

### Error: "No video file found"

- Torrent may not contain video files
- Only non-video files in torrent

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## ⚠️ Legal Notice

Saltplayer is a neutral tool. Users are responsible for ensuring they have the legal right to access and view content. Please respect copyright laws in your jurisdiction.

## 🙏 Acknowledgments

- [WebTorrent](https://webtorrent.io/) — Streaming torrent client
- [Electron](https://www.electronjs.org/) — Cross-platform framework
- [React](https://react.dev/) — UI framework

## 📞 Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/krerikh/saltplayer/issues)
- 💡 **Feature Requests**: [GitHub Discussions](https://github.com/krerikh/saltplayer/discussions)
- 📖 **Documentation**: [docs/](docs/)

---

Made with ❤️ by [Konstantin Rerikh](https://github.com/krerikh)

