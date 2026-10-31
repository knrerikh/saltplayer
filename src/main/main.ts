import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { TorrentEngine } from './torrent';
import { StorageManager } from './storage';
import { setupIPCHandlers } from './ipc-handlers';
import { forwardFullscreenState } from './window-fullscreen';
import { RecentSources } from './recent-sources';
import { Settings } from './settings';
import { WatchHistory } from './watch-history';
import { MediaOpener } from './media-opener';
import { buildAppMenuTemplate, OPEN_FILE_FILTERS, REPOSITORY_URL } from './app-menu';
import { isSafeExternalUrl } from './external-url';
import { RemoteControl, startRemoteAtLaunch } from './remote-control/remote-control';
import { RemoteTokenStore } from './remote-control/token-store';
import { DEFAULT_SETTINGS, IPC_CHANNELS, type AppSettings, type MenuCommand } from '@/shared/types';

// Allow Chromium to play audio/video without user interaction (same as WebTorrent Desktop)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow: BrowserWindow | null = null;
let torrentEngine: TorrentEngine | null = null;
let storageManager: StorageManager | null = null;
let recentSources: RecentSources | null = null;
let settings: Settings | null = null;
let watchHistory: WatchHistory | null = null;
let mediaOpener: MediaOpener | null = null;
let remoteControl: RemoteControl | null = null;
/** A source to open once the page has loaded: Finder and the Dock can hand one over before that. */
let pendingSource: string | null = null;

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

  forwardFullscreenState(mainWindow);
  mainWindow.webContents.on('did-finish-load', openPendingSource);

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

  recentSources = new RecentSources(path.join(app.getPath('userData'), 'recent-sources.json'), {
    onChange: updateAppMenu,
  });
  await recentSources.load();
  const appSettings = new Settings(path.join(app.getPath('userData'), 'settings.json'), {
    onChange: (changed: AppSettings) => {
      updateAppMenu();
      sendToPage(IPC_CHANNELS.SETTINGS_CHANGED, changed);
    },
  });
  await appSettings.load();
  settings = appSettings;
  watchHistory = new WatchHistory(path.join(app.getPath('userData'), 'watch-history.json'), {
    isEnabled: () => appSettings.get().resumePlayback,
  });
  await watchHistory.load();

  // Initialize torrent engine (lazy initialization - WebTorrent loaded on first use)
  torrentEngine = new TorrentEngine(storageManager, watchHistory);
  mediaOpener = new MediaOpener({
    engine: torrentEngine,
    recents: recentSources,
    addRecentDocument: (filePath) => app.addRecentDocument(filePath),
    send: sendToPage,
  });

  // Off until the user turns it on from Playback → Remote Control…, or has it start with the app.
  remoteControl = new RemoteControl({
    onCommand: (command) => sendToPage(IPC_CHANNELS.REMOTE_COMMAND, command),
    onStatus: (status) => sendToPage(IPC_CHANNELS.REMOTE_STATUS, status),
    tokens: new RemoteTokenStore(path.join(app.getPath('userData'), 'remote-control.json')),
  });

  // Setup IPC handlers
  setupIPCHandlers(torrentEngine, storageManager, mediaOpener, appSettings, watchHistory, remoteControl);

  // The page asks for the status when it loads, so it does not matter that this finishes first.
  void startRemoteAtLaunch(remoteControl, appSettings.get());

  app.setAboutPanelOptions({
    applicationName: 'Salt Player',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright (c) 2025 Konstantin Rerikh. MIT License.',
    website: REPOSITORY_URL,
    iconPath: getIconPath(),
  });
  updateAppMenu();

  // Create main window
  createWindow();
}

function sendToPage(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

/** Creates the window again after the last one was closed (macOS keeps running). */
function ensureWindow(): void {
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
      writeCrashLog('ensureWindow', error);
    });
}

function openSource(source: string): void {
  pendingSource = source;
  if (mainWindow === null) {
    // Before 'ready' the first window is on its way; either way 'did-finish-load' opens it.
    if (app.isReady()) ensureWindow();
  } else if (!mainWindow.webContents.isLoading()) {
    openPendingSource();
  }
}

function openPendingSource(): void {
  if (!pendingSource || !mediaOpener) return;
  const source = pendingSource;
  pendingSource = null;
  void mediaOpener.open(source);
}

async function chooseFileToOpen(): Promise<void> {
  const options: Electron.OpenDialogOptions = { properties: ['openFile'], filters: OPEN_FILE_FILTERS };
  const { canceled, filePaths } = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (!canceled && filePaths[0]) {
    openSource(filePaths[0]);
  }
}

function sendMenuCommand(command: MenuCommand): void {
  if (mainWindow === null) {
    // The start screen that opens has the URL field, and there is no video to close.
    ensureWindow();
    return;
  }
  sendToPage(IPC_CHANNELS.MENU_COMMAND, command);
}

function updateAppMenu(): void {
  const template = buildAppMenuTemplate({
    platform: process.platform,
    appName: app.name,
    recents: recentSources?.list() ?? [],
    settings: settings?.get() ?? DEFAULT_SETTINGS,
    isDevelopment: process.env.NODE_ENV === 'development',
    actions: {
      openFile: () => void chooseFileToOpen(),
      openUrl: () => sendMenuCommand('open-url'),
      openRecent: openSource,
      // The recent list and where each file was left are both watch history.
      clearRecent: () => {
        void recentSources?.clear();
        void watchHistory?.clear();
        app.clearRecentDocuments();
      },
      closeVideo: () => sendMenuCommand('close-video'),
      openRemoteControl: () => sendMenuCommand('remote-control'),
      setAutoplayNext: (autoplayNext) => void settings?.set({ autoplayNext }),
      setResumePlayback: (resumePlayback) => void settings?.set({ resumePlayback }),
      openLink: (url) => {
        if (isSafeExternalUrl(url)) void shell.openExternal(url);
      },
    },
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function cleanupApp(): Promise<void> {
  console.log('Cleaning up application...');

  await remoteControl?.setEnabled(false);
  remoteControl = null;

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
  app.on('activate', ensureWindow);

  return initializeApp();
}).catch((error) => {
  console.error('Failed to initialize application:', error);
  writeCrashLog('initializeApp', error);
});

// macOS: a file dropped on the Dock icon or picked from its recent documents. This can
// arrive before 'ready', so it is registered at once and held until the page loads.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openSource(filePath);
});

app.on('window-all-closed', async () => {
  if (process.platform === 'darwin') {
    // The process stays alive on macOS, so keep storage/torrent engine intact
    // (tearing them down left the IPC handlers holding a cleaned-up
    // StorageManager — "Storage manager not initialized" on the next load).
    // The torrent itself must still stop: otherwise its HTTP server, status
    // interval and download keep running with no UI attached. So must the remote,
    // which would be steering a page that is gone.
    try {
      await remoteControl?.setEnabled(false);
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
// Log path on macOS: ~/Library/Logs/saltplayer/crash.log
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
