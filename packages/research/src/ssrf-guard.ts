import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Blocks the classic SSRF targets: loopback, link-local (including the
 * 169.254.169.254 cloud metadata endpoint), private RFC1918 ranges, and
 * unique-local/link-local IPv6. Applied to both the URL's literal host (if
 * it's already an IP) and every resolved address (DNS rebinding defense —
 * a hostname that resolves to a public IP at check time but a private one
 * at fetch time is still a real risk, so callers should re-resolve
 * immediately before connecting rather than caching this result).
 */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const IPV4_PRIVATE_RANGES: [number, number][] = [
  ipRange("10.0.0.0", "10.255.255.255"),
  ipRange("172.16.0.0", "172.31.255.255"),
  ipRange("192.168.0.0", "192.168.255.255"),
  ipRange("127.0.0.0", "127.255.255.255"), // loopback
  ipRange("169.254.0.0", "169.254.255.255"), // link-local, incl. cloud metadata
  ipRange("0.0.0.0", "0.255.255.255"),
  ipRange("100.64.0.0", "100.127.255.255"), // carrier-grade NAT
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return parts[0]! * 2 ** 24 + parts[1]! * 2 ** 16 + parts[2]! * 2 ** 8 + parts[3]!;
}

function ipRange(start: string, end: string): [number, number] {
  return [ipv4ToInt(start), ipv4ToInt(end)];
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return IPV4_PRIVATE_RANGES.some(([start, end]) => value >= start && value <= end);
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" || // loopback
    normalized.startsWith("fe80:") || // link-local
    normalized.startsWith("fc") || // unique local fc00::/7
    normalized.startsWith("fd") ||
    normalized.startsWith("::ffff:127.") // IPv4-mapped loopback
  );
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true; // not a recognizable IP — fail closed
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`Not a valid URL: ${rawUrl}`);
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeUrlError(`Protocol not allowed: ${url.protocol}`);
  }

  // WHATWG URL keeps the brackets around an IPv6 literal host
  // (`new URL("http://[::1]/").hostname === "[::1]"`), which node:net's
  // isIP() does not recognize — without stripping them, IPv6 literals
  // silently fall through to the DNS-lookup path below instead of being
  // caught by the direct-IP check.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new UnsafeUrlError(`Refusing to fetch a private/reserved IP address: ${hostname}`);
    }
    return url;
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UnsafeUrlError(`Refusing to fetch localhost: ${hostname}`);
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve host: ${hostname}`);
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError(`Host resolved to no addresses: ${hostname}`);
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new UnsafeUrlError(
        `Host resolves to a private/reserved IP address: ${hostname} -> ${address}`,
      );
    }
  }

  return url;
}
