import { DEFAULT_SETTINGS, type AppSettings } from '@/shared/types';
import { JsonFile } from './json-file';

interface SettingsOptions {
  onChange?: (settings: AppSettings) => void;
}

/** Keeps each known setting that has the right type; anything else falls back to its default. */
function withDefaults(stored: unknown): AppSettings {
  const values = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>;
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    if (typeof values[key] === typeof DEFAULT_SETTINGS[key]) {
      settings[key] = values[key] as AppSettings[typeof key];
    }
  }
  return settings;
}

/** User preferences, kept in `settings.json` in `userData`. */
export class Settings {
  private current: AppSettings = DEFAULT_SETTINGS;
  private readonly file: JsonFile;
  private readonly onChange: (settings: AppSettings) => void;

  constructor(filePath: string, options: SettingsOptions = {}) {
    this.file = new JsonFile(filePath);
    this.onChange = options.onChange ?? (() => {});
  }

  async load(): Promise<void> {
    this.current = withDefaults(await this.file.read());
  }

  get(): AppSettings {
    return this.current;
  }

  set(changes: Partial<AppSettings>): Promise<void> {
    this.current = { ...this.current, ...changes };
    this.onChange(this.current);
    return this.file.write(this.current);
  }
}
