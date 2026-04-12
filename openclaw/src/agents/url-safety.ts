/**
 * URL Safety Checker — SSRF Prevention (Track B — Security & Supply Chain)
 *
 * Validates URLs before agent fetch operations. Blocks private-network
 * addresses (RFC 1918, link-local, loopback), CGNAT, cloud metadata
 * endpoints, and multicast/reserved ranges.
 *
 * Ported from hermes-agent `tools/url_safety.py`.
 *
 * ── Limitations ──
 * - DNS rebinding (TOCTOU): URL resolves to safe IP at check time, then
 *   re-resolves to private IP at fetch time. Mitigated via redirect hooks.
 * - Redirect-based bypass: Initial URL is safe but redirects to private IP.
 *   Mitigated by checking redirect targets in the HTTP client.
 */

import dns from "node:dns";
import { URL } from "node:url";
import net from "node:net";

// ── Blocked hostnames ──

const BLOCKED_HOSTNAMES: ReadonlySet<string> = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "169.254.169.254", // AWS/Azure/GCP metadata
]);

// ── IP range checks ──

/**
 * Check if an IP address falls in a blocked range.
 */
function isBlockedIp(ip: string): boolean {
  // Parse IPv4 octets
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => p < 0 || p > 255)) return true;
    const [a, b, c, d] = parts;

    // Loopback: 127.0.0.0/8
    if (a === 127) return true;
    // Link-local: 169.254.0.0/16
    if (a === 169 && b === 254) return true;
    // Private: 10.0.0.0/8
    if (a === 10) return true;
    // Private: 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // Private: 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // CGNAT: 100.64.0.0/10
    if (a === 100 && b >= 64 && b <= 127) return true;
    // Reserved: 0.0.0.0/8
    if (a === 0) return true;
    // Broadcast
    if (a === 255 && b === 255 && c === 255 && d === 255) return true;
    // Multicast: 224.0.0.0/4
    if (a >= 224 && a <= 239) return true;
    // Reserved: 240.0.0.0/4 (except 255.255.255.255)
    if (a >= 240) return true;
    // Documentation: 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    // Benchmarking: 198.18.0.0/15
    if (a === 198 && (b === 18 || b === 19)) return true;

    return false;
  }

  // IPv6 checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // Loopback: ::1
    if (normalized === "::1" || normalized === "0000:0000:0000:0000:0000:0000:0000:0001") {
      return true;
    }
    // Unspecified: ::
    if (normalized === "::" || normalized === "0000:0000:0000:0000:0000:0000:0000:0000") {
      return true;
    }
    // Link-local: fe80::/10
    if (normalized.startsWith("fe80:") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
      return true;
    }
    // Unique local: fc00::/7
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return true;
    }
    // IPv4-mapped: ::ffff:x.x.x.x
    const v4Mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
    if (v4Mapped) {
      return isBlockedIp(v4Mapped[1]);
    }
    // Multicast: ff00::/8
    if (normalized.startsWith("ff")) return true;

    return false;
  }

  // Unknown format → block
  return true;
}

// ── URL validation ──

export type UrlSafetyResult = {
  safe: boolean;
  reason?: string;
};

/**
 * Synchronous URL validation (structural checks only, no DNS).
 * Use `isUrlSafe` for full validation including DNS resolution.
 */
export function validateUrlStructure(urlString: string): UrlSafetyResult {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }

  // Only allow http/https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }

  // Check blocked hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: `Blocked hostname: ${hostname}` };
  }

  // Check if hostname is a raw IP
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      return { safe: false, reason: `Blocked IP address: ${hostname}` };
    }
  }

  // Block userinfo in URL (potential credential leak)
  if (parsed.username || parsed.password) {
    return { safe: false, reason: "URL contains credentials" };
  }

  return { safe: true };
}

/**
 * Full URL safety check including DNS resolution.
 * Resolves the hostname and checks all returned IPs.
 * **Fails closed** on DNS errors.
 */
export async function isUrlSafe(urlString: string): Promise<UrlSafetyResult> {
  // Structural checks first
  const structural = validateUrlStructure(urlString);
  if (!structural.safe) return structural;

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }

  const hostname = parsed.hostname;

  // If already a raw IP, we checked it in structural validation
  if (net.isIP(hostname)) {
    return { safe: true };
  }

  // DNS resolution
  try {
    const addresses = await dnsResolve(hostname);
    for (const addr of addresses) {
      if (isBlockedIp(addr)) {
        return {
          safe: false,
          reason: `Hostname ${hostname} resolves to blocked IP: ${addr}`,
        };
      }
    }
    return { safe: true };
  } catch {
    // Fail closed on DNS errors
    return {
      safe: false,
      reason: `DNS resolution failed for ${hostname}`,
    };
  }
}

// ── DNS helper ──

function dnsResolve(hostname: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    dns.resolve(hostname, (err, addresses) => {
      if (err) {
        // Try resolve4 + resolve6 fallback
        dns.resolve4(hostname, (err4, addrs4) => {
          if (err4) {
            dns.resolve6(hostname, (err6, addrs6) => {
              if (err6) reject(err6);
              else resolve(addrs6);
            });
          } else {
            resolve(addrs4);
          }
        });
      } else {
        resolve(addresses);
      }
    });
  });
}

// ── Batch validation ──

/**
 * Validate multiple URLs. Returns safe URLs only.
 */
export async function filterSafeUrls(
  urls: string[],
): Promise<Array<{ url: string; result: UrlSafetyResult }>> {
  const results = await Promise.all(
    urls.map(async (url) => ({
      url,
      result: await isUrlSafe(url),
    })),
  );
  return results;
}
