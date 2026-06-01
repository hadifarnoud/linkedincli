import type { LinkedInAuth, LinkedInClient } from './types.js';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  AuthError,
  ChallengeError,
  ForbiddenError,
  LinkedInError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from './errors.js';

const VOYAGER_BASE = 'https://www.linkedin.com/voyager/api';
const LINKEDIN_BASE = 'https://www.linkedin.com';
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30_000;
const MIN_REQUEST_GAP_MS = 2_000;

/**
 * The minimal slice of `Response` the request loop uses. Both native `fetch`
 * and the curl transport satisfy this, so the rest of the code is transport-
 * agnostic.
 */
interface HttpResponse {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null; has(name: string): boolean };
  text(): Promise<string>;
}

let curlAvailable: boolean | null = null;
function hasCurl(): boolean {
  if (curlAvailable === null) {
    try {
      curlAvailable = spawnSync('curl', ['--version'], { stdio: 'ignore' }).status === 0;
    } catch {
      curlAvailable = false;
    }
  }
  return curlAvailable;
}

/**
 * Pick the HTTP transport. Node's `fetch` (undici) has a TLS/HTTP-2 fingerprint
 * that LinkedIn/Cloudflare flags as a bot, revoking the session. The system
 * `curl` binary is accepted, so prefer it when available. Override with
 * LINKEDIN_TRANSPORT=fetch|curl.
 */
function selectTransport(): 'curl' | 'fetch' {
  const t = (process.env.LINKEDIN_TRANSPORT ?? 'auto').toLowerCase();
  if (t === 'fetch') return 'fetch';
  if (t === 'curl') return 'curl';
  return hasCurl() ? 'curl' : 'fetch';
}

function parseHeaderBlock(headerText: string): { status: number; headers: Map<string, string> } {
  const lines = headerText.split(/\r?\n/);
  const statusLine = lines.shift() ?? '';
  const status = Number(statusLine.split(/\s+/)[1]) || 0;
  const headers = new Map<string, string>();
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    if (!name) continue;
    const value = line.slice(idx + 1).trim();
    const existing = headers.get(name);
    headers.set(name, existing ? `${existing}, ${value}` : value);
  }
  return { status, headers };
}

/** Issue a request via the system `curl` binary, returning an HttpResponse. */
async function curlFetch(
  url: string,
  opts: { method: string; headers: Record<string, string>; body?: string },
): Promise<HttpResponse> {
  const args = [
    '-sS',
    '-i', // include response headers in stdout
    '--compressed',
    '--max-time',
    String(Math.ceil(TIMEOUT_MS / 1000)),
    '-X',
    opts.method,
    url,
    '-H',
    'Expect:', // disable 100-continue so there's a single header block
  ];
  for (const [key, value] of Object.entries(opts.headers)) {
    args.push('-H', `${key}: ${value}`);
  }
  if (opts.body !== undefined) args.push('--data-binary', '@-');

  const child = spawn('curl', args);
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  child.stdout.on('data', (d: Buffer) => out.push(d));
  child.stderr.on('data', (d: Buffer) => err.push(d));
  child.stdin.end(opts.body ?? '');

  const [code] = (await once(child, 'close')) as [number];
  if (code !== 0) {
    const detail = Buffer.concat(err).toString().trim();
    // Plain Error → the retry loop treats it as a transient network failure.
    throw new Error(`curl transport error (exit ${code})${detail ? `: ${detail}` : ''}`);
  }

  const raw = Buffer.concat(out);
  let sep = raw.indexOf('\r\n\r\n');
  let sepLen = 4;
  if (sep === -1) {
    sep = raw.indexOf('\n\n');
    sepLen = 2;
  }
  const headerText = (sep === -1 ? raw : raw.subarray(0, sep)).toString('utf8');
  const bodyBuf = sep === -1 ? Buffer.alloc(0) : raw.subarray(sep + sepLen);
  const { status, headers } = parseHeaderBlock(headerText);

  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => headers.get(name.toLowerCase()) ?? null,
      has: (name) => headers.has(name.toLowerCase()),
    },
    text: async () => bodyBuf.toString('utf8'),
  };
}

