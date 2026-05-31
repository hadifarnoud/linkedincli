/**
 * Minimal parser for a browser "Copy as cURL" command (or a bare cookie/header
 * blob). We only need the request headers and the cookie string — the URL,
 * method, and body are ignored because the CLI supplies its own.
 *
 * Handles the common shells' output: single- or double-quoted -H/--header and
 * -b/--cookie values, and `\`/`^` line continuations. It is intentionally
 * lenient: anything it can't parse is simply skipped.
 */
export interface ParsedCurl {
  headers: Record<string, string>;
  cookie?: string;
}

function stripContinuations(input: string): string {
  // Backslash (bash) or caret (cmd) line continuations, plus stray CRs.
  return input.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ');
}

export function parseCurlRequest(input: string): ParsedCurl {
  const text = stripContinuations(input);
  const headers: Record<string, string> = {};
  let cookie: string | undefined;

  const headerRe = /(?:-H|--header)\s+(['"])([\s\S]*?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(text)) !== null) {
    const raw = m[2];
    const idx = raw.indexOf(':');
    if (idx === -1) continue;
    const name = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (!name) continue;
    if (name.toLowerCase() === 'cookie') {
      cookie = value;
      continue;
    }
    headers[name] = value;
  }

  // -b / --cookie (ignore file references like -b @cookies.txt)
  const cookieRe = /(?:-b|--cookie)\s+(['"])([\s\S]*?)\1/g;
  let cm: RegExpExecArray | null;
  while ((cm = cookieRe.exec(text)) !== null) {
    if (!cm[2].startsWith('@')) cookie = cm[2];
  }

  return { headers, cookie };
}

/** Heuristic: does this pasted blob look like a cURL command rather than a raw cookie? */
export function looksLikeCurl(input: string): boolean {
  return /(^|\s)curl\b/.test(input) || /\s(?:-H|--header|-b|--cookie)\s/.test(input);
}
