import { parseMagnetLink } from './magnet-link';

interface MagnetLinkDeps {
  /** A video is open, or on its way. */
  isOpen(): boolean;
  /** The lowercase hex info hash of the open torrent, or null (a local file, nothing open). */
  currentInfoHash(): string | null;
  /** Asks whether to replace the open video; `name` is untrusted text from the link, or null. */
  confirm(name: string | null): Promise<boolean>;
  open(uri: string): void;
  /** Brings the window forward. */
  reveal(): void;
  warn(message: string): void;
}

/** The native dialog that asks before a link replaces the video that is playing. */
export function magnetConfirmation(name: string | null) {
  return {
    type: 'question' as const,
    message: `Open "${name ?? 'this magnet link'}"?`,
    detail: 'The current video will close.',
    buttons: ['Open', 'Cancel'],
    // Cancel is the default, so a stray Enter or click does not discard what is playing.
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
}

/**
 * What to do with a link that reached the app from outside, whether the OS or a
 * command line delivered it. The OS routes only links it chose us for, so no setting
 * is checked here. A link never replaces a playing video without asking.
 */
export function createMagnetLinkHandler(deps: MagnetLinkDeps): (value: unknown) => Promise<void> {
  let asking = false;

  return async (value) => {
    const magnet = parseMagnetLink(value);
    if (!magnet) {
      // The rejected text came from a website, so it is not echoed into the log.
      deps.warn('Ignored a link that is not a valid magnet link.');
      return;
    }

    deps.reveal();
    if (!deps.isOpen()) {
      deps.open(magnet.uri);
      return;
    }
    if (magnet.infoHash !== null && magnet.infoHash === deps.currentInfoHash()) return;

    // A page can fire links faster than anyone answers; one question at a time.
    if (asking) return;
    asking = true;
    try {
      if (await deps.confirm(magnet.name)) deps.open(magnet.uri);
    } finally {
      asking = false;
    }
  };
}
