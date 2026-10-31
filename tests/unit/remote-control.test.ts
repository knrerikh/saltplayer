import { describe, it, expect, afterEach, vi } from 'vitest';
import * as net from 'net';
import { RemoteControl } from '@/main/remote-control/remote-control';

describe('RemoteControl (#64)', () => {
  const created: RemoteControl[] = [];

  function create(addresses: string[] = ['192.168.1.5', '10.0.0.7']) {
    const onStatus = vi.fn();
    const remote = new RemoteControl({ port: 0, onCommand: vi.fn(), onStatus, addresses: () => addresses });
    created.push(remote);
    return { remote, onStatus };
  }

  afterEach(async () => {
    await Promise.all(created.splice(0).map((remote) => remote.setEnabled(false)));
  });

  it('is off until enabled', () => {
    expect(create().remote.status).toEqual({ enabled: false, urls: [], qrDataUrl: null, port: null });
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

  it('turns off and issues a different link the next time', async () => {
    const { remote, onStatus } = create();
    const first = await remote.setEnabled(true);

    expect(await remote.setEnabled(false)).toEqual({ enabled: false, urls: [], qrDataUrl: null, port: null });
    const second = await remote.setEnabled(true);

    expect(second.urls[0]).not.toBe(first.urls[0]);
    expect(onStatus).toHaveBeenCalledTimes(3);
  });

  it('is enabled without a link or QR code when there is no local network', async () => {
    const status = await create([]).remote.setEnabled(true);

    expect(status).toMatchObject({ enabled: true, urls: [], qrDataUrl: null });
  });

  describe('overlapping calls', () => {
    const isListening = (port: number) =>
      new Promise<boolean>((resolve) => {
        const socket = net.connect(port, '127.0.0.1');
        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.once('error', () => resolve(false));
      });

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
