import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';

export const analyticsProfileViewsCommand: CommandDefinition = {
  name: 'analytics_profile-views',
  group: 'analytics',
  subcommand: 'profile-views',
  description: 'Get "who viewed my profile" summary and count',
  mcpDescription:
    'Fetch the authenticated user\'s "who viewed my profile" analytics: total view count over recent windows plus a sample of recent viewers. No inputs. Use when the user asks "who viewed my profile" or "how many profile views did I get". Returns: { elements: [{ cardType, viewerCount, viewers: [{ miniProfile }] }] }. Some viewer details are hidden unless the user has LinkedIn Premium.',
  examples: ['linkedin analytics profile-views'],

  inputSchema: z.object({}),

  cliMappings: {},

  handler: async (_input, client) => {
    return client.get('/identity/wvmpCards');
  },
};

export const analyticsCommands = [
  analyticsProfileViewsCommand,
];
