import { describe, it, expect } from 'vitest';
import { splitCurlResponse, extractCookieValue } from './client.js';

const CRLF = '\r\n';

describe('splitCurlResponse', () => {
  it('parses a single header block + JSON body', () => {
    const raw = Buffer.from(
      `HTTP/2 200${CRLF}content-type: application/json${CRLF}${CRLF}{"ok":true}`,
    );
    const { headerText, body } = splitCurlResponse(raw);
    expect(headerText).toContain('HTTP/2 200');
    expect(body.toString()).toBe('{"ok":true}');
  });

  it('skips a proxy CONNECT block and keeps the real response', () => {
    const raw = Buffer.from(
      [
        `HTTP/1.1 200 Connection established${CRLF}${CRLF}`,
        `HTTP/2 401${CRLF}content-type: application/json${CRLF}${CRLF}`,
        `{"status":401}`,
      ].join(''),
    );
    const { headerText, body } = splitCurlResponse(raw);
    expect(headerText).toContain('401');
    expect(headerText).not.toContain('Connection established');
    expect(body.toString()).toBe('{"status":401}');
  });

  it('skips a 100 Continue block', () => {
    const raw = Buffer.from(
      `HTTP/1.1 100 Continue${CRLF}${CRLF}HTTP/2 201${CRLF}${CRLF}{"created":true}`,
    );
    const { headerText, body } = splitCurlResponse(raw);
    expect(headerText).toContain('201');
    expect(body.toString()).toBe('{"created":true}');
  });

  it('does not treat a JSON body as a header block', () => {
    const raw = Buffer.from(`HTTP/2 200${CRLF}${CRLF}{"note":"HTTP/2 is great"}`);
    const { body } = splitCurlResponse(raw);
    expect(body.toString()).toBe('{"note":"HTTP/2 is great"}');
  });

  it('handles an empty body (201/204)', () => {
    const raw = Buffer.from(`HTTP/2 204${CRLF}${CRLF}`);
    const { headerText, body } = splitCurlResponse(raw);
    expect(headerText).toContain('204');
    expect(body.length).toBe(0);
  });
});

describe('extractCookieValue (sanity)', () => {
  it('still works', () => {
    expect(extractCookieValue('li_at=A; JSESSIONID="ajax:1"', 'li_at')).toBe('A');
  });
});
