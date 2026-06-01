import { Command } from 'commander';
import { saveConfig } from '../../core/config.js';
import { createClient, extractCookieValue } from '../../core/client.js';
import { parseCurlRequest, looksLikeCurl } from '../../core/curl.js';
import { output, outputError } from '../../core/output.js';
import type { GlobalOptions } from '../../core/types.js';

/** Read an entire readable stream (e.g. piped stdin) to a string. */
async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Store your LinkedIn session cookies for CLI use')
    .option(
      '--curl-file <path>',
      'Read a "Copy as cURL" (or cookie string) from a file — the robust way to pass the multi-line cURL',
    )
    .option(
      '--cookie <string>',
      'Full cookie string from your browser (DevTools → Network → any linkedin.com request → copy the "cookie:" request header)',
    )
    .option('--li-at <cookie>', 'li_at cookie value (legacy; LinkedIn may reject a bare token)')
    .option('--jsessionid <cookie>', 'JSESSIONID cookie value (legacy)')
    .option('--skip-validation', 'Save cookies without verifying them against LinkedIn')
    .action(async function (this: Command) {
      const localOpts = this.opts() as Record<string, string | boolean | undefined>;
      const globalOpts = this.optsWithGlobals() as GlobalOptions & Record<string, string | boolean | undefined>;

      try {
        let cookie = (localOpts.cookie ?? globalOpts.cookie) as string | undefined;
        let liAt = (localOpts.liAt ?? globalOpts.liAt) as string | undefined;
        let jsessionid = (localOpts.jsessionid ?? globalOpts.jsessionid) as string | undefined;
        const skipValidation = localOpts.skipValidation as boolean | undefined;
        let headers: Record<string, string> | undefined;

        // A multi-line "Copy as cURL" can't be pasted into an interactive
        // prompt (the shell/terminal mangles the quotes and newlines). Accept it
        // from a file (--curl-file) or piped stdin (`pbpaste | linkedin login`)
        // instead.
        if (!cookie && (localOpts.curlFile as string | undefined)) {
          const { readFile } = await import('node:fs/promises');
          cookie = (await readFile(localOpts.curlFile as string, 'utf-8')).trim();
        }
        if (!cookie && !liAt && !jsessionid && !process.stdin.isTTY) {
          const piped = await readStream(process.stdin);
          if (piped.trim()) cookie = piped.trim();
        }

        // Interactive mode if still nothing. Note: the cURL path needs a file or
        // pipe, so the prompt only collects a single-line cookie string (or
        // li_at/JSESSIONID), and points the user at the cURL options.
        if (!cookie && !liAt && !jsessionid) {
          const { input: promptInput } = await import('@inquirer/prompts');

          cookie = await promptInput({
            message:
              'Paste your cookie string (single line). For the full browser headers, instead Ctrl-C and run:  pbpaste | linkedin login  (after Copy as cURL), or:  linkedin login --curl-file <file>. Leave blank to enter li_at/JSESSIONID individually:',
          });

          if (!cookie?.trim()) {
            cookie = undefined;
            liAt = await promptInput({
              message: 'Paste your li_at cookie value (from DevTools → Application → Cookies → linkedin.com):',
            });
            jsessionid = await promptInput({
              message: 'Paste your JSESSIONID cookie value (include the quotes if present):',
            });
          }
        }

        // If a cURL command or full cookie string was supplied, extract the
        // headers + cookie jar, then derive li_at + JSESSIONID from the jar.
        if (cookie?.trim()) {
          cookie = cookie.trim();

          if (looksLikeCurl(cookie)) {
            const parsed = parseCurlRequest(cookie);
            if (Object.keys(parsed.headers).length > 0) headers = parsed.headers;
            if (parsed.cookie) cookie = parsed.cookie.trim();
          }

          liAt = extractCookieValue(cookie, 'li_at') ?? liAt;
          jsessionid = extractCookieValue(cookie, 'JSESSIONID') ?? jsessionid;

          if (!liAt || !jsessionid) {
            throw new Error(
              'Could not find li_at and JSESSIONID in the pasted value. Paste the full cookie string or a "Copy as cURL".',
            );
          }
        }

        if (!liAt || !jsessionid) {
          throw new Error('Both li_at and JSESSIONID cookies are required');
        }

        // Clean up JSESSIONID (remove surrounding quotes if present)
        jsessionid = jsessionid.replace(/^"/, '').replace(/"$/, '');

        // Save cookies FIRST — before any validation
        await saveConfig({
          li_at: liAt,
          jsessionid,
          ...(cookie ? { cookie } : {}),
          ...(headers ? { headers } : {}),
        });

        // Optionally validate by fetching /me
        if (!skipValidation) {
          try {
            const client = createClient({ liAt, jsessionid, cookie, headers });
            const me = await client.get<any>('/me');
            const profileName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Unknown';
            const profileUrn = me?.entityUrn ?? me?.publicIdentifier ?? '';

            // Update config with profile info
            await saveConfig({
              li_at: liAt,
              jsessionid,
              ...(cookie ? { cookie } : {}),
              ...(headers ? { headers } : {}),
              profile_name: profileName,
              profile_urn: profileUrn,
            });

            output({
              message: 'Login successful',
              profile: profileName,
              urn: profileUrn,
              config: '~/.linkedin-cli/config.json',
              validated: true,
            }, globalOpts);
          } catch (validationErr: any) {
            // Cookies saved but validation failed — warn, don't fail
            output({
              message: 'Cookies saved but validation failed — they may still work',
              warning: validationErr?.message ?? String(validationErr),
              config: '~/.linkedin-cli/config.json',
              validated: false,
            }, globalOpts);
          }
        } else {
          output({
            message: 'Cookies saved (validation skipped)',
            config: '~/.linkedin-cli/config.json',
            validated: false,
          }, globalOpts);
        }
      } catch (error) {
        outputError(error, globalOpts);
      }
    });
}

