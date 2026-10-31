import { describe, it, expect, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { buildAppMenuTemplate, HELP_LINKS, type AppMenuActions } from '@/main/app-menu';
import type { RecentSource } from '@/main/recent-sources';

const actions = (): AppMenuActions => ({
  openFile: vi.fn(),
  openUrl: vi.fn(),
  openRecent: vi.fn(),
  clearRecent: vi.fn(),
  closeVideo: vi.fn(),
  setAutoplayNext: vi.fn(),
  setResumePlayback: vi.fn(),
  openRemoteControl: vi.fn(),
  openLink: vi.fn(),
});

const build = (overrides: Partial<Parameters<typeof buildAppMenuTemplate>[0]> = {}) =>
  buildAppMenuTemplate({
    platform: 'darwin',
    appName: 'Salt Player',
    recents: [],
    settings: { autoplayNext: true, resumePlayback: true },
    actions: actions(),
    isDevelopment: false,
    ...overrides,
  });

const submenuOf = (item: MenuItemConstructorOptions | undefined) =>
  (item?.submenu ?? []) as MenuItemConstructorOptions[];

const topLevel = (template: MenuItemConstructorOptions[], label: string) =>
  template.find((item) => item.label === label || item.role === label);

const itemIn = (template: MenuItemConstructorOptions[], menu: string, label: string) =>
  submenuOf(topLevel(template, menu)).find((item) => item.label === label);

const click = (item: MenuItemConstructorOptions | undefined) =>
  (item?.click as () => void)?.();

const recent = (label: string): RecentSource => ({ source: `/v/${label}`, label, key: `/v/${label}` });

describe('buildAppMenuTemplate (#31)', () => {
  it('keeps the standard macOS app, Edit and Window menus', () => {
    const template = build();

    expect(template.map((item) => item.label ?? item.role)).toEqual([
      'Salt Player',
      'File',
      'editMenu',
      'View',
      'Playback',
      'windowMenu',
      'help',
    ]);
    expect(submenuOf(template[0]).map((item) => item.role ?? item.type)).toEqual([
      'about',
      'separator',
      'services',
      'separator',
      'hide',
      'hideOthers',
      'unhide',
      'separator',
      'quit',
    ]);
  });

  it.each(['win32', 'linux'] as const)('gives %s File, View, Playback and Help, with Quit and About in them', (platform) => {
    const template = build({ platform });

    expect(template.map((item) => item.label ?? item.role)).toEqual(['File', 'View', 'Playback', 'help']);
    expect(submenuOf(topLevel(template, 'File')).at(-1)?.role).toBe('quit');
    expect(submenuOf(topLevel(template, 'help')).at(-1)?.role).toBe('about');
  });

  it.each([
    ['Open File…', 'CmdOrCtrl+O', 'openFile'],
    ['Open URL…', 'CmdOrCtrl+U', 'openUrl'],
    ['Close Video', 'CmdOrCtrl+W', 'closeVideo'],
  ] as const)('File → %s (%s) runs %s', (label, accelerator, action) => {
    const menuActions = actions();
    const item = itemIn(build({ actions: menuActions }), 'File', label);

    click(item);

    expect(item?.accelerator).toBe(accelerator);
    expect(menuActions[action]).toHaveBeenCalled();
  });

  it('toggles window fullscreen from View', () => {
    const view = submenuOf(topLevel(build(), 'View'));

    expect(view.map((item) => item.role)).toEqual(['togglefullscreen']);
  });

  it('adds developer tools to View only in development', () => {
    const view = submenuOf(topLevel(build({ isDevelopment: true }), 'View'));

    expect(view.map((item) => item.role)).toContain('toggleDevTools');
  });

  describe('Playback → Autoplay Next Episode (#42)', () => {
    const autoplayItem = (template: MenuItemConstructorOptions[]) =>
      itemIn(template, 'Playback', 'Autoplay Next Episode');

    it.each([true, false])('is a checkbox showing the setting (%s)', (autoplayNext) => {
      const item = autoplayItem(build({ settings: { autoplayNext, resumePlayback: true } }));

      expect(item).toMatchObject({ type: 'checkbox', checked: autoplayNext });
    });

    it.each([true, false])('sets autoplay to the new checkbox state (%s)', (checked) => {
      const menuActions = actions();
      const item = autoplayItem(build({ actions: menuActions }));

      (item?.click as (menuItem: { checked: boolean }) => void)({ checked });

      expect(menuActions.setAutoplayNext).toHaveBeenCalledWith(checked);
    });
  });

  describe('Playback → Resume Playback (#51)', () => {
    const resumeItem = (template: MenuItemConstructorOptions[]) =>
      itemIn(template, 'Playback', 'Resume Playback');

    it.each([true, false])('is a checkbox showing the setting (%s)', (resumePlayback) => {
      const item = resumeItem(build({ settings: { autoplayNext: true, resumePlayback } }));

      expect(item).toMatchObject({ type: 'checkbox', checked: resumePlayback });
    });

    it.each([true, false])('sets resuming to the new checkbox state (%s)', (checked) => {
      const menuActions = actions();
      const item = resumeItem(build({ actions: menuActions }));

      (item?.click as (menuItem: { checked: boolean }) => void)({ checked });

      expect(menuActions.setResumePlayback).toHaveBeenCalledWith(checked);
    });
  });

  describe('Playback → Remote Control… (#64)', () => {
    it('is the last item, after a separator, and opens the remote control dialog', () => {
      const menuActions = actions();
      const playback = submenuOf(topLevel(build({ actions: menuActions }), 'Playback'));

      expect(playback.at(-2)?.type).toBe('separator');
      expect(playback.at(-1)?.label).toBe('Remote Control…');
      click(playback.at(-1));

      expect(menuActions.openRemoteControl).toHaveBeenCalled();
    });
  });

  describe('Open Recent', () => {
    const openRecentMenu = (template: MenuItemConstructorOptions[]) =>
      submenuOf(itemIn(template, 'File', 'Open Recent'));

    it('lists recent sources newest first and opens the one clicked', () => {
      const menuActions = actions();
      const items = openRecentMenu(
        build({ recents: [recent('b.mkv'), recent('a.mkv')], actions: menuActions }),
      );

      click(items[1]);

      expect(items.map((item) => item.label ?? item.type)).toEqual([
        'b.mkv',
        'a.mkv',
        'separator',
        'Clear Menu',
      ]);
      expect(menuActions.openRecent).toHaveBeenCalledWith('/v/a.mkv');
    });

    it('clears the list', () => {
      const menuActions = actions();
      const clear = openRecentMenu(build({ recents: [recent('a.mkv')], actions: menuActions })).at(-1);

      click(clear);

      expect(menuActions.clearRecent).toHaveBeenCalled();
    });

    it('offers only a disabled Clear Menu when empty', () => {
      const items = openRecentMenu(build());

      expect(items).toEqual([expect.objectContaining({ label: 'Clear Menu', enabled: false })]);
    });

    it('does not let a name be read as a mnemonic', () => {
      const [item] = openRecentMenu(build({ recents: [recent('Tom & Jerry')] }));

      expect(item.label).toBe('Tom && Jerry');
    });
  });

  it.each([
    ['Keyboard Shortcuts', HELP_LINKS.keyboardShortcuts],
    ['User Guide', HELP_LINKS.userGuide],
    ['Report an Issue…', HELP_LINKS.reportIssue],
    ['Release Notes', HELP_LINKS.releaseNotes],
  ])('Help → %s opens its page', (label, url) => {
    const menuActions = actions();

    click(itemIn(build({ actions: menuActions }), 'help', label));

    expect(menuActions.openLink).toHaveBeenCalledWith(url);
  });

  it('points Help at the project on GitHub', () => {
    for (const url of Object.values(HELP_LINKS)) {
      expect(url).toMatch(/^https:\/\/github\.com\/knrerikh\/saltplayer\//);
    }
  });

  it('does not take keys the player uses', () => {
    const accelerators = JSON.stringify(build()).match(/"accelerator":"[^"]*"/g) ?? [];

    expect(accelerators.join()).not.toMatch(/Space|Esc/);
  });
});
