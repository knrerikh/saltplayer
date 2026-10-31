import { describe, it, expect } from 'vitest';
import type { NetworkInterfaceInfo } from 'os';
import { localAddresses } from '@/main/remote-control/network';

const v4 = (address: string, internal = false): NetworkInterfaceInfo => ({
  address,
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:00',
  internal,
  cidr: `${address}/24`,
});

const v6 = (address: string): NetworkInterfaceInfo => ({
  address,
  netmask: 'ffff:ffff:ffff:ffff::',
  family: 'IPv6',
  mac: '00:00:00:00:00:00',
  internal: false,
  cidr: `${address}/64`,
  scopeid: 0,
});

describe('localAddresses (#64)', () => {
  it('keeps private IPv4 addresses of the three private ranges', () => {
    const addresses = localAddresses({
      en0: [v4('192.168.1.5'), v4('10.0.0.7'), v4('172.16.4.2'), v4('172.31.255.1')],
    });

    expect(addresses).toEqual(['192.168.1.5', '10.0.0.7', '172.16.4.2', '172.31.255.1']);
  });

  it('drops loopback, IPv6, link-local, public and almost-private addresses', () => {
    const addresses = localAddresses({
      lo0: [v4('127.0.0.1', true)],
      en0: [v6('fe80::1'), v4('169.254.10.1'), v4('8.8.8.8'), v4('172.32.0.1'), v4('172.15.0.1')],
      utun3: [v4('192.168.9.9', true)],
    });

    expect(addresses).toEqual([]);
  });

  it('lists Wi-Fi and Ethernet before virtual interfaces', () => {
    const addresses = localAddresses({
      docker0: [v4('172.17.0.1')],
      bridge100: [v4('192.168.64.1')],
      wlan0: [v4('192.168.1.20')],
      eth0: [v4('10.1.1.1')],
      en0: [v4('192.168.1.5')],
    });

    expect(addresses).toEqual(['192.168.1.20', '10.1.1.1', '192.168.1.5', '172.17.0.1', '192.168.64.1']);
  });

  it('ignores an interface without addresses', () => {
    expect(localAddresses({ en0: undefined })).toEqual([]);
  });
});
