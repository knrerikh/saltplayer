import * as crypto from 'crypto';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { parseRemoteCommand, REMOTE_PORT, type RemoteCommand, type RemoteState } from '@/shared/remote';
import { localAddresses, localHostName } from './network';
import { RateLimiter } from './rate-limiter';
import { remotePage } from './remote-page';

const MAX_BODY_BYTES = 8 * 1024;
const MAX_EVENT_CLIENTS = 8;
const PING_INTERVAL_MS = 25_000;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 120;

export interface RemoteControlServerOptions {
  /** Preferred port; if it is taken, any free one is used. */
  port?: number;
  onCommand(command: RemoteCommand): void;
  /** Local network addresses the server may be reached at; the Host header must be one of them. */
  addresses?: () => string[];
  /** The machine's `.local` name, which the Host header may also carry; null if it has none. */
  localName?: () => string | null;
  /** Epoch ms; injectable for tests. */
  now?: () => number;
}

/** What lets a phone in: the token from the link, and until when. */
export interface RemoteCredentials {
  token: string;
  /** Epoch ms; from then on the token is refused even if it matches. */
  expiresAt: number;
}

/**
 * The remote control: a page for a phone on the local network, commands from it, and
 * the player's state pushed back as Server-Sent Events. It is separate from the
 * streaming server, which listens on loopback only, and exists only between start() and
 * stop(). A phone is let in by a random token in the link, which the caller issues and
 * keeps for 30 days; see docs/ARCHITECTURE.md for the threat model.
 */
export class RemoteControlServer {
  private server: http.Server | null = null;
  private credentials: RemoteCredentials = { token: '', expiresAt: 0 };
  private port = 0;
  private portChanged = false;
  private lastState: RemoteState | null = null;
  private readonly eventClients = new Set<http.ServerResponse>();
  private readonly rateLimiter = new RateLimiter(RATE_LIMIT, RATE_WINDOW_MS);
  private starting: Promise<{ port: number; portChanged: boolean }> | null = null;
  private pingTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: RemoteControlServerOptions) {}

  get isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Starts listening on all interfaces and lets in `credentials`. `portChanged` says the
   * preferred port was taken, so links made for it do not match. Calling it while running
   * or starting changes nothing and returns the same port; use setCredentials() to swap the token.
   */
  start(credentials: RemoteCredentials): Promise<{ port: number; portChanged: boolean }> {
    if (this.server) return Promise.resolve({ port: this.port, portChanged: this.portChanged });
    this.starting ??= this.listen(credentials).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async listen(credentials: RemoteCredentials): Promise<{ port: number; portChanged: boolean }> {
    const server = http.createServer((req, res) => this.handle(req, res));
    const preferred = this.options.port ?? REMOTE_PORT;
    try {
      await listenOn(server, preferred).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EADDRINUSE') throw error;
        return listenOn(server, 0);
      });
    } catch (error) {
      server.close();
      throw error;
    }

    this.server = server;
    this.port = (server.address() as AddressInfo).port;
    this.portChanged = this.port !== preferred && preferred !== 0;
    this.credentials = credentials;
    this.pingTimer = setInterval(() => this.writeToClients(': ping\n\n'), PING_INTERVAL_MS);
    this.pingTimer.unref();
    return { port: this.port, portChanged: this.portChanged };
  }

  /** Switches to a new token and ends every stream, so phones that hold the old one reconnect and get 401. */
  setCredentials(credentials: RemoteCredentials): void {
    this.credentials = credentials;
    this.endEventStreams();
  }

  private endEventStreams(): void {
    for (const client of this.eventClients) client.end();
    this.eventClients.clear();
  }

  /** Ends every stream and closes the port, after a start still under way. */
  async stop(): Promise<void> {
    await this.starting?.catch(() => undefined);
    const server = this.server;
    if (!server) return;
    this.server = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.endEventStreams();
    this.rateLimiter.clear();
    this.lastState = null;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }

  /** Remembers the state for phones that connect later, and pushes it to those connected. */
  broadcast(state: RemoteState): void {
    this.lastState = state;
    this.writeToClients(stateEvent(state));
  }

  private writeToClients(chunk: string): void {
    for (const client of this.eventClients) client.write(chunk);
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (this.rateLimiter.isOverLimit(req.socket.remoteAddress ?? '')) return refuse(res, 429);
    if (!this.isKnownHost(req.headers.host)) return refuse(res, 403);

    const [path, query = ''] = (req.url ?? '').split('?', 2);
    const isCommand = req.method === 'POST' && path === '/api/command';
    const isPage = req.method === 'GET' && path === '/';
    const isEvents = req.method === 'GET' && path === '/api/events';
    if (!isCommand && !isPage && !isEvents) return refuse(res, 404);

    // A page of another origin could post to a phone's address from the user's browser;
    // the browser always names that page in Origin.
    if (isCommand && req.headers.origin !== `http://${req.headers.host}`) return refuse(res, 403);

    const given = isCommand
      ? /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1]
      : new URLSearchParams(query).get('t');
    if (!this.isToken(given)) return refuse(res, 401);

    if (isCommand) this.receiveCommand(req, res);
    else if (isEvents) this.openEventStream(req, res);
    else this.sendPage(res);
  }

  /**
   * A name that is not ours means the request came through a DNS entry pointed at us (rebinding).
   * Host names are case-insensitive, and a phone may type the `.local` name in any case.
   */
  private isKnownHost(host: string | undefined): boolean {
    const localName = (this.options.localName ?? localHostName)();
    const names = [...(this.options.addresses ?? localAddresses)(), 'localhost', '127.0.0.1', ...(localName ? [localName] : [])];
    return host !== undefined && names.some((name) => host.toLowerCase() === `${name.toLowerCase()}:${this.port}`);
  }

  private isToken(given: string | null | undefined): boolean {
    if (!given) return false;
    const actual = Buffer.from(this.credentials.token);
    const candidate = Buffer.from(given);
    const matches = candidate.length === actual.length && crypto.timingSafeEqual(candidate, actual);
    return matches && (this.options.now ?? Date.now)() < this.credentials.expiresAt;
  }

  private sendPage(res: http.ServerResponse): void {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        `style-src 'nonce-${nonce}'`,
        "connect-src 'self'",
        "img-src 'self' data:",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    });
    res.end(remotePage(nonce));
  }

  private openEventStream(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (this.eventClients.size >= MAX_EVENT_CLIENTS) return refuse(res, 503);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    if (this.lastState) res.write(stateEvent(this.lastState));
    this.eventClients.add(res);
    req.on('close', () => this.eventClients.delete(res));
  }

  private receiveCommand(req: http.IncomingMessage, res: http.ServerResponse): void {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Stop reading at once; the connection is closed once the refusal is out.
        res.once('finish', () => req.destroy());
        res.setHeader('Connection', 'close');
        refuse(res, 413);
      } else if (!res.writableEnded) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      const command = parseRemoteCommand(parseJson(Buffer.concat(chunks).toString()));
      if (!command) return refuse(res, 400);
      this.options.onCommand(command);
      res.writeHead(204).end();
    });
  }
}

const listenOn = (server: http.Server, port: number) =>
  new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });

const stateEvent = (state: RemoteState) => `event: state\ndata: ${JSON.stringify(state)}\n\n`;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const REASONS: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  413: 'Payload too large',
  429: 'Too many requests',
  503: 'Too many remotes connected',
};

function refuse(res: http.ServerResponse, status: number): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(REASONS[status]);
}
