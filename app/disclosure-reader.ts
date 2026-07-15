import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { analyzeDisclosureContent } from "./disclosure-analysis.ts";
import type { DisclosureAnalysisFailure, DisclosureAnalysisSuccess } from "./disclosure-types";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type DisclosureDnsResolver = {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
};

export type DisclosureReaderOptions = {
  fetchImpl?: FetchLike;
  resolver?: DisclosureDnsResolver;
  now?: () => string;
  maxBytes?: number;
  maxRedirects?: number;
  requestTimeoutMs?: number;
  totalTimeoutMs?: number;
  dnsTimeoutMs?: number;
};

const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_REDIRECTS = 4;
const DEFAULT_REQUEST_TIMEOUT_MS = 7000;
const DEFAULT_TOTAL_TIMEOUT_MS = 15000;
const DEFAULT_DNS_TIMEOUT_MS = 3000;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const blockedHostnames = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "instance-data.ec2.internal",
  "metadata.azure.internal",
]);
const blockedHostnameSuffixes = [".localhost", ".local", ".localdomain", ".internal", ".home", ".lan", ".svc", ".test", ".example", ".invalid", ".onion", ".arpa"];

export class DisclosureReaderError extends Error {
  code: string;
  kind: "blocked" | "error";
  httpStatus: number;

