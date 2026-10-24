import type { MenuItemConstructorOptions } from 'electron';
import { VIDEO_EXTENSIONS } from '@/shared/video-files';
import type { RecentSource } from './recent-sources';

export const REPOSITORY_URL = 'https://github.com/knrerikh/saltplayer';

export const HELP_LINKS = {
  keyboardShortcuts: `${REPOSITORY_URL}/blob/master/docs/USER_GUIDE.md#keyboard-shortcuts`,
  userGuide: `${REPOSITORY_URL}/blob/master/docs/USER_GUIDE.md`,
  reportIssue: `${REPOSITORY_URL}/issues/new?template=bug_report.md`,
  releaseNotes: `${REPOSITORY_URL}/releases/latest`,
} as const;

/** File → Open File… accepts what the drop zone accepts. */
export const OPEN_FILE_FILTERS = [
  {
    name: 'Videos and torrents',
    extensions: ['torrent', ...VIDEO_EXTENSIONS.map((extension) => extension.slice(1))],
  },
];

export interface AppMenuActions {
  openFile(): void;
  openUrl(): void;
  openRecent(source: string): void;
  clearRecent(): void;
  closeVideo(): void;
  openLink(url: string): void;
}

interface AppMenuOptions {
  platform: NodeJS.Platform;
  appName: string;
  recents: readonly RecentSource[];
  actions: AppMenuActions;
  isDevelopment: boolean;
}

/** Menu labels read `&` as a mnemonic marker; a torrent name must show as typed. */
const escapeMnemonics = (label: string) => label.replace(/&/g, '&&');

/**
 * The application menu as a plain template, so it can be tested without Electron.
 * macOS keeps its standard app, Edit and Window menus (Edit makes ⌘C/⌘V work in the
 * magnet field); Windows and Linux get File, View and Help, with Quit and About in them.
 */
export function buildAppMenuTemplate({
  platform,
  appName,
  recents,
  actions,
  isDevelopment,
}: AppMenuOptions): MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin';
  const separator: MenuItemConstructorOptions = { type: 'separator' };

  const openRecent: MenuItemConstructorOptions[] = [
    ...recents.map(({ source, label }) => ({
      label: escapeMnemonics(label),
      click: () => actions.openRecent(source),
    })),
    ...(recents.length > 0 ? [separator] : []),
    { label: 'Clear Menu', enabled: recents.length > 0, click: actions.clearRecent },
  ];

  const file: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      { label: 'Open File…', accelerator: 'CmdOrCtrl+O', click: actions.openFile },
      { label: 'Open URL…', accelerator: 'CmdOrCtrl+U', click: actions.openUrl },
      { label: 'Open Recent', submenu: openRecent },
      separator,
      { label: 'Close Video', accelerator: 'CmdOrCtrl+W', click: actions.closeVideo },
      ...(isMac ? [] : [separator, { role: 'quit' } as const]),
    ],
  };

  const view: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      { role: 'togglefullscreen' },
      ...(isDevelopment ? [separator, { role: 'toggleDevTools' } as const] : []),
    ],
  };

  const help: MenuItemConstructorOptions = {
    role: 'help',
    submenu: [
      { label: 'Keyboard Shortcuts', click: () => actions.openLink(HELP_LINKS.keyboardShortcuts) },
      { label: 'User Guide', click: () => actions.openLink(HELP_LINKS.userGuide) },
      separator,
      { label: 'Report an Issue…', click: () => actions.openLink(HELP_LINKS.reportIssue) },
      { label: 'Release Notes', click: () => actions.openLink(HELP_LINKS.releaseNotes) },
      ...(isMac ? [] : [separator, { role: 'about' } as const]),
    ],
  };

  if (!isMac) return [file, view, help];

  return [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        separator,
        { role: 'services' },
        separator,
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        separator,
        { role: 'quit' },
      ],
    },
    file,
    { role: 'editMenu' },
    view,
    { role: 'windowMenu' },
    help,
  ];
}
