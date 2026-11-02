import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/** One `ALLOWED_TARGETS` entry: scheme, host (optionally `*.` wildcard) and port. */
export interface AllowRule {
  protocol: 'http:' | 'https:';
  /** Exact host, or a suffix starting with `.` for `*.example.com`. */
  host: string;
  wildcard: boolean;
  /** Effective port as a string ('' never: defaults are filled in). */
  port: string;
  source: string;
}

const DEFAULT_PORT = { 'http:': '80', 'https:': '443' } as const;

const bareHost = (hostname: string) => hostname.replace(/^\[|\]$/g, '').toLowerCase();

/**
 * Parses a comma-separated list of origins: `https://example.com`, `http://localhost:4000`,
 * `https://*.example.com` (any subdomain, not the apex). Paths are not allowed.
 */
export function parseAllowlist(value: string): AllowRule[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((source) => {
      const wildcard = /^https?:\/\/\*\./i.test(source);
      const url = new URL(wildcard ? source.replace('*.', 'wildcard-placeholder.') : source);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`"${source}" must be an http:// or https:// origin`);
      }
      if ((url.pathname && url.pathname !== '/') || url.search || url.hash || url.username) {
        throw new Error(`"${source}" must be an origin only (scheme://host[:port])`);
      }
      const protocol = url.protocol as AllowRule['protocol'];
      const host = bareHost(url.hostname);
      return {
        protocol,
        host: wildcard ? host.replace(/^wildcard-placeholder/, '') : host,
        wildcard,
        port: url.port || DEFAULT_PORT[protocol],
        source,
      };
    });
}

export function matchesAllowlist(url: URL, rules: readonly AllowRule[]): boolean {
  const host = bareHost(url.hostname);
  const port = url.port || DEFAULT_PORT[url.protocol as AllowRule['protocol']] || '';
  return rules.some(
    (r) =>
      r.protocol === url.protocol &&
      r.port === port &&
      (r.wildcard ? host.endsWith(r.host) && host.length > r.host.length : host === r.host),
  );
}

/** Loopback, private, link-local, CGNAT, multicast, documentation and other non-public ranges. */
const BLOCKED = (() => {
  const list = new BlockList();
  const v4: [string, number][] = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ];
  for (const [net, prefix] of v4) list.addSubnet(net, prefix, 'ipv4');
  const v6: [string, number][] = [
    ['::', 128],
    ['::1', 128],
    ['64:ff9b::', 96],
    ['64:ff9b:1::', 48],
    ['100::', 64],
    ['2001::', 23],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['fc00::', 7],
    ['fe80::', 10],
    ['fec0::', 10],
    ['ff00::', 8],
  ];
  for (const [net, prefix] of v6) list.addSubnet(net, prefix, 'ipv6');
  return list;
})();

/** IPv4-mapped / -compatible IPv6 (`::ffff:10.0.0.1`) -> the IPv4 address. */
function embeddedIpv4(address: string): string | undefined {
  const m = /^::(?:ffff:(?:0:)?)?(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (m) return m[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex) {
    const hi = parseInt(hex[1] as string, 16);
    const lo = parseInt(hex[2] as string, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return undefined;
}

/** True when the address is not a public unicast address. Unknown formats count as non-public. */
export function isNonPublicAddress(address: string): boolean {
  const a = bareHost(address);
  const family = isIP(a);
  if (family === 4) return BLOCKED.check(a, 'ipv4');
  if (family === 6) {
    const v4 = embeddedIpv4(a);
    if (v4) return BLOCKED.check(v4, 'ipv4');
    return BLOCKED.check(a, 'ipv6');
  }
  return true;
}

export type Lookup = (hostname: string) => Promise<string[]>;

export const systemLookup: Lookup = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((r) => r.address);

export interface TargetPolicy {
  allowlist: readonly AllowRule[];
  lookup?: Lookup;
}

export type TargetCheck = { ok: true } | { ok: false; reason: string };

/**
 * SSRF guard for one scan target:
 * - only http(s), no credentials in the URL;
 * - with an allowlist: the origin must be on it (and then private addresses are fine: the
 *   operator allowed them explicitly);
 * - otherwise the host must resolve only to public addresses (checked on the resolved IPs, not
 *   the name, so a public name pointing at 10.0.0.1 is refused).
 */
export async function checkTarget(target: string, policy: TargetPolicy): Promise<TargetCheck> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { ok: false, reason: 'is not a valid URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'must use http:// or https://' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'must not contain credentials' };
  }
  if (policy.allowlist.length) {
    return matchesAllowlist(url, policy.allowlist)
      ? { ok: true }
      : { ok: false, reason: 'is not in ALLOWED_TARGETS' };
  }
  const host = bareHost(url.hostname);
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await (policy.lookup ?? systemLookup)(host);
    } catch {
      return { ok: false, reason: 'host could not be resolved' };
    }
  }
  if (!addresses.length) return { ok: false, reason: 'host could not be resolved' };
  if (addresses.some(isNonPublicAddress)) {
    return {
      ok: false,
      reason:
        'resolves to a private, loopback or link-local address; list its origin in ALLOWED_TARGETS to allow it',
    };
  }
  return { ok: true };
}
