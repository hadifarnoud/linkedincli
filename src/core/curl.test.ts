import { describe, it, expect } from 'vitest';
import { parseCurlRequest, looksLikeCurl } from './curl.js';

const SAMPLE = `curl 'https://www.linkedin.com/voyager/api/me' \\
  -H 'accept: application/vnd.linkedin.normalized+json+2.1' \\
  -H 'csrf-token: ajax:123' \\
  -H 'user-agent: Mozilla/5.0 Chrome/131.0.0.0' \\
  -H 'x-li-track: {"clientVersion":"1.13.40","osName":"web"}' \\
  -H 'sec-ch-ua: "Chromium";v="131"' \\
  -b 'li_at=TOKEN; JSESSIONID="ajax:123"; bcookie="v=2"'`;

describe('parseCurlRequest', () => {
  it('extracts headers and skips the cookie header', () => {
    const { headers } = parseCurlRequest(SAMPLE);
    expect(headers['user-agent']).toBe('Mozilla/5.0 Chrome/131.0.0.0');
    expect(headers['x-li-track']).toBe('{"clientVersion":"1.13.40","osName":"web"}');
    expect(headers['sec-ch-ua']).toBe('"Chromium";v="131"');
    expect(headers['cookie']).toBeUndefined();
  });

  it('extracts the cookie jar from -b', () => {
    const { cookie } = parseCurlRequest(SAMPLE);
    expect(cookie).toBe('li_at=TOKEN; JSESSIONID="ajax:123"; bcookie="v=2"');
  });

  it('reads the cookie from a -H cookie header too', () => {
    const { cookie, headers } = parseCurlRequest(
      `curl 'x' -H 'cookie: li_at=A; JSESSIONID="ajax:1"' -H 'accept: x'`,
    );
    expect(cookie).toBe('li_at=A; JSESSIONID="ajax:1"');
    expect(headers['accept']).toBe('x');
  });

  it('ignores cookie file references', () => {
    const { cookie } = parseCurlRequest(`curl 'x' -b @cookies.txt`);
    expect(cookie).toBeUndefined();
  });

  it('returns empty for a plain cookie string', () => {
    const { headers, cookie } = parseCurlRequest('li_at=A; JSESSIONID="ajax:1"');
    expect(Object.keys(headers)).toHaveLength(0);
    expect(cookie).toBeUndefined();
  });
});

describe('looksLikeCurl', () => {
  it('detects curl commands and header flags', () => {
    expect(looksLikeCurl(SAMPLE)).toBe(true);
    expect(looksLikeCurl(`fetch -H 'accept: x'`)).toBe(true);
  });

  it('rejects a plain cookie string', () => {
    expect(looksLikeCurl('li_at=A; JSESSIONID="ajax:1"')).toBe(false);
  });
});
