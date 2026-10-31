import * as QRCode from 'qrcode';
import { REMOTE_DISABLED, type RemoteCommand, type RemoteState, type RemoteStatus } from '@/shared/remote';
import { localAddresses } from './network';
import { RemoteControlServer } from './remote-server';

export interface RemoteControlOptions {
  /** A command from the phone, for the page to carry out. */
  onCommand(command: RemoteCommand): void;
  /** The remote was turned on or off. */
  onStatus(status: RemoteStatus): void;
  port?: number;
  addresses?: () => string[];
}

/** Turns the remote server on and off and describes it to the dialog: the pairing links and their QR code. */
export class RemoteControl {
  private readonly server: RemoteControlServer;
  private readonly addresses: () => string[];
  private current: RemoteStatus = REMOTE_DISABLED;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: RemoteControlOptions) {
    this.addresses = options.addresses ?? localAddresses;
    this.server = new RemoteControlServer({
      port: options.port,
      onCommand: options.onCommand,
      addresses: this.addresses,
    });
  }

  get status(): RemoteStatus {
    return this.current;
  }

  /**
   * Starting twice keeps the running server and its link; stopping revokes the link.
   * Calls run one after another, each deciding from what the one before left, so a double
   * click cannot start a second server or leave one running after "off".
   */
  setEnabled(enabled: boolean): Promise<RemoteStatus> {
    const result = this.queue.then(() => this.apply(enabled));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async apply(enabled: boolean): Promise<RemoteStatus> {
    if (enabled === this.server.isRunning) return this.current;
    if (enabled) {
      const { port, token } = await this.server.start();
      const urls = this.addresses().map((address) => `http://${address}:${port}/?t=${token}`);
      const qrDataUrl = urls.length > 0 ? await QRCode.toDataURL(urls[0]) : null;
      this.current = { enabled: true, urls, qrDataUrl, port };
    } else {
      await this.server.stop();
      this.current = REMOTE_DISABLED;
    }
    this.options.onStatus(this.current);
    return this.current;
  }

  broadcast(state: RemoteState): void {
    this.server.broadcast(state);
  }
}
