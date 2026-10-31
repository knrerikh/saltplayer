import { hostname as osHostname, networkInterfaces, type NetworkInterfaceInfo } from 'os';

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

/** One DNS label as the machine's name: letters, digits and inner hyphens. */
const HOST_LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/**
 * The name other devices on the network can resolve this machine by (Bonjour / mDNS),
 * `<hostname>.local`, or null when the hostname is not a plain label ("Konstantin's MacBook").
 * Any domain part of the hostname is dropped.
 */
export function localHostName(hostname: string = osHostname()): string | null {
  const label = hostname.split('.')[0];
  return HOST_LABEL.test(label) ? `${label}.local` : null;
}
