import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { RemoteControl, startRemoteAtLaunch } from '@/main/remote-control/remote-control';
import { RemoteTokenStore, TOKEN_LIFETIME_MS } from '@/main/remote-control/token-store';
import { REMOTE_DISABLED, type RemoteStatus } from '@/shared/remote';

const START = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const tokenOf = (url: string) => new URL(url).searchParams.get('t')!;

/** Node's http rather than fetch, like the server tests; reaches the server as localhost, which the Host check accepts. */
function reach(status: RemoteStatus, token: string, path = '/'): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: status.port!, path: `${path}?t=${token}`, agent: false, headers: { Host: `localhost:${status.port}` } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode!));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const isListening = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });

describe('RemoteControl (#64)', () => {
  const created: RemoteControl[] = [];
  let dir: string;
  let clock: number;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-control-test-'));
    clock = START;
  });

  function create(
    addresses: string[] = ['192.168.1.5', '10.0.0.7'],
    extra: Partial<ConstructorParameters<typeof RemoteControl>[0]> = {},
  ) {
    const onStatus = vi.fn();
    const remote = new RemoteControl({
      port: 0,
      onCommand: vi.fn(),
      onStatus,
      addresses: () => addresses,
      localName: () => null,
      tokens: new RemoteTokenStore(path.join(dir, 'remote-control.json'), () => clock),
      now: () => clock,
      ...extra,
    });
    created.push(remote);
    return { remote, onStatus };
  }

  afterEach(async () => {
    await Promise.all(created.splice(0).map((remote) => remote.setEnabled(false)));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is off until enabled', () => {
    expect(create().remote.status).toEqual(REMOTE_DISABLED);
  });

  it('offers a tokenised link for every local address, and a QR code of the first', async () => {
    const { remote, onStatus } = create();

    const status = await remote.setEnabled(true);

    expect(status.enabled).toBe(true);
    expect(status.urls).toHaveLength(2);
    expect(status.urls[0]).toMatch(new RegExp(`^http://192\\.168\\.1\\.5:${status.port}/\\?t=[A-Za-z0-9_-]{22}$`));
    expect(status.urls[1]).toContain('http://10.0.0.7:');
    expect(status.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(remote.status).toBe(status);
    expect(onStatus).toHaveBeenCalledWith(status);
  });

  it('keeps the same link when enabled twice', async () => {
    const { remote, onStatus } = create();
    const first = await remote.setEnabled(true);

    expect(await remote.setEnabled(true)).toBe(first);
    expect(onStatus).toHaveBeenCalledTimes(1);
  });

  it('turns off, and the same link works again when it is turned back on', async () => {
    const { remote, onStatus } = create();
    const first = await remote.setEnabled(true);

    expect(await remote.setEnabled(false)).toEqual(REMOTE_DISABLED);
    const second = await remote.setEnabled(true);

    expect(tokenOf(second.urls[0])).toBe(tokenOf(first.urls[0]));
    expect(onStatus).toHaveBeenCalledTimes(3);
  });

  it('keeps the link across an app restart: a new RemoteControl on the same store', async () => {
    const { remote: before } = create();
    const first = await before.setEnabled(true);
    await before.setEnabled(false);
    clock += 29 * DAY;

    const second = await create().remote.setEnabled(true);

    expect(tokenOf(second.urls[0])).toBe(tokenOf(first.urls[0]));
    expect(second.expiresAt).toBe(first.expiresAt);
  });

  it('issues a new link once the old one is 30 days old', async () => {
    const { remote: before } = create();
    const first = await before.setEnabled(true);
    await before.setEnabled(false);
    clock += TOKEN_LIFETIME_MS;

    const second = await create().remote.setEnabled(true);

    expect(tokenOf(second.urls[0])).not.toBe(tokenOf(first.urls[0]));
    expect(second.expiresAt).toBe(clock + TOKEN_LIFETIME_MS);
  });

  it('reports when the link expires', async () => {
    const status = await create().remote.setEnabled(true);

    expect(status.expiresAt).toBe(START + TOKEN_LIFETIME_MS);
  });

  it('stops honouring a link that expires while the remote stays on', async () => {
    const status = await create().remote.setEnabled(true);
    expect(await reach(status, tokenOf(status.urls[0]))).toBe(200);

    clock += TOKEN_LIFETIME_MS;

    expect(await reach(status, tokenOf(status.urls[0]))).toBe(401);
  });

  it('lists the .local link first, with the same token', async () => {
    const { remote } = create(['192.168.1.5'], { localName: () => 'Mac-Mini.local' });

    const status = await remote.setEnabled(true);

    expect(status.urls).toHaveLength(2);
    const token = tokenOf(status.urls[1]);
    expect(status.urls).toEqual([
      `http://Mac-Mini.local:${status.port}/?t=${token}`,
      `http://192.168.1.5:${status.port}/?t=${token}`,
    ]);
  });

  it('offers no .local link without a local network', async () => {
    const status = await create([], { localName: () => 'Mac-Mini.local' }).remote.setEnabled(true);

    expect(status.urls).toEqual([]);
  });

  it('says so when the usual port was busy', async () => {
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '0.0.0.0', resolve));
    const busyPort = (blocker.address() as net.AddressInfo).port;
    try {
      const busy = await create(['192.168.1.5'], { port: busyPort }).remote.setEnabled(true);
      const free = await create(['192.168.1.5'], { port: 0 }).remote.setEnabled(true);

      expect(busy.portChanged).toBe(true);
      expect(free.portChanged).toBe(false);
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  describe('resetLink()', () => {
    it('while on, switches to a new token and old links get 401', async () => {
      const { remote, onStatus } = create();
      const before = await remote.setEnabled(true);

      const after = await remote.resetLink();

      expect(after.enabled).toBe(true);
      expect(after.port).toBe(before.port);
      expect(tokenOf(after.urls[0])).not.toBe(tokenOf(before.urls[0]));
      expect(remote.status).toBe(after);
      expect(onStatus).toHaveBeenLastCalledWith(after);
      expect(await reach(after, tokenOf(before.urls[0]))).toBe(401);
      expect(await reach(after, tokenOf(after.urls[0]))).toBe(200);
    });

    it('restarts the clock', async () => {
      const { remote } = create();
      await remote.setEnabled(true);
      clock += 10 * DAY;

      const after = await remote.resetLink();

      expect(after.expiresAt).toBe(clock + TOKEN_LIFETIME_MS);
    });

    it('ends the open event streams', async () => {
      const { remote } = create();
      const status = await remote.setEnabled(true);
      const { ended } = await new Promise<{ ended: Promise<void> }>((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port: status.port!,
            path: `/api/events?t=${tokenOf(status.urls[0])}`,
            headers: { Host: `localhost:${status.port}` },
          },
          (res) => {
            res.resume();
            resolve({ ended: new Promise<void>((done) => res.on('end', done)) });
          },
        );
        req.on('error', reject);
        req.end();
      });

      await remote.resetLink();

      await ended;
    });

    it('while off, issues the new token for the next time and stays off', async () => {
      const { remote } = create();
      const first = await remote.setEnabled(true);
      await remote.setEnabled(false);

      expect(await remote.resetLink()).toEqual(REMOTE_DISABLED);
      const second = await remote.setEnabled(true);

      expect(tokenOf(second.urls[0])).not.toBe(tokenOf(first.urls[0]));
    });

    it('is serialised with turning on and off', async () => {
      const { remote } = create();

      const [on, reset, off] = await Promise.all([remote.setEnabled(true), remote.resetLink(), remote.setEnabled(false)]);

      expect(on.enabled).toBe(true);
      expect(reset.enabled).toBe(true);
      expect(tokenOf(reset.urls[0])).not.toBe(tokenOf(on.urls[0]));
      expect(off.enabled).toBe(false);
      expect(remote.status.enabled).toBe(false);
      expect(await isListening(on.port!)).toBe(false);
    });
  });

  it('is enabled without a link or QR code when there is no local network', async () => {
    const status = await create([]).remote.setEnabled(true);

    expect(status).toMatchObject({ enabled: true, urls: [], qrDataUrl: null });
  });

  describe('overlapping calls', () => {
    it('two setEnabled(true) start one server with one link', async () => {
      const { remote, onStatus } = create();

      const [first, second] = await Promise.all([remote.setEnabled(true), remote.setEnabled(true)]);

      expect(second).toBe(first);
      expect(onStatus).toHaveBeenCalledTimes(1);
      expect(await isListening(first.port!)).toBe(true);
    });

    it('on and off issued together end off with the port closed', async () => {
      const { remote } = create();

      const [on, off] = await Promise.all([remote.setEnabled(true), remote.setEnabled(false)]);

      expect(off.enabled).toBe(false);
      expect(remote.status.enabled).toBe(false);
      expect(await isListening(on.port!)).toBe(false);
    });
  });
});

describe('startRemoteAtLaunch (#74)', () => {
  it('turns the remote on when the setting is on', async () => {
    const target = { setEnabled: vi.fn().mockResolvedValue(undefined) };

    await startRemoteAtLaunch(target, { remoteAtLaunch: true });

    expect(target.setEnabled).toHaveBeenCalledWith(true);
  });

  it('leaves it off when the setting is off', async () => {
    const target = { setEnabled: vi.fn().mockResolvedValue(undefined) };

    await startRemoteAtLaunch(target, { remoteAtLaunch: false });

    expect(target.setEnabled).not.toHaveBeenCalled();
  });

  it('logs a failure instead of throwing, so the app still opens', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const target = { setEnabled: vi.fn().mockRejectedValue(new Error('listen EACCES')) };

    await expect(startRemoteAtLaunch(target, { remoteAtLaunch: true })).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
