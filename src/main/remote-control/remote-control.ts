import * as QRCode from 'qrcode';
import { REMOTE_DISABLED, type RemoteCommand, type RemoteState, type RemoteStatus } from '@/shared/remote';
import type { AppSettings } from '@/shared/types';
import { localAddresses, localHostName } from './network';
import { RemoteControlServer } from './remote-server';
import { RemoteTokenStore, type RemoteToken } from './token-store';

export interface RemoteControlOptions {
  /** A command from the phone, for the page to carry out. */
  onCommand(command: RemoteCommand): void;
  /** The remote was turned on or off, or its link was reset. */
  onStatus(status: RemoteStatus): void;
  /** Where the link's token lives between launches. */
  tokens: RemoteTokenStore;
  port?: number;
  addresses?: () => string[];
  localName?: () => string | null;
  /** Epoch ms; injectable for tests. */
  now?: () => number;
}

/**
 * Turns the remote server on and off and describes it to the dialog: the pairing links and
 * their QR code. The link's token outlives the server (see RemoteTokenStore): it stays the
 * same when the remote is turned off and on and when the app restarts, until it is 30 days
 * old or resetLink() replaces it.
 */
export class RemoteControl {
  private readonly server: RemoteControlServer;
  private readonly addresses: () => string[];
  private readonly localName: () => string | null;
  private current: RemoteStatus = REMOTE_DISABLED;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: RemoteControlOptions) {
    this.addresses = options.addresses ?? localAddresses;
    this.localName = options.localName ?? localHostName;
    this.server = new RemoteControlServer({
      port: options.port,
      onCommand: options.onCommand,
      addresses: this.addresses,
      localName: this.localName,
      now: options.now,
    });
  }

  get status(): RemoteStatus {
    return this.current;
  }

  /**
   * Starting twice keeps the running server and its link; stopping closes the port but keeps
   * the token for the next start. Calls run one after another, each deciding from what the one
   * before left, so a double click cannot start a second server or leave one running after "off".
   */
  setEnabled(enabled: boolean): Promise<RemoteStatus> {
    return this.enqueue(() => this.apply(enabled));
  }

  /**
   * Replaces the token at once. While the remote is on, open phones lose their stream and
   * get 401 on reconnecting, and the status carries the new link; while it is off, the
   * next start uses the new token.
   */
  resetLink(): Promise<RemoteStatus> {
    return this.enqueue(async () => {
      const issued = await this.options.tokens.reset();
      if (!this.server.isRunning) return this.current;
      this.server.setCredentials(credentialsOf(issued));
      return this.publish(await this.describe(issued, this.current.port!, this.current.portChanged));
    });
  }

  private enqueue(task: () => Promise<RemoteStatus>): Promise<RemoteStatus> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async apply(enabled: boolean): Promise<RemoteStatus> {
    if (enabled === this.server.isRunning) return this.current;
    if (enabled) {
      const issued = await this.options.tokens.current();
      const { port, portChanged } = await this.server.start(credentialsOf(issued));
      return this.publish(await this.describe(issued, port, portChanged));
    }
    await this.server.stop();
    return this.publish(REMOTE_DISABLED);
  }

  private publish(status: RemoteStatus): RemoteStatus {
    this.current = status;
    this.options.onStatus(status);
    return status;
  }

  private async describe({ token, createdAt }: RemoteToken, port: number, portChanged: boolean): Promise<RemoteStatus> {
    const addresses = this.addresses();
    // A name is of no use without a network; it is listed first as it survives a change of address.
    const localName = this.localName();
    const hosts = addresses.length > 0 && localName ? [localName, ...addresses] : addresses;
    const urls = hosts.map((host) => `http://${host}:${port}/?t=${token}`);
    const qrDataUrl = urls.length > 0 ? await QRCode.toDataURL(urls[0]) : null;
    return { enabled: true, urls, qrDataUrl, port, expiresAt: RemoteTokenStore.expiresAt({ token, createdAt }), portChanged };
  }

  broadcast(state: RemoteState): void {
    this.server.broadcast(state);
  }
}

const credentialsOf = (issued: RemoteToken) => ({ token: issued.token, expiresAt: RemoteTokenStore.expiresAt(issued) });

/** Turns the remote on at launch if the user asked for it; a failure is logged, never stops the app opening. */
export async function startRemoteAtLaunch(
  remote: Pick<RemoteControl, 'setEnabled'>,
  settings: Pick<AppSettings, 'remoteAtLaunch'>,
): Promise<void> {
  if (!settings.remoteAtLaunch) return;
  try {
    await remote.setEnabled(true);
  } catch (error) {
    console.error('Could not start remote control at launch:', error);
  }
}