export function registerLogoutCommand(program: Command): void {
  program
    .command('logout')
    .description('Remove stored LinkedIn session cookies')
    .action(async () => {
      const globalOpts = program.optsWithGlobals() as GlobalOptions;
      try {
        const { deleteConfig } = await import('../../core/config.js');
        await deleteConfig();
        output({ message: 'Logged out. Session cookies removed.' }, globalOpts);
      } catch (error) {
        outputError(error, globalOpts);
      }
    });
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Check current login status (reads config only, use --verify to check session live)')
    .option('--verify', 'Make an API call to verify the session is still valid')
    .action(async function (this: Command) {
      const localOpts = this.opts() as Record<string, boolean | undefined>;
      const globalOpts = this.optsWithGlobals() as GlobalOptions;
      try {
        const { loadConfig } = await import('../../core/config.js');
        const config = await loadConfig();

        if (!config?.li_at || !config?.jsessionid) {
          output({ logged_in: false, message: 'No session cookies stored. Run: linkedin login' }, globalOpts);
          return;
        }

        // Default: just show what's stored, no API call
        if (!localOpts.verify) {
          output({
            logged_in: true,
            profile: config.profile_name || 'Unknown',
            urn: config.profile_urn || '',
            config: '~/.linkedin-cli/config.json',
            note: 'Use --verify to check if session is still valid',
          }, globalOpts);
          return;
        }

        // --verify: make a live API call
        const client = createClient({
          liAt: config.li_at,
          jsessionid: config.jsessionid,
          cookie: config.cookie,
          headers: config.headers,
        });
        try {
          const me = await client.get<any>('/me');
          const name = [me?.firstName, me?.lastName].filter(Boolean).join(' ');
          output({
            logged_in: true,
            profile: name || config.profile_name || 'Unknown',
            urn: me?.entityUrn || config.profile_urn,
            session_valid: true,
          }, globalOpts);
        } catch (err: any) {
          const isAuthError = err?.code === 'AUTH_ERROR' || err?.statusCode === 401;
          if (isAuthError) {
            output({
              logged_in: true,
              profile: config.profile_name || 'Unknown',
              session_valid: false,
              message: 'Session cookies expired. Run: linkedin login',
            }, globalOpts);
          } else {
            output({
              logged_in: true,
              profile: config.profile_name || 'Unknown',
              session_valid: 'unknown',
              message: `Could not verify session: ${err?.message ?? err}`,
            }, globalOpts);
          }
        }
      } catch (error) {
        outputError(error, globalOpts);
      }
    });
}
