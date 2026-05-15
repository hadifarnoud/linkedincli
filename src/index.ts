import { Command, InvalidArgumentError } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerAllCommands } from './commands/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('linkedin')
  .description('CLI and MCP server for LinkedIn — full platform management via cookie session auth')
  .version(pkg.version)
  .option('--li-at <cookie>', 'li_at cookie (overrides LINKEDIN_LI_AT env var and stored config)')
  .option('--jsessionid <cookie>', 'JSESSIONID cookie (overrides LINKEDIN_JSESSIONID env var and stored config)')
  .option('--output <format>', 'Output format: json (default) or pretty', 'json')
  .option('--pretty', 'Shorthand for --output pretty')
  .option('--quiet', 'Suppress output, exit codes only')
  .option('--fields <fields>', 'Comma-separated list of fields to include in output')
  .option('--summary', 'Flatten output to a stable, agent-friendly per-command shape (when available)')
  .option('--all', 'Auto-paginate listing commands until exhausted or capped')
  .option('--max-pages <n>', 'Override the auto-pagination page cap (default 10)', (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) {
      throw new InvalidArgumentError(`--max-pages must be a positive integer, got: ${v}`);
    }
    return n;
  });

registerAllCommands(program);

program.parse();
