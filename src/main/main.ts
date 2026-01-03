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

async function initializeApp(): Promise<void> {
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

  console.log('Cleanup complete');
}

// App lifecycle events

app.whenReady().then(() => {
  return initializeApp();
});

app.on('window-all-closed', async () => {
  await cleanupApp();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', async (event) => {
  event.preventDefault();
  await cleanupApp();
  app.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  cleanupApp().then(() => app.exit(1));
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});
