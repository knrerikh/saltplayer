import * as crypto from 'crypto';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { parseRemoteCommand, type RemoteCommand, type RemoteState } from '@/shared/remote';
import { localAddresses } from './network';
import { RateLimiter } from './rate-limiter';
import { remotePage } from './remote-page';

/** The port a phone is sent to, fixed so a firewall rule or a bookmark keeps working. */
export const REMOTE_PORT = 8642;

const MAX_BODY_BYTES = 1024;
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
}

/**
 * The remote control: a page for a phone on the local network, commands from it, and
 * the player's state pushed back as Server-Sent Events. It is separate from the
 * streaming server, which listens on loopback only, and exists only between start() and
 * stop(). A phone is let in by a random token in the link, new on every start; see
 * docs/ARCHITECTURE.md for the threat model.
 */
export class RemoteControlServer {
  private server: http.Server | null = null;
  private token = '';
  private port = 0;
  private lastState: RemoteState | null = null;
  private readonly eventClients = new Set<http.ServerResponse>();
  private readonly rateLimiter = new RateLimiter(RATE_LIMIT, RATE_WINDOW_MS);
  private starting: Promise<{ port: number; token: string }> | null = null;
  private pingTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: RemoteControlServerOptions) {}

  get isRunning(): boolean {
    return this.server !== null;
  }

  /** Starts listening on all interfaces; calling it while running or starting returns the same port and token. */
  start(): Promise<{ port: number; token: string }> {
    if (this.server) return Promise.resolve({ port: this.port, token: this.token });
    this.starting ??= this.listen().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async listen(): Promise<{ port: number; token: string }> {
    const server = http.createServer((req, res) => this.handle(req, res));
    try {
      await listenOn(server, this.options.port ?? REMOTE_PORT).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EADDRINUSE') throw error;
        return listenOn(server, 0);
      });
    } catch (error) {
      server.close();
      throw error;
    }

    this.server = server;
    this.port = (server.address() as AddressInfo).port;
    this.token = crypto.randomBytes(16).toString('base64url');
    this.pingTimer = setInterval(() => this.writeToClients(': ping\n\n'), PING_INTERVAL_MS);
    this.pingTimer.unref();
    return { port: this.port, token: this.token };
  }

  /** Ends every stream and closes the port, after a start still under way. The next start() issues a new token. */
  async stop(): Promise<void> {
    await this.starting?.catch(() => undefined);
    const server = this.server;
    if (!server) return;
    this.server = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    for (const client of this.eventClients) client.end();
    this.eventClients.clear();
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

  /** A name that is not ours means the request came through a DNS entry pointed at us (rebinding). */
  private isKnownHost(host: string | undefined): boolean {
    const names = [...(this.options.addresses ?? localAddresses)(), 'localhost', '127.0.0.1'];
    return names.some((name) => host === `${name}:${this.port}`);
  }

  private isToken(given: string | null | undefined): boolean {
    if (!given) return false;
    const actual = Buffer.from(this.token);
    const candidate = Buffer.from(given);
    return candidate.length === actual.length && crypto.timingSafeEqual(candidate, actual);
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