  constructor(code: string, message: string, kind: "blocked" | "error" = "error", httpStatus = 502) {
    super(message);
    this.name = "DisclosureReaderError";
    this.code = code;
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

const defaultResolver: DisclosureDnsResolver = {
  resolve4: (hostname) => resolve4(hostname),
  resolve6: (hostname) => resolve6(hostname),
};

function stripIpv6Brackets(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function ipv4Number(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function inIpv4Range(value: number, base: string, prefix: number) {
  const baseValue = ipv4Number(base);
  if (baseValue === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

function ipv6Number(address: string): bigint | null {
  let source = address.toLowerCase().split("%")[0];
  const ipv4Match = source.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Match) {
    const ipv4 = ipv4Number(ipv4Match[1]);
    if (ipv4 === null) return null;
    source = source.slice(0, -ipv4Match[1].length) + `${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const halves = source.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = [...left, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.reduce((result, part) => (result << BigInt(16)) + BigInt(`0x${part}`), BigInt(0));
}

function inIpv6Range(value: bigint, base: string, prefix: number) {
  const baseValue = ipv6Number(base);
  if (baseValue === null) return false;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (baseValue >> shift);
}

export function isPublicDestinationAddress(address: string) {
  const normalized = stripIpv6Brackets(address);
  const version = isIP(normalized);
  if (version === 4) {
    const value = ipv4Number(normalized);
    if (value === null) return false;
    const blockedRanges: Array<[string, number]> = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
      ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
      ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !blockedRanges.some(([base, prefix]) => inIpv4Range(value, base, prefix));
  }
  if (version === 6) {
    const value = ipv6Number(normalized);
    if (value === null || !inIpv6Range(value, "2000::", 3)) return false;
    const blockedRanges: Array<[string, number]> = [
      ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
    ];
    return !blockedRanges.some(([base, prefix]) => inIpv6Range(value, base, prefix));
  }
  return false;
}

function sanitizedOriginalUrl(value: string) {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function originalDomain(value: string) {
  try {
    return stripIpv6Brackets(new URL(value).hostname);
  } catch {
    return "";
  }
}

export function validateDisclosureUrl(value: string) {
  if (!value || value.length > 2048) {
    throw new DisclosureReaderError("invalid_url", "Enter a valid disclosure URL no longer than 2,048 characters.", "blocked", 400);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DisclosureReaderError("invalid_url", "The disclosure destination is not a valid URL.", "blocked", 400);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new DisclosureReaderError("unsupported_protocol", "Only HTTP and HTTPS disclosure destinations are supported.", "blocked", 400);
  }
  if (parsed.username || parsed.password) {
    throw new DisclosureReaderError("embedded_credentials", "Disclosure URLs containing embedded credentials are blocked.", "blocked", 400);
  }
  if ((parsed.protocol === "https:" && parsed.port && parsed.port !== "443") || (parsed.protocol === "http:" && parsed.port && parsed.port !== "80")) {
    throw new DisclosureReaderError("blocked_port", "Disclosure URLs using non-standard network ports are blocked.", "blocked", 400);
  }
  const rawHostname = stripIpv6Brackets(parsed.hostname.toLowerCase());
  if (rawHostname.endsWith("..")) {
    throw new DisclosureReaderError("invalid_hostname", "The disclosure hostname contains invalid trailing-dot normalization.", "blocked", 400);
  }
  const hostname = rawHostname.endsWith(".") ? rawHostname.slice(0, -1) : rawHostname;
  const hostnameLabels = hostname.split(".");
  if (
    !hostname ||
    blockedHostnames.has(hostname) ||
    blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix)) ||
    (isIP(hostname) === 0 && (
      !hostname.includes(".") ||
      hostname.length > 253 ||
      hostnameLabels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    ))
  ) {
    throw new DisclosureReaderError("blocked_hostname", "That disclosure hostname is local, reserved, or unsupported.", "blocked", 400);
  }
  if (isIP(hostname) && !isPublicDestinationAddress(hostname)) {
    throw new DisclosureReaderError("blocked_address", "That disclosure destination uses a private, local, reserved, or metadata address.", "blocked", 400);
  }
  parsed.hostname = isIP(hostname) === 6 ? `[${hostname}]` : hostname;
  parsed.hash = "";
  return parsed;
}

async function withTimeout<T>(operation: Promise<T>, milliseconds: number, code: string, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new DisclosureReaderError(code, message, "error", 504)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function validateResolvedDestination(url: URL, resolver: DisclosureDnsResolver, dnsTimeoutMs: number) {
  const hostname = stripIpv6Brackets(url.hostname);
  if (isIP(hostname)) {
    if (!isPublicDestinationAddress(hostname)) {
      throw new DisclosureReaderError("blocked_address", "That disclosure destination uses a private, local, reserved, or metadata address.", "blocked", 400);
    }
    return [hostname];
  }

  const resolutions = await withTimeout(
    Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]),
    dnsTimeoutMs,
    "dns_timeout",
    "The disclosure hostname lookup timed out.",
  );
  const addresses = resolutions.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  if (!addresses.length) {
    throw new DisclosureReaderError("dns_failure", "The disclosure hostname could not be resolved.", "error", 502);
  }
  if (addresses.some((address) => !isPublicDestinationAddress(address))) {
    throw new DisclosureReaderError("blocked_address", "The disclosure hostname resolves to a private, local, reserved, or metadata address.", "blocked", 400);
  }
  return addresses;
}

function supportedContentType(value: string) {
  const type = value.split(";", 1)[0].trim().toLowerCase();
  const supported = type === "text/html" || type === "application/xhtml+xml" || type === "text/plain" || type === "application/json" || type === "application/ld+json" || /^application\/[a-z0-9.+-]+\+json$/.test(type);
  return supported ? type : "";
}

async function readBoundedBody(response: Response, maxBytes: number, timeoutMs: number) {
  const statedLength = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(statedLength) && statedLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new DisclosureReaderError("oversized_response", `The disclosure page exceeded the ${Math.round(maxBytes / 1024)} KB response limit.`, "error", 413);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const readOperation = (async () => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new DisclosureReaderError("oversized_response", `The disclosure page exceeded the ${Math.round(maxBytes / 1024)} KB response limit.`, "error", 413);
      }
      chunks.push(value);
    }
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return combined;
  })();
  try {
    return await Promise.race([
      readOperation,
      new Promise<Uint8Array>((_, reject) => {
        timer = setTimeout(() => {
          void reader.cancel().catch(() => undefined);
          reject(new DisclosureReaderError("response_timeout", "Reading the disclosure page timed out.", "error", 504));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function startsWithBytes(value: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => value[index] === byte);
}

function decodeSupportedBody(bytes: Uint8Array, contentType: string) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  let signatureOffset = 0;
  while (signatureOffset < sample.length && [0x09, 0x0a, 0x0d, 0x20].includes(sample[signatureOffset])) signatureOffset += 1;
  const signatureSample = sample.subarray(signatureOffset);
  const binarySignatures = [
    [0x25, 0x50, 0x44, 0x46, 0x2d],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    [0xff, 0xd8, 0xff],
    [0x47, 0x49, 0x46, 0x38],
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
    [0x50, 0x4b, 0x07, 0x08],
    [0x1f, 0x8b],
    [0x7f, 0x45, 0x4c, 0x46],
    [0x4d, 0x5a],
    [0x42, 0x4d],
    [0x49, 0x49, 0x2a, 0x00],
    [0x4d, 0x4d, 0x00, 0x2a],
    [0x52, 0x49, 0x46, 0x46],
  ];
  const controlBytes = [...sample].filter((byte) => byte === 0 || (byte < 0x09 || (byte > 0x0d && byte < 0x20))).length;
  const looksBinary = binarySignatures.some((signature) => startsWithBytes(signatureSample, signature)) || controlBytes > Math.max(4, sample.length * 0.02);
  if (looksBinary) {
    throw new DisclosureReaderError("misleading_content_type", "The disclosure destination returned binary content under a supported text content type.", "error", 415);
  }

  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const trimmed = decoded.replace(/^\uFEFF/, "").trimStart();
  if ((contentType === "text/html" || contentType === "application/xhtml+xml") && trimmed && !trimmed.startsWith("<")) {
    throw new DisclosureReaderError("misleading_content_type", "The disclosure destination labeled non-HTML content as HTML.", "error", 415);
  }
  if (contentType.includes("json")) {
    if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
      throw new DisclosureReaderError("misleading_content_type", "The disclosure destination labeled non-JSON content as JSON.", "error", 415);
    }
    try {
      JSON.parse(trimmed);
    } catch {
      throw new DisclosureReaderError("malformed_json", "The disclosure destination returned malformed JSON.", "error", 422);
    }
  }
  return decoded;
}

async function discardResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // A response being rejected must stay rejected even if stream cancellation fails.
  }
}

async function fetchWithTimeout(fetchImpl: FetchLike, url: URL, timeoutMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetchImpl(url.toString(), {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        referrer: "",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: {
          Accept: "text/html, application/xhtml+xml, text/plain, application/json;q=0.9, application/ld+json;q=0.9",
          "User-Agent": "FoodMonocle/0.5 disclosure reader",
        },
      }),
      new Promise<Response>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new DisclosureReaderError("request_timeout", "The disclosure page request timed out.", "error", 504));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof DisclosureReaderError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new DisclosureReaderError("request_timeout", "The disclosure page request timed out.", "error", 504);
    }
    throw new DisclosureReaderError("network_error", "The disclosure page could not be reached.", "error", 502);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sameAddressSet(before: string[], after: string[]) {
  const normalizedBefore = [...new Set(before.map((address) => address.toLowerCase()))].sort();
  const normalizedAfter = [...new Set(after.map((address) => address.toLowerCase()))].sort();
  return normalizedBefore.length === normalizedAfter.length && normalizedBefore.every((address, index) => address === normalizedAfter[index]);
}

function remainingTime(startedAt: number, totalTimeoutMs: number) {
  const remaining = totalTimeoutMs - (Date.now() - startedAt);
  if (remaining <= 0) {
    throw new DisclosureReaderError("total_timeout", "Disclosure retrieval exceeded the total time limit.", "error", 504);
  }
  return remaining;
}

export async function analyzeDisclosureUrl(
  value: string,
  packageText = "",
  options: DisclosureReaderOptions = {},
): Promise<DisclosureAnalysisSuccess> {
  const fetchImpl = options.fetchImpl || fetch;
  const resolver = options.resolver || defaultResolver;
  const maxBytes = Math.min(Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES), DEFAULT_MAX_BYTES);
  const maxRedirects = Math.min(Math.max(0, options.maxRedirects ?? DEFAULT_MAX_REDIRECTS), DEFAULT_MAX_REDIRECTS);
  const requestTimeoutMs = Math.min(Math.max(1, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS), DEFAULT_REQUEST_TIMEOUT_MS);
  const totalTimeoutMs = Math.min(Math.max(1, options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS), DEFAULT_TOTAL_TIMEOUT_MS);
  const dnsTimeoutMs = Math.min(Math.max(1, options.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS), DEFAULT_DNS_TIMEOUT_MS);
  const startedAt = Date.now();
  const original = validateDisclosureUrl(value);
  let current = original;
  const redirects: string[] = [];
  const visited = new Set([original.toString()]);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const addressesBeforeFetch = await validateResolvedDestination(current, resolver, Math.min(dnsTimeoutMs, remainingTime(startedAt, totalTimeoutMs)));
    const response = await fetchWithTimeout(fetchImpl, current, Math.min(requestTimeoutMs, remainingTime(startedAt, totalTimeoutMs)));
    let addressesAfterFetch: string[];
    try {
      addressesAfterFetch = await validateResolvedDestination(current, resolver, Math.min(dnsTimeoutMs, remainingTime(startedAt, totalTimeoutMs)));
    } catch (error) {
      await discardResponseBody(response);
      throw error;
    }
    // Cloudflare fetch does not expose connection-IP pinning. Stable, public pre/post
    // resolution narrows DNS TOCTOU risk but cannot guarantee complete rebinding prevention.
    if (!sameAddressSet(addressesBeforeFetch, addressesAfterFetch)) {
      await discardResponseBody(response);
      throw new DisclosureReaderError("dns_rebinding", "The disclosure hostname changed network destinations during retrieval, so the request was blocked.", "blocked", 400);
    }

    if (redirectStatuses.has(response.status)) {
      await discardResponseBody(response);
      if (redirectCount >= maxRedirects) {
        throw new DisclosureReaderError("too_many_redirects", `The disclosure page exceeded the ${maxRedirects}-redirect limit.`, "blocked", 400);
      }
      const location = response.headers.get("location");
      if (!location) throw new DisclosureReaderError("invalid_redirect", "The disclosure page returned a redirect without a destination.", "error", 502);
      let next: URL;
      try {
        next = validateDisclosureUrl(new URL(location, current).toString());
      } catch (error) {
        if (error instanceof DisclosureReaderError) {
          throw new DisclosureReaderError("unsafe_redirect", `A redirect was blocked: ${error.message}`, "blocked", 400);
        }
        throw error;
      }
      if (current.protocol === "https:" && next.protocol !== "https:") {
        throw new DisclosureReaderError("unsafe_redirect", "A redirect from HTTPS to unencrypted HTTP was blocked.", "blocked", 400);
      }
      if (visited.has(next.toString())) {
        throw new DisclosureReaderError("redirect_loop", "The disclosure destination entered a redirect loop.", "blocked", 400);
      }
      await validateResolvedDestination(next, resolver, Math.min(dnsTimeoutMs, remainingTime(startedAt, totalTimeoutMs)));
      visited.add(next.toString());
      redirects.push(next.toString());
      current = next;
      continue;
    }

    if (!response.ok) {
      await discardResponseBody(response);
      throw new DisclosureReaderError("http_error", `The disclosure destination returned HTTP ${response.status}.`, "error", 502);
    }
    const contentType = supportedContentType(response.headers.get("content-type") || "");
    if (!contentType) {
      await discardResponseBody(response);
      throw new DisclosureReaderError("unsupported_content_type", "The disclosure destination did not return supported HTML, plain text, or JSON content.", "error", 415);
    }
    const bodyTimeoutMs = Math.min(requestTimeoutMs, remainingTime(startedAt, totalTimeoutMs));
    const body = decodeSupportedBody(await readBoundedBody(response, maxBytes, bodyTimeoutMs), contentType);
    return analyzeDisclosureContent({
      body,
      contentType,
      originalUrl: original.toString(),
      finalUrl: current.toString(),
      redirects,
      retrievedAt: (options.now || (() => new Date().toISOString()))(),
      packageText: packageText.slice(0, 5000),
    });
  }

  throw new DisclosureReaderError("too_many_redirects", `The disclosure page exceeded the ${maxRedirects}-redirect limit.`, "blocked", 400);
}

export function disclosureFailure(error: unknown, original: string, now: () => string = () => new Date().toISOString()): DisclosureAnalysisFailure {
  const known = error instanceof DisclosureReaderError ? error : new DisclosureReaderError("network_error", "The disclosure page could not be analyzed.");
  return {
    status: known.kind,
    classification: "Inaccessible or unsupported destination",
    code: known.code,
    message: known.message,
    originalUrl: sanitizedOriginalUrl(original),
    originalDomain: originalDomain(original),
    retrievedAt: now(),
  };
}
