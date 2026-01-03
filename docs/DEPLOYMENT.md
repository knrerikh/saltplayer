# Deployment Guide

This guide covers how to build, package, and distribute Saltplayer.

## Prerequisites

Before deploying, ensure you have:

- **Node.js 18+** (via nvm recommended)
- **npm 9+**
- **Platform-specific tools** (see below)

## Installation

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/yourusername/saltplayer.git
cd saltplayer
npm install
```

This will install all production and development dependencies.

### 2. Verify Installation

```bash
# Run tests to verify everything works
npm test

# Try development mode
npm run dev
```

## Building for Production

### Build Process

```bash
# Build both main and renderer processes
npm run build
```

This creates:
- `dist/main/` — Compiled main process
- `dist/renderer/` — Compiled renderer process

### Production Build Configuration

The build process:
1. Compiles TypeScript to JavaScript
2. Bundles renderer with Webpack
3. Optimizes code for production
4. Prepares files for packaging

## Packaging Applications

### Package for Current Platform

```bash
npm run package
```

This creates distributable packages in the `release/` directory.

### Platform-Specific Instructions

#### macOS

**Requirements:**
- macOS 10.13+
- Xcode Command Line Tools

**Build:**
```bash
npm run package
```

**Output:**
- `release/Saltplayer-0.1.0.dmg` — DMG installer
- `release/Saltplayer-0.1.0-mac.zip` — ZIP archive

**Code Signing** (optional):
```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=password
npm run package
```

#### Windows

**Requirements:**
- Windows 10+
- Visual Studio Build Tools (for native modules)

**Build:**
```bash
npm run package
```

**Output:**
- `release/Saltplayer Setup 0.1.0.exe` — NSIS installer
- `release/Saltplayer 0.1.0.exe` — Portable executable

**Code Signing** (optional):
```bash
set CSC_LINK=path\to\certificate.pfx
set CSC_KEY_PASSWORD=password
npm run package
```

#### Linux

**Requirements:**
- Ubuntu 18.04+ (or equivalent)
- `fakeroot` and `dpkg` (for .deb)
- `rpm` (for .rpm)

**Build:**
```bash
npm run package
```

**Output:**
- `release/Saltplayer-0.1.0.AppImage` — AppImage
- `release/saltplayer_0.1.0_amd64.deb` — Debian package
- `release/saltplayer-0.1.0.x86_64.rpm` — RPM package

## Cross-Platform Building

### Build for All Platforms (requires macOS)

```bash
npm run package -- -mwl
```

- `-m` — macOS
- `-w` — Windows
- `-l` — Linux

### Build for Specific Platform

```bash
# macOS only
npm run package -- --mac

# Windows only
npm run package -- --win

# Linux only
npm run package -- --linux
```

## Release Process

### 1. Update Version

```bash
npm version patch  # 0.1.0 → 0.1.1
npm version minor  # 0.1.0 → 0.2.0
npm version major  # 0.1.0 → 1.0.0
```

### 2. Update CHANGELOG

Edit `CHANGELOG.md` to document changes:

```markdown
## [0.2.0] - 2024-01-15

### Added
- New feature X

### Fixed
- Bug Y
```

### 3. Build and Package

```bash
npm run build
npm run package
```

### 4. Test Packages

Test each platform package:

- **Installation**: Verify installer works
- **First run**: Check initial launch
- **Core features**: Test magnet links, .torrent files
- **Cleanup**: Verify temp files are removed

### 5. Create GitHub Release

```bash
git tag v0.2.0
git push origin v0.2.0
```

Upload packages to GitHub Releases:

1. Go to https://github.com/yourusername/saltplayer/releases
2. Click "Draft a new release"
3. Select tag `v0.2.0`
4. Add release notes from CHANGELOG
5. Upload binaries:
   - `Saltplayer-0.2.0.dmg`
   - `Saltplayer Setup 0.2.0.exe`
   - `Saltplayer-0.2.0.AppImage`
6. Publish release

## Automated Builds (CI/CD)

### GitHub Actions

The project includes `.github/workflows/test.yml` for automated testing.

To add automated releases, create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.x
      
      - run: npm ci
      - run: npm run build
      - run: npm run package
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - uses: softprops/action-gh-release@v1
        with:
          files: release/*
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Distribution Channels

### Direct Download

Host binaries on:
- GitHub Releases (recommended)
- Your own website
- CDN

### Package Managers

#### Homebrew (macOS)

Create a Homebrew tap:

```ruby
cask "saltplayer" do
  version "0.1.0"
  sha256 "..."
  
  url "https://github.com/yourusername/saltplayer/releases/download/v#{version}/Saltplayer-#{version}.dmg"
  name "Saltplayer"
  desc "Minimalist torrent player"
  homepage "https://github.com/yourusername/saltplayer"
  
  app "Saltplayer.app"
end
```

#### Chocolatey (Windows)

Create a Chocolatey package with `.nuspec` file.

#### Snap (Linux)

Create `snap/snapcraft.yaml` for Snap Store.

## Security Considerations

### Code Signing

**Why sign:**
- Prevents "Unknown Developer" warnings
- Builds user trust
- Required for some distribution channels

**macOS:**
- Requires Apple Developer account ($99/year)
- Use Xcode or `codesign` tool

**Windows:**
- Requires code signing certificate
- Use SignTool or electron-builder's built-in signing

### Notarization (macOS)

For macOS 10.14.5+, notarize your app:

```bash
npm run package
xcrun altool --notarize-app \
  --primary-bundle-id "com.saltplayer.app" \
  --username "your@email.com" \
  --password "@keychain:AC_PASSWORD" \
  --file release/Saltplayer-0.1.0.dmg
```

## Update Mechanism

Saltplayer does not include auto-update by default (minimalist philosophy).

Users check for updates manually at:
- https://github.com/yourusername/saltplayer/releases

If you want to add auto-update:

1. Use `electron-updater`
2. Configure in `electron-builder.json`
3. Update documentation

## Troubleshooting

### Build Fails

**Issue**: Native module compilation fails

**Solution**: Install build tools:
- Windows: Visual Studio Build Tools
- macOS: Xcode Command Line Tools
- Linux: `build-essential`

### Package Too Large

**Issue**: Package exceeds 200MB

**Solution**:
- Verify `node_modules` aren't included
- Check `files` in `package.json`
- Run `npm prune --production` before packaging

### Platform-Specific Issues

**macOS**: "App is damaged and can't be opened"
- App needs code signing and notarization

**Windows**: "Windows protected your PC"
- App needs code signing certificate

**Linux**: Permission denied
- Make AppImage executable: `chmod +x Saltplayer-0.1.0.AppImage`

## Performance Optimization

### Bundle Size

Current sizes (approximate):
- macOS: ~150MB
- Windows: ~160MB
- Linux: ~140MB

To reduce:
- Exclude dev dependencies
- Use `asar` archive
- Enable compression in electron-builder

### Startup Time

Optimize by:
- Lazy loading non-critical modules
- Deferring IPC handler registration
- Using V8 snapshots

## Monitoring

### Crash Reporting

Consider integrating:
- Sentry
- Bugsnag
- Custom crash reporter

### Usage Analytics

Saltplayer doesn't track usage by design.

If you add analytics:
- Make it opt-in
- Clearly document
- Respect privacy

## Support

For deployment issues:
- Check [GitHub Issues](https://github.com/yourusername/saltplayer/issues)
- Read [Electron Builder docs](https://www.electron.build/)
- Ask in [GitHub Discussions](https://github.com/yourusername/saltplayer/discussions)