/** Human-like delay to avoid rate limits (2-5s) */
function randomDelay(): Promise<void> {
  const ms = 2000 + Math.random() * 3000;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Node's `fetch` throws a generic `TypeError: fetch failed` for any transport-level
 * failure, hiding the real reason in `error.cause`. Unwrap it into a useful message.
 */
function describeNetworkError(error: TypeError, url: string): string {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();

  const cause = (error as { cause?: unknown }).cause;
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code: unknown }).code)
      : undefined;
  const detail =
    cause instanceof Error ? cause.message : cause !== undefined ? String(cause) : undefined;

  const hints: Record<string, string> = {
    ENOTFOUND: `DNS lookup for ${host} failed — check your internet connection or DNS.`,
    EAI_AGAIN: `DNS lookup for ${host} timed out — check your internet connection or DNS.`,
    ECONNREFUSED: `Connection to ${host} was refused — a proxy/firewall may be blocking it.`,
    ECONNRESET: `Connection to ${host} was reset — likely a proxy, firewall, or flaky network.`,
    ETIMEDOUT: `Connection to ${host} timed out — check your network or proxy settings.`,
    UND_ERR_REQ_RETRY: `Too many redirects from ${host} — session is likely invalid. Run: linkedin login`,
    CERT_HAS_EXPIRED: `TLS certificate error talking to ${host} — check system clock / proxy CA.`,
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: `TLS verification failed for ${host} — a proxy may be intercepting HTTPS.`,
    DEPTH_ZERO_SELF_SIGNED_CERT: `TLS verification failed for ${host} — a proxy may be intercepting HTTPS.`,
  };

  const redirectLoop = /redirect count exceeded|too many redirects/i.test(detail ?? '');
  const friendly =
    (code && hints[code]) ||
    (redirectLoop
      ? `Too many redirects from ${host} — session is likely invalid. Run: linkedin login`
      : `Could not reach ${host} (no HTTP response was received).`);
  const suffix = [code, detail].filter(Boolean).join(': ');
  return suffix ? `${friendly} [${suffix}]` : friendly;
}

