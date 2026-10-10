const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Whether a URL from the renderer may be handed to `shell.openExternal`. Only web
 * URLs pass: `file:`, `smb:` and custom protocol handlers can open local files,
 * mount shares or launch other apps.
 */
export function isSafeExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
