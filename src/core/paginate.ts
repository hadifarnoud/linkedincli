import type { CommandDefinition, LinkedInClient } from './types.js';

export const DEFAULT_MAX_PAGES = 10;

function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

export interface PaginatedResult {
  elements: unknown[];
  paginated: {
    pages_fetched: number;
    total_items: number;
    capped: boolean;
  };
}

export async function executePaginated(
  cmdDef: CommandDefinition,
  input: Record<string, any>,
  client: LinkedInClient,
  maxPagesOverride?: number,
): Promise<PaginatedResult> {
  if (!cmdDef.paginated) {
    throw new Error(`Command ${cmdDef.name} is not paginated`);
  }

  const { elementsPath, maxPages: defaultMax } = cmdDef.paginated;
  const maxPages = maxPagesOverride ?? defaultMax ?? DEFAULT_MAX_PAGES;

  const limit = Number(input.limit ?? input.count ?? 10);
  let start = Number(input.start ?? 0);

  const accumulated: unknown[] = [];
  let pages = 0;
  let exhausted = false;

  while (pages < maxPages) {
    const pageInput = { ...input, start };
    const raw = await cmdDef.handler(pageInput, client);
    const pageElements = getByPath(raw, elementsPath);
    pages += 1;

    if (!Array.isArray(pageElements) || pageElements.length === 0) {
      exhausted = true;
      break;
    }

    accumulated.push(...pageElements);

    if (pageElements.length < limit) {
      exhausted = true;
      break;
    }

    start += limit;
  }

  return {
    elements: accumulated,
    paginated: {
      pages_fetched: pages,
      total_items: accumulated.length,
      capped: !exhausted,
    },
  };
}
