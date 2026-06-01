import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractCookieValue } from './client.js';
import { resolveAuth } from './auth.js';

// resolveAuth reads the config file; stub it out so tests are hermetic.
vi.mock('./config.js', () => ({ loadConfig: async () => null }));

describe('extractCookieValue', () => {
  const jar =
    'bcookie="v=2&abc"; li_at=AQEDARxyz; JSESSIONID="ajax:1234567890"; lidc="b=VGST01"';

  it('pulls a plain value', () => {
    expect(extractCookieValue(jar, 'li_at')).toBe('AQEDARxyz');
  });

  it('pulls a quoted value verbatim', () => {
    expect(extractCookieValue(jar, 'JSESSIONID')).toBe('"ajax:1234567890"');
  });

  it('does not match a cookie that is a suffix of another name', () => {
    expect(extractCookieValue('li_at=real; xli_at=fake', 'li_at')).toBe('real');
  });

  it('returns undefined for a missing cookie', () => {
    expect(extractCookieValue(jar, 'nope')).toBeUndefined();
  });
});

describe('resolveAuth', () => {
  beforeEach(() => {
    delete process.env.LINKEDIN_COOKIE;
    delete process.env.LINKEDIN_LI_AT;
    delete process.env.LINKEDIN_JSESSIONID;
  });

  it('derives li_at + JSESSIONID from a full cookie string and keeps the jar', async () => {
    const cookie = 'bcookie="v=2"; li_at=TOKEN; JSESSIONID="ajax:99"; lidc="b=X"';
    const auth = await resolveAuth({ cookie });
    expect(auth.liAt).toBe('TOKEN');
    expect(auth.jsessionid).toBe('ajax:99');
    expect(auth.cookie).toBe(cookie);
  });

  it('reads the full cookie jar from LINKEDIN_COOKIE', async () => {
    process.env.LINKEDIN_COOKIE = 'li_at=ENVTOKEN; JSESSIONID="ajax:7"';
    const auth = await resolveAuth();
    expect(auth.liAt).toBe('ENVTOKEN');
    expect(auth.cookie).toContain('ENVTOKEN');
  });

  it('falls back to discrete li_at + JSESSIONID flags', async () => {
    const auth = await resolveAuth({ liAt: 'A', jsessionid: 'ajax:1' });
    expect(auth.liAt).toBe('A');
    expect(auth.cookie).toBeUndefined();
  });

  it('throws when nothing is provided', async () => {
    await expect(resolveAuth()).rejects.toThrow(/li_at/);
  });
});
