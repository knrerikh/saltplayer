import { describe, it, expect, afterEach, vi } from 'vitest';
import * as http from 'http';
import * as net from 'net';
import { RemoteControlServer } from '@/main/remote-control/remote-server';
import type { RemoteState } from '@/shared/remote';

const state: RemoteState = {
  hasVideo: true, title: 'a.mkv', isPlaying: true, currentTime: 5, duration: 60, volume: 1, muted: false, isFullscreen: false,
  episodes: [], episodeIndex: -1, hasPrevious: false, hasNext: false,
};

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

interface RequestOptions {
  method?: string;
  path?: string;
  headers?: http.OutgoingHttpHeaders;
  body?: string;
}

/** Node's http rather than fetch: the tests set Host and Origin, which fetch forbids. */
function request(port: number, { method = 'GET', path = '/', headers = {}, body }: RequestOptions = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path, agent: false, headers: { Host: `127.0.0.1:${port}`, ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * Whether our server answers with the remote page. A closed port is not proof that it is
 * ours that is closed: the system may hand the same random port to another test file.
 */
const serves = (port: number, token: string) =>
  request(port, { path: `/?t=${token}` }).then(
    (reply) => reply.status === 200 && reply.body.includes('Salt Player Remote'),
    () => false,
  );

const command = (port: number, token: string, overrides: RequestOptions = {}) =>
  request(port, {
    method: 'POST',
    path: '/api/command',
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: `http://127.0.0.1:${port}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'toggle-play' }),
    ...overrides,
  });

/** Opens the event stream and collects what arrives. */
function listen(port: number, token: string) {
  return new Promise<{ received: () => string; response: http.IncomingMessage; waitFor: (text: string) => Promise<void> }>(
    (resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: `/api/events?t=${token}`, headers: { Host: `127.0.0.1:${port}` } },
        (response) => {
          let received = '';
          const watchers: Array<() => void> = [];
          response.on('data', (chunk) => {
            received += chunk;
            watchers.forEach((check) => check());
          });
          resolve({
            response,
            received: () => received,
            waitFor: (text) =>
              new Promise((done) => {
                const check = () => received.includes(text) && done();
                watchers.push(check);
                check();
              }),
          });
        },
      );
      req.on('error', reject);
      req.end();
    },
  );
}

const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA';
const DAY = 24 * 60 * 60 * 1000;
const credentials = (token = TOKEN, expiresAt = Date.now() + DAY) => ({ token, expiresAt });

describe('RemoteControlServer (#64)', () => {
  const running: RemoteControlServer[] = [];

  async function started(
    options: Partial<ConstructorParameters<typeof RemoteControlServer>[0]> = {},
    given = credentials(),
  ) {
    const onCommand = vi.fn();
    const server = new RemoteControlServer({ port: 0, onCommand, ...options });
    running.push(server);
    const { port, portChanged } = await server.start(given);
    return { server, port, portChanged, token: given.token, onCommand };
  }

  afterEach(async () => {
    await Promise.all(running.splice(0).map((server) => server.stop()));
  });

  describe('lifecycle', () => {
    it('is not listening before start()', async () => {
      const server = new RemoteControlServer({ port: 0, onCommand: vi.fn() });

      expect(server.isRunning).toBe(false);
    });

    it('listens after start() and frees the port after stop()', async () => {
      const { server, port, token } = await started();
      expect(server.isRunning).toBe(true);
      expect((await request(port, { path: `/?t=${token}` })).status).toBe(200);

      await server.stop();

      expect(server.isRunning).toBe(false);
      expect(await serves(port, token)).toBe(false);
    });

    it('two start() calls at once share one server', async () => {
      const server = new RemoteControlServer({ port: 0, onCommand: vi.fn() });
      running.push(server);

      const [first, second] = await Promise.all([server.start(credentials()), server.start(credentials('B'.repeat(22)))]);

      expect(second).toEqual(first);
      expect((await request(first.port, { path: `/?t=${TOKEN}` })).status).toBe(200);
      await server.stop();
      expect(await serves(first.port, TOKEN)).toBe(false);
    });

    it('stop() during a start leaves nothing listening', async () => {
      const server = new RemoteControlServer({ port: 0, onCommand: vi.fn() });
      running.push(server);

      const starting = server.start(credentials());
      await server.stop();
      const { port } = await starting;

      expect(server.isRunning).toBe(false);
      expect(await serves(port, TOKEN)).toBe(false);
    });

    it('stop() is harmless when not running', async () => {
      await expect(new RemoteControlServer({ port: 0, onCommand: vi.fn() }).stop()).resolves.toBeUndefined();
    });

    it('accepts the token it is given, also after a restart', async () => {
      const { server } = await started();
      await server.stop();

      const { port } = await server.start(credentials());

      expect((await request(port, { path: `/?t=${TOKEN}` })).status).toBe(200);
    });

    it('falls back to a free port when the preferred one is taken', async () => {
      const blocker = net.createServer();
      await new Promise<void>((resolve) => blocker.listen(0, '0.0.0.0', resolve));
      const busyPort = (blocker.address() as net.AddressInfo).port;
      try {
        const { port, token, portChanged } = await started({ port: busyPort });

        expect(port).not.toBe(busyPort);
        expect(portChanged).toBe(true);
        expect((await request(port, { path: `/?t=${token}` })).status).toBe(200);
      } finally {
        await new Promise((resolve) => blocker.close(resolve));
      }
    });
  });

  describe('token', () => {
    it('401 once the token has expired, with the right token', async () => {
      let clock = 1_000;
      const { port, token } = await started({ now: () => clock }, credentials(TOKEN, 2_000));
      expect((await request(port, { path: `/?t=${token}` })).status).toBe(200);

      clock = 2_000;

      expect((await request(port, { path: `/?t=${token}` })).status).toBe(401);
      expect((await command(port, token)).status).toBe(401);
    });

    it('setCredentials() swaps the token and ends open streams', async () => {
      const { server, port, token } = await started();
      const stream = await listen(port, token);
      await stream.waitFor('retry:');
      const ended = new Promise<void>((resolve) => stream.response.on('end', resolve));

      server.setCredentials(credentials('C'.repeat(22)));
      await ended;

      expect((await request(port, { path: `/?t=${token}` })).status).toBe(401);
      expect((await request(port, { path: `/?t=${'C'.repeat(22)}` })).status).toBe(200);
    });

    it.each([
      ['page', { path: '/' }],
      ['events', { path: '/api/events' }],
    ])('401 for a missing token on the %s', async (_, options) => {
      const { port } = await started();

      expect((await request(port, options)).status).toBe(401);
    });

    it.each([
      ['page', '/'],
      ['events', '/api/events'],
    ])('401 for a wrong token on the %s', async (_, path) => {
      const { port, token } = await started();

      expect((await request(port, { path: `${path}?t=${token}x` })).status).toBe(401);
      expect((await request(port, { path: `${path}?t=${token.slice(1)}` })).status).toBe(401);
    });

    it('401 for a command without or with a wrong bearer token', async () => {
      const { port, token, onCommand } = await started();

      expect((await command(port, token, { headers: { Origin: `http://127.0.0.1:${port}` } })).status).toBe(401);
      expect((await command(port, `${token}x`)).status).toBe(401);
      expect(onCommand).not.toHaveBeenCalled();
    });
  });

  describe('Host and Origin', () => {
    it('403 for a foreign Host, which is what DNS rebinding sends', async () => {
      const { port, token } = await started();

      const reply = await request(port, { path: `/?t=${token}`, headers: { Host: `evil.example:${port}` } });

      expect(reply.status).toBe(403);
    });

    it('403 for the right name on another port', async () => {
      const { port, token } = await started();

      expect((await request(port, { path: `/?t=${token}`, headers: { Host: '127.0.0.1:1' } })).status).toBe(403);
    });

    it('accepts the address of a local interface as Host', async () => {
      const { port, token } = await started({ addresses: () => ['192.168.1.5'] });

      const reply = await request(port, { path: `/?t=${token}`, headers: { Host: `192.168.1.5:${port}` } });

      expect(reply.status).toBe(200);
    });

    it.each(['Mac-Mini.local', 'mac-mini.LOCAL', 'MAC-MINI.local'])('accepts the machine\'s .local name as Host in any case (%s)', async (host) => {
      const { port, token } = await started({ localName: () => 'Mac-Mini.local' });

      const reply = await request(port, { path: `/?t=${token}`, headers: { Host: `${host}:${port}` } });

      expect(reply.status).toBe(200);
    });

    it('403 for the .local name on another port, a foreign .local name, or without a machine name', async () => {
      const { port, token } = await started({ localName: () => 'Mac-Mini.local' });
      const noName = await started({ localName: () => null });

      expect((await request(port, { path: `/?t=${token}`, headers: { Host: 'Mac-Mini.local:1' } })).status).toBe(403);
      expect((await request(port, { path: `/?t=${token}`, headers: { Host: `other.local:${port}` } })).status).toBe(403);
      expect((await request(port, { path: `/?t=${token}`, headers: { Host: `Mac-Mini.local.evil.example:${port}` } })).status).toBe(403);
      expect((await request(noName.port, { path: `/?t=${token}`, headers: { Host: `Mac-Mini.local:${noName.port}` } })).status).toBe(403);
    });

    it('403 for a command without an Origin', async () => {
      const { port, token, onCommand } = await started();

      const reply = await command(port, token, { headers: { Authorization: `Bearer ${token}` } });

      expect(reply.status).toBe(403);
      expect(onCommand).not.toHaveBeenCalled();
    });

    it('403 for a command from a foreign Origin', async () => {
      const { port, token, onCommand } = await started();

      const reply = await command(port, token, {
        headers: { Authorization: `Bearer ${token}`, Origin: 'http://evil.example' },
      });

      expect(reply.status).toBe(403);
      expect(onCommand).not.toHaveBeenCalled();
    });
  });

  describe('rate limit', () => {
    it('429 past 120 requests in a window', async () => {
      const { port } = await started();

      const statuses: number[] = [];
      for (let i = 0; i < 121; i++) statuses.push((await request(port, { path: '/nothing' })).status);

      expect(statuses.slice(0, 120).every((status) => status === 404)).toBe(true);
      expect(statuses[120]).toBe(429);
    });
  });

  describe('commands', () => {
    it('hands a valid command to onCommand and answers 204', async () => {
      const { port, token, onCommand } = await started();

      const reply = await command(port, token);

      expect(reply.status).toBe(204);
      expect(onCommand).toHaveBeenCalledTimes(1);
      expect(onCommand).toHaveBeenCalledWith({ type: 'toggle-play' });
    });

    it.each([
      ['seek-to', { type: 'seek-to', time: 42 }],
      ['seek-by', { type: 'seek-by', seconds: -10 }],
      ['set-volume', { type: 'set-volume', volume: 0.4 }],
      ['set-muted', { type: 'set-muted', muted: true }],
      ['toggle-fullscreen', { type: 'toggle-fullscreen' }],
      ['close-video', { type: 'close-video' }],
      ['previous-episode', { type: 'previous-episode' }],
      ['next-episode', { type: 'next-episode' }],
      ['select-episode', { type: 'select-episode', name: 'S01E02.mkv' }],
      ['select-episode with a long name', { type: 'select-episode', name: 'é'.repeat(1024) }],
    ])('passes a valid %s on exactly as parsed', async (_, body) => {
      const { port, token, onCommand } = await started();

      const reply = await command(port, token, { body: JSON.stringify({ ...body, extra: 1 }) });

      expect(reply.status).toBe(204);
      expect(onCommand).toHaveBeenCalledWith(body);
    });

    it.each([
      ['not JSON', '{nope'],
      ['a seek-to with a negative time', JSON.stringify({ type: 'seek-to', time: -5 })],
      ['a seek-by of zero', JSON.stringify({ type: 'seek-by', seconds: 0 })],
      ['a seek-by over an hour', JSON.stringify({ type: 'seek-by', seconds: 7200 })],
      ['a set-volume over 1', JSON.stringify({ type: 'set-volume', volume: 1.5 })],
      ['a set-volume below 0', JSON.stringify({ type: 'set-volume', volume: -0.1 })],
      ['a set-muted without a boolean', JSON.stringify({ type: 'set-muted', muted: 'yes' })],
      ['a select-episode without a name', JSON.stringify({ type: 'select-episode' })],
      ['a select-episode with an empty name', JSON.stringify({ type: 'select-episode', name: '' })],
      ['a select-episode with a name over 1024 characters', JSON.stringify({ type: 'select-episode', name: 'x'.repeat(1025) })],
      ['an unknown command', JSON.stringify({ type: 'format-disk' })],
      ['a non-object', '42'],
    ])('400 for %s', async (_, body) => {
      const { port, token, onCommand } = await started();

      expect((await command(port, token, { body })).status).toBe(400);
      expect(onCommand).not.toHaveBeenCalled();
    });

    it('rejects a body over 8 KB', async () => {
      const { port, token, onCommand } = await started();

      const reply = await command(port, token, { body: JSON.stringify({ type: 'toggle-play', pad: 'x'.repeat(10_000) }) });

      expect([400, 413]).toContain(reply.status);
      expect(onCommand).not.toHaveBeenCalled();
    });
  });

  describe('routes', () => {
    it.each([
      ['an unknown path', 'GET', '/admin'],
      ['a wrong method on the page', 'POST', '/'],
      ['a wrong method on the command route', 'GET', '/api/command'],
    ])('404 for %s', async (_, method, path) => {
      const { port, token } = await started();

      expect((await request(port, { method, path: `${path}?t=${token}` })).status).toBe(404);
    });
  });

  describe('events', () => {
    it('sends the last state on connect and every broadcast after', async () => {
      const { server, port, token } = await started();
      server.broadcast(state);

      const events = await listen(port, token);
      await events.waitFor('event: state');
      expect(events.response.headers['content-type']).toContain('text/event-stream');
      expect(events.received()).toContain(`data: ${JSON.stringify(state)}`);

      const next = { ...state, isPlaying: false };
      server.broadcast(next);
      await events.waitFor(`data: ${JSON.stringify(next)}`);
    });

    it('sends nothing on connect before the first state', async () => {
      const { port, token } = await started();

      const events = await listen(port, token);
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(events.received()).not.toContain('event: state');
    });

    it('refuses a ninth client with 503', async () => {
      const { port, token } = await started();
      for (let i = 0; i < 8; i++) await listen(port, token);

      expect((await request(port, { path: `/api/events?t=${token}` })).status).toBe(503);
    });

    it('stop() ends the stream', async () => {
      const { server, port, token } = await started();
      const events = await listen(port, token);
      const ended = new Promise<void>((resolve) => events.response.on('close', resolve));

      await server.stop();

      await expect(ended).resolves.toBeUndefined();
    });
  });

  describe('headers', () => {
    it.each(['/api/nothing', '/'])('are set on %s, even when it is refused', async (path) => {
      const { port } = await started();

      const { headers } = await request(port, { path });

      expect(headers['cache-control']).toBe('no-store');
      expect(headers['referrer-policy']).toBe('no-referrer');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-content-type-options']).toBe('nosniff');
    });

    it('give the page a CSP whose nonce is the one on its script and style', async () => {
      const { port, token } = await started();

      const { headers, body } = await request(port, { path: `/?t=${token}` });

      const csp = String(headers['content-security-policy']);
      const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
      expect(nonce).toBeTruthy();
      expect(csp).toContain(`style-src 'nonce-${nonce}'`);
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(body).toContain(`<script nonce="${nonce}">`);
      expect(body).toContain(`<style nonce="${nonce}">`);
      expect(headers['content-type']).toContain('text/html');
    });

    it('use a new nonce for every page', async () => {
      const { port, token } = await started();

      const first = await request(port, { path: `/?t=${token}` });
      const second = await request(port, { path: `/?t=${token}` });

      expect(first.headers['content-security-policy']).not.toBe(second.headers['content-security-policy']);
    });
  });
});
