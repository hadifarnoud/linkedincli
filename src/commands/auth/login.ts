import { Command } from 'commander';
import { saveConfig } from '../../core/config.js';
import { createClient } from '../../core/client.js';
import { output, outputError } from '../../core/output.js';
import type { GlobalOptions } from '../../core/types.js';

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Store your LinkedIn session cookies (li_at + JSESSIONID) for CLI use')
    .option('--li-at <cookie>', 'li_at cookie value (from browser DevTools)')
    .option('--jsessionid <cookie>', 'JSESSIONID cookie value (from browser DevTools)')
    .action(async function (this: Command) {
      // Commander puts --li-at on the subcommand opts (not global), read from both
      const localOpts = this.opts() as Record<string, string | undefined>;
      const globalOpts = this.optsWithGlobals() as GlobalOptions & Record<string, string | undefined>;

      try {
        let liAt = localOpts.liAt ?? globalOpts.liAt;
        let jsessionid = localOpts.jsessionid ?? globalOpts.jsessionid;

        // Interactive mode if cookies not provided as flags
        if (!liAt || !jsessionid) {
          // Dynamic import for Node 18 compat
          const { input: promptInput } = await import('@inquirer/prompts');

          if (!liAt) {
            liAt = await promptInput({
              message: 'Paste your li_at cookie value (from browser DevTools → Application → Cookies → linkedin.com):',
            });
          }
          if (!jsessionid) {
            jsessionid = await promptInput({
              message: 'Paste your JSESSIONID cookie value (include the quotes if present):',
            });
          }
        }

        if (!liAt || !jsessionid) {
          throw new Error('Both li_at and JSESSIONID cookies are required');
        }

        // Clean up JSESSIONID (remove surrounding quotes if present)
        jsessionid = jsessionid.replace(/^"/, '').replace(/"$/, '');

        // Validate by fetching /me
        const client = createClient({ liAt, jsessionid });
        const me = await client.get<any>('/me');

        const profileName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Unknown';
        const profileUrn = me?.entityUrn ?? me?.publicIdentifier ?? '';

        await saveConfig({
          li_at: liAt,
          jsessionid,
          profile_name: profileName,
          profile_urn: profileUrn,
        });

        output(
          {
            message: 'Login successful',
            profile: profileName,
            urn: profileUrn,
            config: '~/.linkedin-cli/config.json',
          },
          globalOpts,
        );
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
    .description('Check current login status and cookie validity')
    .action(async () => {
      const globalOpts = program.optsWithGlobals() as GlobalOptions;
      try {
        const { loadConfig } = await import('../../core/config.js');
        const config = await loadConfig();

        if (!config?.li_at || !config?.jsessionid) {
          output({ logged_in: false, message: 'No session cookies stored. Run: linkedin login' }, globalOpts);
          return;
        }

        // Validate session by calling /me
        const client = createClient({ liAt: config.li_at, jsessionid: config.jsessionid });
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
          // Only report session_valid: false for actual auth errors
          const isAuthError = err?.code === 'AUTH_ERROR' || err?.statusCode === 401;
          if (isAuthError) {
            output({
              logged_in: true,
              profile: config.profile_name || 'Unknown',
              session_valid: false,
              message: 'Session cookies expired. Run: linkedin login',
            }, globalOpts);
          } else {
            // Transient error — session may still be valid
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
