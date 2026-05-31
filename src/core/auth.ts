import { loadConfig } from './config.js';
import { extractCookieValue } from './client.js';
import { AuthError } from './errors.js';
import type { LinkedInAuth } from './types.js';

export async function resolveAuth(flags?: {
  liAt?: string;
  jsessionid?: string;
  cookie?: string;
}): Promise<LinkedInAuth> {
  // Priority: CLI flags > env vars > config file
  const config = await loadConfig();

  // Full cookie jar takes precedence — it's the only form LinkedIn reliably
  // accepts without revoking the session.
  const cookie = flags?.cookie ?? process.env.LINKEDIN_COOKIE ?? config?.cookie;

  if (cookie?.trim()) {
    const jsessionid =
      extractCookieValue(cookie, 'JSESSIONID')?.replace(/"/g, '') ??
      flags?.jsessionid ??
      process.env.LINKEDIN_JSESSIONID ??
      config?.jsessionid;
    const liAt =
      extractCookieValue(cookie, 'li_at') ??
      flags?.liAt ??
      process.env.LINKEDIN_LI_AT ??
      config?.li_at;

    if (!jsessionid) {
      throw new AuthError('Cookie string is missing JSESSIONID. Re-copy the full cookie header.');
    }
    if (!liAt) {
      throw new AuthError('Cookie string is missing li_at. Re-copy the full cookie header.');
    }
    return { liAt, jsessionid, cookie: cookie.trim() };
  }

  const liAt = flags?.liAt ?? process.env.LINKEDIN_LI_AT ?? config?.li_at;
  const jsessionid = flags?.jsessionid ?? process.env.LINKEDIN_JSESSIONID ?? config?.jsessionid;

  if (!liAt) {
    throw new AuthError(
      'No li_at cookie found. Set LINKEDIN_LI_AT, use --li-at, or run: linkedin login',
    );
  }

  if (!jsessionid) {
    throw new AuthError(
      'No JSESSIONID cookie found. Set LINKEDIN_JSESSIONID, use --jsessionid, or run: linkedin login',
    );
  }

  return { liAt, jsessionid };
}
