# Installation Instructions

Quick guide to get Saltplayer running on your machine.

## For Users

### Download Pre-built Binaries

Visit the [Releases page](https://github.com/yourusername/saltplayer/releases) and download for your platform:

#### Windows

1. Download `Saltplayer-Setup-0.1.0.exe` (installer) or `Saltplayer-0.1.0-portable.exe`
2. Run the installer
3. Launch Saltplayer from Start Menu

**Note**: Windows may show "Windows protected your PC" warning. Click "More info" → "Run anyway" (app is not yet code-signed).

#### macOS

1. Download `Saltplayer-0.1.0.dmg`
2. Open the DMG file
3. Drag Saltplayer to Applications folder
4. Launch from Applications

**Note**: macOS may show "Cannot open because developer cannot be verified". Go to System Settings → Privacy & Security → Allow app (app is not yet code-signed).

#### Linux

**AppImage** (recommended):
```bash
# Download
wget https://github.com/yourusername/saltplayer/releases/download/v0.1.0/Saltplayer-0.1.0.AppImage

# Make executable
chmod +x Saltplayer-0.1.0.AppImage

# Run
./Saltplayer-0.1.0.AppImage
```

**Debian/Ubuntu** (.deb):
```bash
sudo dpkg -i saltplayer_0.1.0_amd64.deb
```

**Fedora/RHEL** (.rpm):
```bash
sudo rpm -i saltplayer-0.1.0.x86_64.rpm
```

## For Developers

### Prerequisites

- **Node.js 18+** (https://nodejs.org/ or via nvm)
- **npm 9+** (comes with Node.js)
- **Git**

### Setup

```bash
# 1. Clone repository
git clone https://github.com/yourusername/saltplayer.git
cd saltplayer

# 2. Install dependencies
npm install

# 3. Run in development mode
npm run dev
```

The app should launch automatically. If not, run:

```bash
npm start
```

### Development Commands

```bash
# Run with hot reload
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Package app for current platform
npm run package
```

### Installing Node.js

#### Using nvm (recommended)

**macOS/Linux:**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install Node.js
nvm install 20
nvm use 20
```

**Windows:**
Download nvm-windows from https://github.com/coreybutler/nvm-windows/releases

#### Direct Installation

Download from https://nodejs.org/ (LTS version recommended)

### Troubleshooting Installation

#### npm install fails

**Issue**: Native modules won't compile

**Solution**:

**Windows:**
```bash
npm install --global windows-build-tools
```

**macOS:**
```bash
xcode-select --install
```

**Linux:**
```bash
sudo apt-get install build-essential
```

#### Permission errors (Linux/macOS)

**Issue**: `EACCES` errors during npm install

**Solution**:
```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.profile
source ~/.profile
```

#### Port already in use

**Issue**: Port 3000 already in use

**Solution**: Kill process on port 3000 or change port in `webpack.renderer.config.js`

```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

## System Requirements

### Minimum

- **OS**: Windows 10, macOS 10.13, Ubuntu 18.04 (or equivalent)
- **RAM**: 4GB
- **Disk**: 200MB + temporary space for videos
- **Network**: Internet connection for torrents

### Recommended

- **OS**: Windows 11, macOS 14, Ubuntu 22.04
- **RAM**: 8GB+
- **Disk**: 2GB free space
- **Network**: Broadband internet (10+ Mbps)

## First Launch

1. **Launch Saltplayer**
2. **Enter a test magnet link** or drop a .torrent file
3. **Wait for buffering** (usually 5-30 seconds)
4. **Video starts playing**

### Test Magnet Link

You can use any public domain video torrent for testing. Many Linux distributions offer torrent downloads.

## Uninstallation

### Windows

- Control Panel → Programs → Uninstall Saltplayer
- Or run uninstaller from installation directory

### macOS

- Delete `Saltplayer.app` from Applications folder
- Remove preferences: `~/Library/Application Support/Saltplayer`

### Linux

**AppImage**: Just delete the .AppImage file

**deb**:
```bash
sudo apt remove saltplayer
```

**rpm**:
```bash
sudo rpm -e saltplayer
```

## Getting Help

- **Documentation**: Check `docs/` folder
- **Issues**: https://github.com/yourusername/saltplayer/issues
- **Discussions**: https://github.com/yourusername/saltplayer/discussions

## Next Steps

After installation:

1. Read [User Guide](docs/USER_GUIDE.md) for usage tips
2. Join community discussions
3. Report bugs or request features

Enjoy Saltplayer! 🎬

