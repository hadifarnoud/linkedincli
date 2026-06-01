import type { CommandDefinition, GlobalOptions } from './types.js';
import { formatError } from './errors.js';

function pickFields(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in obj) {
      result[field] = obj[field];
    }
  }
  return result;
}

export function applySummary(
  data: unknown,
  cmdDef: Pick<CommandDefinition, 'summarize'>,
  options: GlobalOptions = {},
): unknown {
  if (!options.summary || !cmdDef.summarize) return data;
  try {
    return cmdDef.summarize(data);
  } catch {
    return data;
  }
}

export function output(data: unknown, options: GlobalOptions = {}): void {
  if (options.quiet) return;

  let result = data;

  if (options.fields && typeof data === 'object' && data !== null) {
    const fields = options.fields.split(',').map((f) => f.trim());
    if (Array.isArray(data)) {
      result = data.map((item) => pickFields(item as Record<string, unknown>, fields));
    } else {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.elements)) {
        result = (obj.elements as Record<string, unknown>[]).map((item) => pickFields(item, fields));
      } else if (Array.isArray(obj.items)) {
        result = (obj.items as Record<string, unknown>[]).map((item) => pickFields(item, fields));
      } else {
        result = pickFields(obj, fields);
      }
    }
  }

  if (options.output === 'pretty' || options.pretty) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(JSON.stringify(result));
  }
}

export function outputError(error: unknown, options: GlobalOptions = {}): void {
  const formatted = formatError(error);

  // Opt-in full diagnostics: stack + underlying cause chain. Always to stderr.
  if (process.env.LINKEDIN_DEBUG && error instanceof Error) {
    console.error(error.stack ?? error.message);
    let cause = (error as { cause?: unknown }).cause;
    while (cause) {
      console.error('Caused by:', cause instanceof Error ? (cause.stack ?? cause.message) : cause);
      cause = cause instanceof Error ? (cause as { cause?: unknown }).cause : undefined;
    }
  }

  if (options.quiet) {
    process.exitCode = 1;
    return;
  }

  if (options.output === 'pretty' || options.pretty) {
    console.error(`Error: ${formatted.message}`);
  } else {
    console.error(JSON.stringify({ error: formatted.message, code: formatted.code }));
  }
  process.exitCode = 1;
}
