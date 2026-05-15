import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';

export const companiesViewCommand: CommandDefinition = {
  name: 'companies_view',
  group: 'companies',
  subcommand: 'view',
  description: 'View a company profile by universal name (URL slug)',
  mcpDescription:
    'Fetch a company page (overview, description, headcount, follower count, industry, locations, followingState URN). Input: company_name is the universal name (URL slug from /company/<slug>), NOT a numeric company ID. Use when the user provides a company name or slug. Returns: { elements: [{ name, universalName, description, staffCount, followingInfo (contains URN for companies_follow) }] }.',
  examples: ['linkedin companies view google'],

  inputSchema: z.object({
    company_name: z.string().describe('Company universal name (the URL slug)'),
  }),

  cliMappings: {
    args: [{ field: 'company_name', name: 'company-name', required: true }],
  },

  handler: async (input, client) => {
    return client.get('/organization/companies', {
      decorationId: 'com.linkedin.voyager.deco.organization.web.WebFullCompanyMain-12',
      q: 'universalName',
      universalName: input.company_name,
    });
  },
};

export const companiesFollowCommand: CommandDefinition = {
  name: 'companies_follow',
  group: 'companies',
  subcommand: 'follow',
  description: 'Follow a company',
  mcpDescription:
    'Follow a company (or other followable entity). IMPORTANT: following_state_urn is the followingState URN (e.g., "urn:li:fs_followingInfo:..." or the dash variant), obtained from companies_view\'s followingInfo. Use when user says "follow <Company>"; first call companies_view to get the URN. Returns the patched following state.',
  examples: ['linkedin companies follow urn:li:company:1035'],

  inputSchema: z.object({
    following_state_urn: z.string().describe('Following state URN'),
  }),

  cliMappings: {
    args: [{ field: 'following_state_urn', name: 'following-state-urn', required: true }],
  },

  handler: async (input, client) => {
    return client.post(
      `/feed/dash/followingStates/${encodeURIComponent(input.following_state_urn)}`,
      {
        patch: {
          $set: {
            following: true,
          },
        },
      },
    );
  },
};

export const companiesUnfollowCommand: CommandDefinition = {
  name: 'companies_unfollow',
  group: 'companies',
  subcommand: 'unfollow',
  description: 'Unfollow a company or entity',
  mcpDescription:
    'Unfollow a company or other followable entity. Input: entity_urn is the FULL entity URN (e.g., "urn:li:fs_followingInfo:12345" or the company URN), get it from companies_view. Use when user says "unfollow <Company>". Returns the unfollow action result.',
  examples: ['linkedin companies unfollow urn:li:fs_followingInfo:12345'],

  inputSchema: z.object({
    entity_urn: z.string().describe('Entity URN to unfollow'),
  }),

  cliMappings: {
    args: [{ field: 'entity_urn', name: 'entity-urn', required: true }],
  },

  handler: async (input, client) => {
    return client.post('/feed/follows?action=unfollowByEntityUrn', {
      urn: input.entity_urn,
    });
  },
};

export const companiesCommands = [
  companiesViewCommand,
  companiesFollowCommand,
  companiesUnfollowCommand,
];
