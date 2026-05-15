import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { allCommands } from '../commands/index.js';
import { resolveAuth } from '../core/auth.js';
import { createClient } from '../core/client.js';
import { executePaginated } from '../core/paginate.js';

export async function startMcpServer(): Promise<void> {
  const auth = await resolveAuth();
  const client = createClient(auth);

  const server = new McpServer({
    name: 'linkedin',
    version: '0.1.0',
  });

  // Register every CommandDefinition as an MCP tool
  for (const cmdDef of allCommands) {
    const shape: Record<string, z.ZodTypeAny> = { ...cmdDef.inputSchema.shape };
    if (cmdDef.paginated) {
      shape.all = z
        .boolean()
        .optional()
        .describe('Auto-paginate until exhausted or capped (server-side loop).');
      shape.max_pages = z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Override the auto-pagination page cap (default 10).');
    }

    server.registerTool(
      cmdDef.name,
      {
        description: cmdDef.mcpDescription ?? cmdDef.description,
        inputSchema: shape,
      },
      async (args: Record<string, unknown>) => {
        try {
          const { all, max_pages, ...handlerArgs } = args as Record<string, any>;
          const result =
            all && cmdDef.paginated
              ? await executePaginated(cmdDef, handlerArgs, client, max_pages)
              : await cmdDef.handler(handlerArgs, client);
          let payload: unknown = result;
          if (cmdDef.summarize) {
            try {
              payload = cmdDef.summarize(result);
            } catch {
              payload = result;
            }
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(payload, null, 2),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: error.message ?? String(error),
                  code: error.code ?? 'UNKNOWN_ERROR',
                }),
              },
            ],
            isError: true,
          };
        }
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`LinkedIn MCP server started. Tools registered: ${allCommands.length}`);
}