/** Extract a single cookie value from a full Cookie header string. */
export function extractCookieValue(cookieHeader: string, name: string): string | undefined {
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]+)`),
  );
  return match ? match[1].trim() : undefined;
}

/** Generate a random tracking ID (16 random bytes, base64) */
export function generateTrackingId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64');
}

export function createClient(auth: LinkedInAuth): LinkedInClient {
  // Prefer the full browser cookie jar when available. A bare `li_at` +
  // `JSESSIONID` request looks like a stolen-token replay to LinkedIn, which
  // responds by revoking the session (clear-site-data) — logging the user out
  // everywhere. Sending the complete cookie string avoids that.
  const fullCookie = auth.cookie?.trim();
  const jsessionid =
    auth.jsessionid?.replace(/"/g, '') ||
    (fullCookie ? extractCookieValue(fullCookie, 'JSESSIONID')?.replace(/"/g, '') : undefined) ||
    '';
  const csrfToken = jsessionid;
  const cookieHeader = fullCookie || `JSESSIONID="${csrfToken}"; li_at=${auth.liAt}`;

  // Defaults — used when no captured browser headers are available.
  const defaultHeaders: Record<string, string> = {
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    accept: 'application/vnd.linkedin.normalized+json+2.1',
    'accept-language': 'en-US,en;q=0.9',
    'x-li-lang': 'en_US',
    'x-restli-protocol-version': '2.0.0',
    'x-li-track': JSON.stringify({
      clientVersion: '1.13.21',
      osName: 'web',
      timezoneOffset: new Date().getTimezoneOffset() / -60,
      deviceFormFactor: 'DESKTOP',
      mpName: 'voyager-web',
    }),
  };

  // Replay captured browser headers (user-agent, x-li-track, sec-ch-ua,
  // x-li-page-instance, ...) so the request fingerprint matches the browser.
  // These headers must never be replayed — fetch/undici manages them, or we set
  // them per-request, or they'd corrupt the request.
  const DENY = new Set([
    'cookie',
    'content-length',
    'content-type',
    'host',
    'connection',
    'accept-encoding',
    'origin',
  ]);
  const replayHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(auth.headers ?? {})) {
    const lower = key.toLowerCase();
    if (lower.startsWith(':') || DENY.has(lower)) continue;
    replayHeaders[lower] = value;
  }

  const baseHeaders: Record<string, string> = {
    ...defaultHeaders,
    ...replayHeaders,
    // Always force the managed cookie + CSRF, regardless of what was captured.
    'csrf-token': csrfToken,
    cookie: cookieHeader,
  };

  let lastRequestTime = 0;
  const transport = selectTransport();

  async function request<T = unknown>(options: {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    baseRequest?: boolean;
  }): Promise<T> {
    // Rate limit: ensure minimum gap between requests
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_REQUEST_GAP_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_GAP_MS - elapsed));
    }

    const base = options.baseRequest ? LINKEDIN_BASE : VOYAGER_BASE;
    let url = `${base}${options.path}`;

    if (options.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = { ...baseHeaders };
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json; charset=UTF-8';
      headers['origin'] = LINKEDIN_BASE;
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // Use human-like random delay between retries instead of fixed backoff
        await randomDelay();
      }

      try {
        const bodyString = options.body !== undefined ? JSON.stringify(options.body) : undefined;
        let response: HttpResponse;

        if (transport === 'curl') {
          // curl does not follow redirects without -L, matching our manual policy.
          response = await curlFetch(url, { method: options.method, headers, body: bodyString });
        } else {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
          try {
            response = await fetch(url, {
              method: options.method,
              headers,
              body: bodyString,
              signal: controller.signal,
              // Don't auto-follow redirects: the Voyager API never legitimately
              // redirects. A 3xx means LinkedIn is bouncing us to the login/
              // authwall page — i.e. the session is invalid. Following it just
              // loops until undici throws an opaque "redirect count exceeded".
              redirect: 'manual',
            });
          } finally {
            clearTimeout(timeout);
          }
        }

        lastRequestTime = Date.now();

        // A redirect from an API call means the session was rejected.
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location') ?? '';
          const target = (() => {
            try {
              return location ? new URL(location, url).pathname : '';
            } catch {
              return location;
            }
          })();
          // LinkedIn signals an invalidated token by clearing site data and/or
          // expiring li_at via Set-Cookie (often while redirecting to the same
          // URL). This is distinct from a normal expiry and usually means the
          // cookie was rejected outright — e.g. replayed from a different IP.
          const setCookie = response.headers.get('set-cookie') ?? '';
          const tokenKilled =
            response.headers.has('clear-site-data') || /li_at=("?)delete/i.test(setCookie);
          const looksLikeLogin = /login|authwall|checkpoint|uas\/login/i.test(location);

          if (tokenKilled) {
            throw new AuthError(
              'LinkedIn rejected and invalidated your li_at token (it cleared the session). ' +
                'The cookie is expired, malformed, or was flagged — commonly because it was ' +
                'copied from a browser on a different IP/device. Re-copy li_at from a ' +
                'logged-in browser on this machine, then run: linkedin login',
            );
          }
          throw new AuthError(
            looksLikeLogin || !location
              ? 'Session expired or invalid — LinkedIn redirected to login. Run: linkedin login'
              : `Unexpected redirect to ${target} — session may be invalid. Run: linkedin login`,
          );
        }

        // LinkedIn can return 200 while simultaneously killing the session
        // (clear-site-data / Set-Cookie expiring li_at). This happens when the
        // request's header fingerprint is flagged as non-browser. Treat it as an
        // auth failure rather than silently "succeeding" once.
        const setCookieHdr = response.headers.get('set-cookie') ?? '';
        if (response.headers.has('clear-site-data') || /li_at=("?)delete/i.test(setCookieHdr)) {
          throw new AuthError(
            'LinkedIn accepted the cookies but revoked the session (it flagged the request as ' +
              'non-browser). This is a request-fingerprint issue, not a bad cookie.',
          );
        }

        // Check for challenge / restricted page (only on non-OK responses)
        const contentType = response.headers.get('content-type') ?? '';
        if (!response.ok && contentType.includes('text/html')) {
          throw new ChallengeError();
        }

        if (response.ok) {
          // Some endpoints return 201 with no body
          const text = await response.text();
          if (!text) return {} as T;
          try {
            return JSON.parse(text) as T;
          } catch {
            return text as unknown as T;
          }
        }

        const errorText = await response.text().catch(() => '');
        let errorMessage = `LinkedIn API error: ${response.status}`;
        try {
          const parsed = JSON.parse(errorText);
          errorMessage = parsed.message ?? parsed.errorMessage ?? errorMessage;
        } catch {
          if (errorText) errorMessage = errorText;
        }

        switch (response.status) {
          case 401:
            // Never retry auth errors — bail immediately
            throw new AuthError('Session expired or invalid. Run: linkedin login');
          case 403:
            throw new ForbiddenError(errorMessage);
          case 404:
            throw new NotFoundError(errorMessage);
          case 422:
            throw new ValidationError(errorMessage);
          case 429: {
            const retryAfter = Number(response.headers.get('retry-after')) || undefined;
            if (attempt < MAX_RETRIES) {
              lastError = new RateLimitError(errorMessage, retryAfter);
              continue;
            }
            throw new RateLimitError(errorMessage, retryAfter);
          }
          default:
            if (response.status >= 500 && attempt < MAX_RETRIES) {
              lastError = new ServerError(errorMessage, response.status);
              continue;
            }
            if (response.status >= 500) {
              throw new ServerError(errorMessage, response.status);
            }
            throw new LinkedInError(errorMessage, 'API_ERROR', response.status);
        }
      } catch (error) {
        // Non-retryable errors: bail immediately
        if (
          error instanceof LinkedInError &&
          !(error instanceof RateLimitError) &&
          !(error instanceof ServerError)
        ) {
          throw error;
        }
        if (error instanceof TypeError && error.message.includes('fetch')) {
          lastError = new LinkedInError(describeNetworkError(error, url), 'NETWORK_ERROR');
          if (attempt < MAX_RETRIES) continue;
          throw lastError;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          lastError = new LinkedInError(
            `Request timed out after ${TIMEOUT_MS / 1000}s (${options.method} ${options.path})`,
            'TIMEOUT',
          );
          // Don't retry write timeouts
          if (options.method !== 'GET' || attempt >= MAX_RETRIES) {
            throw lastError;
          }
          continue;
        }
        if (error instanceof Error && !(error instanceof LinkedInError)) {
          lastError = error;
          if (attempt < MAX_RETRIES) continue;
          throw lastError;
        }
        throw error;
      }
    }

    throw lastError ?? new LinkedInError('Request failed after retries', 'MAX_RETRIES');
  }

  return {
    request,
    get: <T = unknown>(path: string, query?: Record<string, any>) =>
      request<T>({ method: 'GET', path, query }),
    post: <T = unknown>(path: string, body?: unknown, query?: Record<string, any>) =>
      request<T>({ method: 'POST', path, query, body }),
    patch: <T = unknown>(path: string, body?: unknown) =>
      request<T>({ method: 'PATCH', path, body }),
    put: <T = unknown>(path: string, body?: unknown) =>
      request<T>({ method: 'PUT', path, body }),
    delete: <T = unknown>(path: string, query?: Record<string, any>) =>
      request<T>({ method: 'DELETE', path, query }),
  };
}
