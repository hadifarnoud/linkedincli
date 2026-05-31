import type { z } from 'zod';

export interface CommandDefinition<TInput extends z.ZodObject<any> = z.ZodObject<any>> {
  /** MCP tool name, e.g. "profile_view" */
  name: string;
  /** CLI group, e.g. "profile" */
  group: string;
  /** CLI subcommand, e.g. "view" */
  subcommand: string;
  /** Shared help text for CLI and MCP */
  description: string;
  /** Richer description used by the MCP server registration; falls back to description if unset */
  mcpDescription?: string;
  /** CLI usage examples */
  examples?: string[];
  /** Zod schema — validates both CLI flags and MCP input */
  inputSchema: TInput;
  /** Maps Zod fields to CLI args/options */
  cliMappings: CliMapping;
  /** HTTP endpoint (for standard CRUD via executeCommand) */
  endpoint?: {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    path: string;
  };
  /** Where each field goes in the HTTP request */
  fieldMappings?: Record<string, 'path' | 'query' | 'body'>;
  /**
   * Marks this command as paginated and enables the global --all flag
   * (and the `all` MCP input) to drive auto-pagination.
   *  - elementsPath: dot-path into the handler's response that holds the
   *    items array, e.g. "elements" or "data.elements".
   *  - maxPages: safety cap on how many pages to fetch (default 10).
   */
  paginated?: { elementsPath: string; maxPages?: number };
  /** Handler function — called for both CLI and MCP */
  handler: (input: any, client: LinkedInClient) => Promise<unknown>;
  /** Optional summarizer — flattens raw Voyager response to a stable shape when --summary is on */
  summarize?: (raw: unknown) => unknown;
}

export interface CliMapping {
  args?: Array<{
    field: string;
    name: string;
    required?: boolean;
  }>;
  options?: Array<{
    field: string;
    flags: string;
    description?: string;
  }>;
}

export interface GlobalOptions {
  output?: string;
  pretty?: boolean;
  quiet?: boolean;
  fields?: string;
  summary?: boolean;
  all?: boolean;
  maxPages?: number;
}

export interface LinkedInAuth {
  liAt: string;
  jsessionid: string;
  /**
   * Full browser cookie string (li_at + JSESSIONID + companions like bcookie,
   * bscookie, lidc, li_gc, ...). When set, it is sent verbatim. LinkedIn treats
   * a bare li_at as a replayed token and revokes the session, so sending the
   * complete jar is what makes the request look like a real browser.
   */
  cookie?: string;
  /**
   * Extra request headers captured from the browser (e.g. via `Copy as cURL`):
   * user-agent, x-li-track (clientVersion), sec-ch-ua, x-li-page-instance, etc.
   * Replayed verbatim so the request fingerprint matches the browser and
   * LinkedIn doesn't flag/revoke the session.
   */
  headers?: Record<string, string>;
}

export interface LinkedInClient {
  request<T = unknown>(options: {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    baseRequest?: boolean;
  }): Promise<T>;

  get<T = unknown>(path: string, query?: Record<string, any>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, query?: Record<string, any>): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string, query?: Record<string, any>): Promise<T>;
}
