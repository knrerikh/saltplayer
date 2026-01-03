# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-03

### Added
- **Instant Torrent Streaming**: Start watching videos immediately without waiting for full download
- **Magnet & Torrent Support**: Load content via magnet links or .torrent files
- **Auto Video Selection**: Automatically selects the largest video file from torrents
- **Click-to-Play/Pause**: Click anywhere on the video to toggle playback
- **Spacebar Control**: Press spacebar to play/pause (respects input field focus)
- **Animated Playback Feedback**: Visual play/pause icons that fade smoothly in the center of video
- **Episode Selection**: Dropdown selector for torrents with multiple video files
- **Video Controls**: Play/pause, seek, volume control, and fullscreen support
- **Real-time Statistics**: Display download speed, upload speed, peers, and progress
- **Smart Temporary Storage**: Automatic cleanup of temporary files on application exit
- **Session Cleanup**: Removes orphaned temporary directories from previous sessions on startup
- **Minimalist Dark UI**: Clean, distraction-free interface optimized for video playback
- **Cross-platform Support**: Works on Windows, macOS, and Linux
- **Privacy First**: No tracking, no telemetry, no user accounts required

### Technical
- Built with Electron 28, React 18, and TypeScript
- WebTorrent integration for streaming
- FFmpeg support for video transcoding when needed
- Comprehensive test coverage (85 tests, ~40% code coverage)
- Unit and integration tests with Vitest
- Automated temporary file management

### Documentation
- Comprehensive README with usage instructions
- MIT License
- Full API documentation in code comments
- Architecture documentation

## [0.1.0] - 2024-12-XX

### Added
- Initial development version
- Basic torrent loading and streaming functionality
- Simple video player implementation
- Prototype UI

[1.0.0]: https://github.com/knrerikh/saltplayer/releases/tag/v1.0.0
[0.1.0]: https://github.com/knrerikh/saltplayer/releases/tag/v0.1.0
