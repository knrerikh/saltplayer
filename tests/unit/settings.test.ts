import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Settings } from '@/main/settings';
import { DEFAULT_SETTINGS } from '@/shared/types';

describe('Settings (#42)', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'));
    filePath = path.join(dir, 'settings.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('turns autoplay of the next episode on by default', async () => {
    const settings = new Settings(filePath);
    await settings.load();

    expect(DEFAULT_SETTINGS.autoplayNext).toBe(true);
    expect(settings.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('survives a restart', async () => {
    const first = new Settings(filePath);
    await first.set({ autoplayNext: false });

    const second = new Settings(filePath);
    await second.load();

    expect(second.get().autoplayNext).toBe(false);
  });

  it('keeps defaults for values of the wrong type and drops unknown keys', async () => {
    fs.writeFileSync(filePath, JSON.stringify({ autoplayNext: 'no', theme: 'dark' }));
    const settings = new Settings(filePath);
    await settings.load();

    expect(settings.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults from a corrupt file', async () => {
    fs.writeFileSync(filePath, '[1, 2');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const settings = new Settings(filePath);
    await settings.load();

    expect(settings.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('reports a change with the new settings', async () => {
    const onChange = vi.fn();
    const settings = new Settings(filePath, { onChange });

    await settings.set({ autoplayNext: false });

    expect(onChange).toHaveBeenCalledWith({ autoplayNext: false });
  });
});
