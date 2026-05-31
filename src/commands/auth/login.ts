import { Command } from 'commander';
import { saveConfig } from '../../core/config.js';
import { createClient, extractCookieValue } from '../../core/client.js';
import { output, outputError } from '../../core/output.js';
import type { GlobalOptions } from '../../core/types.js';

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Store your LinkedIn session cookies for CLI use')
    .option(
      '--cookie <string>',
      'Full cookie string from your browser (recommended — DevTools → Network → any linkedin.com request → copy the "cookie:" request header)',
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

        // Interactive mode if nothing provided as flags. Prefer the full cookie
        // string — a bare li_at gets the session revoked by LinkedIn.
        if (!cookie && !liAt && !jsessionid) {
          const { input: promptInput } = await import('@inquirer/prompts');

          cookie = await promptInput({
            message:
              'Paste your full LinkedIn cookie string (DevTools → Network → any linkedin.com request → right-click → Copy → Copy as cURL, or copy the "cookie:" request header). Leave blank to enter li_at/JSESSIONID individually:',
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

        // If a full cookie string was supplied (flag or prompt), derive li_at +
        // JSESSIONID from it and store the whole jar.
        if (cookie?.trim()) {
          cookie = cookie.trim();
          // A pasted "Copy as cURL" may wrap the cookie in -H 'cookie: ...'; pull
          // out just the cookie value if so.
          const hMatch = cookie.match(/(?:-H\s+['"]?cookie:\s*)([^'"]+)/i);
          if (hMatch) cookie = hMatch[1].trim();

          liAt = extractCookieValue(cookie, 'li_at') ?? liAt;
          jsessionid = extractCookieValue(cookie, 'JSESSIONID') ?? jsessionid;

          if (!liAt || !jsessionid) {
            throw new Error('Cookie string must contain both li_at and JSESSIONID.');
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
        });

        // Optionally validate by fetching /me
        if (!skipValidation) {
          try {
            const client = createClient({ liAt, jsessionid, cookie });
            const me = await client.get<any>('/me');
            const profileName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Unknown';
            const profileUrn = me?.entityUrn ?? me?.publicIdentifier ?? '';

            // Update config with profile info
            await saveConfig({
              li_at: liAt,
              jsessionid,
              ...(cookie ? { cookie } : {}),
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
