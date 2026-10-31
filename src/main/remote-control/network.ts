import { networkInterfaces, type NetworkInterfaceInfo } from 'os';

/** Wi-Fi and Ethernet; everything else (VPNs, bridges, containers) is rarely what a phone can reach. */
const PHYSICAL_INTERFACE = /^(en|eth|wl)/;

function isPrivateIPv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Private IPv4 addresses this machine can be reached at on the local network, Wi-Fi and Ethernet first. */
export function localAddresses(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string[] {
  const found = Object.entries(interfaces).flatMap(([name, infos]) =>
    (infos ?? [])
      .filter((info) => info.family === 'IPv4' && !info.internal && isPrivateIPv4(info.address))
      .map((info) => ({ address: info.address, physical: PHYSICAL_INTERFACE.test(name) })),
  );
  // Array#sort is stable, so each group keeps the interface order.
  return found.sort((a, b) => Number(b.physical) - Number(a.physical)).map(({ address }) => address);
}
