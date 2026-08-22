import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { TorrentEngine } from './torrent';
import { StorageManager } from './storage';
import { setupIPCHandlers } from './ipc-handlers';

// Allow Chromium to play audio/video without user interaction (same as WebTorrent Desktop)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow: BrowserWindow | null = null;
let torrentEngine: TorrentEngine | null = null;
let storageManager: StorageManager | null = null;

// Helper to get icon path for both dev and production
function getIconPath(): string {
  if (app.isPackaged) {
    // In production, icon is in resources folder
    return path.join(process.resourcesPath, 'assets', 'icon.png');
  }
  // In development, icon is in assets folder relative to main.ts
  return path.join(__dirname, '../../assets/icon.png');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'Salt Player',
    icon: getIconPath(),
    backgroundColor: '#1a1a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableBlinkFeatures: 'AudioVideoTracks', // Enable audio/video track selection API
      backgroundThrottling: false, // Keep playback smooth when window is in background
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  // Load the renderer
  // Always load from file (simpler for Electron)
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

let initializePromise: Promise<void> | null = null;

function initializeApp(): Promise<void> {
  // macOS emits 'activate' on first launch too, so this can be called while a
  // previous run is still awaiting storage init — share the in-flight promise
  // instead of building a second StorageManager/window pair.
  if (!initializePromise) {
    initializePromise = doInitializeApp().catch((error) => {
      initializePromise = null;
      throw error;
    });
  }
  return initializePromise;
}

async function doInitializeApp(): Promise<void> {
  // Initialize storage manager
  storageManager = new StorageManager();
  await storageManager.initialize();

  // Initialize torrent engine (lazy initialization - WebTorrent loaded on first use)
  torrentEngine = new TorrentEngine(storageManager);

  // Setup IPC handlers
  setupIPCHandlers(torrentEngine, storageManager);

  // Create main window
  createWindow();
}

async function cleanupApp(): Promise<void> {
  console.log('Cleaning up application...');

  // Stop torrent engine
  if (torrentEngine) {
    await torrentEngine.destroy();
    torrentEngine = null;
  }

  // Clean up storage
  if (storageManager) {
    await storageManager.cleanup();
    storageManager = null;
  }

  initializePromise = null;

  console.log('Cleanup complete');
}

// App lifecycle events

app.whenReady().then(() => {
  // Registered only after ready so a first-launch 'activate' cannot race
  // initializeApp() into running twice.
  app.on('activate', () => {
    if (mainWindow !== null) {
      return;
    }
    initializeApp()
      .then(() => {
        if (mainWindow === null) {
          createWindow();
        }
      })
      .catch((error) => {
        console.error('Failed to reopen window:', error);
        writeCrashLog('activate', error);
      });
  });

  return initializeApp();
}).catch((error) => {
  console.error('Failed to initialize application:', error);
  writeCrashLog('initializeApp', error);
});

app.on('window-all-closed', async () => {
  if (process.platform === 'darwin') {
    // The process stays alive on macOS, so keep storage/torrent engine intact
    // (tearing them down left the IPC handlers holding a cleaned-up
    // StorageManager — "Storage manager not initialized" on the next load).
    // The torrent itself must still stop: otherwise its HTTP server, status
    // interval and download keep running with no UI attached.
    try {
      await torrentEngine?.stop();
    } catch (error) {
      console.error('Error stopping torrent on window close:', error);
    }
    return;
  }

  await cleanupApp();
  app.quit();
});

app.on('before-quit', async (event) => {
  event.preventDefault();
  await cleanupApp();
  app.exit(0);
});

// Handle uncaught errors — write to log file so packaged-app crashes are diagnosable.
// Log path on macOS: ~/Library/Logs/Salt Player/crash.log
function writeCrashLog(label: string, error: unknown): void {
  try {
    const logDir = app.getPath('logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const entry = `${new Date().toISOString()} [${label}] ${
      error instanceof Error ? error.stack || error.message : String(error)
    }\n\n`;
    fs.appendFileSync(path.join(logDir, 'crash.log'), entry);
  } catch { /* ignore logging errors */ }
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  writeCrashLog('uncaughtException', error);

  // ffmpeg/ffprobe EBADARCH (-86) propagates as uncaughtException because fluent-ffmpeg
  // calls spawn() synchronously inside getAvailableFormats. Recoverable — user loses
  // transcode/subtitles but the app stays alive.
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('Unknown system error -86') || msg.includes('EBADARCH')) {
    console.warn('Recoverable ffmpeg arch error — keeping app alive');
    return;
  }

  cleanupApp().then(() => app.exit(1));
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  writeCrashLog('unhandledRejection', error);
});
