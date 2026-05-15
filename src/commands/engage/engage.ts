import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';
import { summarizeCommentsList, summarizeReactionsList } from '../../core/summarize.js';

const reactionTypes = z.enum(['LIKE', 'PRAISE', 'APPRECIATION', 'EMPATHY', 'INTEREST', 'ENTERTAINMENT']);

export const engageReactCommand: CommandDefinition = {
  name: 'engage_react',
  group: 'engage',
  subcommand: 'react',
  description: 'React to a post (like, celebrate, support, love, insightful, funny)',
  mcpDescription:
    'Add a reaction (like / celebrate / support / love / insightful / funny) to a post. CRITICAL: post_urn is the NUMERIC activity id ONLY (the digits after "urn:li:activity:"), NOT the full URN and NOT a share URN — the handler prepends "urn:li:activity:" itself. type values: LIKE, PRAISE (celebrate), APPRECIATION (support), EMPATHY (love), INTEREST (insightful), ENTERTAINMENT (funny). Returns the reaction object.',
  examples: [
    'linkedin engage react 7123456789 --type LIKE',
    'linkedin engage react 7123456789 --type PRAISE',
    'linkedin engage react 7123456789 --type EMPATHY',
  ],

  inputSchema: z.object({
    post_urn: z.string().describe('Post activity URN ID (numeric part)'),
    type: reactionTypes.default('LIKE').describe('Reaction type: LIKE, PRAISE, APPRECIATION, EMPATHY, INTEREST, ENTERTAINMENT'),
  }),

  cliMappings: {
    args: [{ field: 'post_urn', name: 'post-urn', required: true }],
    options: [
      { field: 'type', flags: '-t, --type <type>', description: 'Reaction type (default: LIKE)' },
    ],
  },

  handler: async (input, client) => {
    return client.post(
      `/voyagerSocialDashReactions?threadUrn=urn:li:activity:${input.post_urn}`,
      { reactionType: input.type },
    );
  },
};

export const engageReactionsCommand: CommandDefinition = {
  name: 'engage_reactions',
  group: 'engage',
  subcommand: 'reactions',
  description: 'Get reactions on a post',
  mcpDescription:
    'List who has reacted to a given post and with what reaction. CRITICAL: post_urn is the NUMERIC activity id ONLY (digits after "urn:li:activity:"), NOT the full URN — the handler prepends the prefix. Inputs: post_urn, limit (default 10), start. Returns: { elements: [{ reactionType, reactorLockup: { actor, name } }], paging }.',
  examples: ['linkedin engage reactions 7123456789', 'linkedin engage reactions 7123456789 --all'],
  paginated: { elementsPath: 'elements' },

  inputSchema: z.object({
    post_urn: z.string().describe('Post activity URN ID (numeric part)'),
    limit: z.coerce.number().min(1).max(100).default(10).describe('Number of reactions'),
    start: z.coerce.number().default(0).describe('Pagination offset'),
  }),

  cliMappings: {
    args: [{ field: 'post_urn', name: 'post-urn', required: true }],
    options: [
      { field: 'limit', flags: '-l, --limit <number>', description: 'Number of reactions' },
      { field: 'start', flags: '--start <number>', description: 'Pagination offset' },
    ],
  },

  handler: async (input, client) => {
    return client.get('/feed/reactions', {
      count: input.limit,
      q: 'reactionType',
      sortOrder: 'REV_CHRON',
      start: input.start,
      threadUrn: `urn:li:activity:${input.post_urn}`,
    });
  },

  summarize: summarizeReactionsList,
};

export const engageCommentCommand: CommandDefinition = {
  name: 'engage_comment',
  group: 'engage',
  subcommand: 'comment',
  description: 'Comment on a post',
  mcpDescription:
    'Post a top-level comment on someone\'s post. CRITICAL: post_urn is the NUMERIC activity id ONLY (digits after "urn:li:activity:"), NOT the full URN and NOT a share URN — the handler prepends "activity:" itself. Inputs: post_urn, text (max 1250 chars). Returns the created comment object including its comment URN. Use only when the user explicitly says "comment on this post".',
  examples: [
    'linkedin engage comment 7123456789 --text "Great post!"',
  ],

  inputSchema: z.object({
    post_urn: z.string().describe('Post activity URN ID (numeric part)'),
    text: z.string().max(1250).describe('Comment text (max 1250 chars)'),
  }),

  cliMappings: {
    args: [{ field: 'post_urn', name: 'post-urn', required: true }],
    options: [
      { field: 'text', flags: '-t, --text <text>', description: 'Comment text' },
    ],
  },

  handler: async (input, client) => {
    return client.post('/feed/comments?action=create', {
      updateId: `activity:${input.post_urn}`,
      commentaryV2: {
        text: input.text,
        attributes: [],
      },
    });
  },
};

export const engageCommentsListCommand: CommandDefinition = {
  name: 'engage_comments-list',
  group: 'engage',
  subcommand: 'comments-list',
  description: 'List comments on a post',
  mcpDescription:
    'List comments on a post. CRITICAL: post_urn is the NUMERIC activity id ONLY (digits after "urn:li:activity:"), NOT the full URN — the handler prepends "activity:" itself. Inputs: post_urn, limit (default 10), start, sort ("RELEVANCE" or "REVERSE_CHRONOLOGICAL"). Returns: { elements: [{ commenter, commentV2: { text }, createdAt, urn }], paging }.',
  examples: ['linkedin engage comments-list 7123456789', 'linkedin engage comments-list 7123456789 --all'],
  paginated: { elementsPath: 'elements' },

  inputSchema: z.object({
    post_urn: z.string().describe('Post activity URN ID (numeric part)'),
    limit: z.coerce.number().min(1).max(100).default(10).describe('Number of comments'),
    start: z.coerce.number().default(0).describe('Pagination offset'),
    sort: z.enum(['RELEVANCE', 'REVERSE_CHRONOLOGICAL']).default('RELEVANCE').describe('Sort order'),
  }),

  cliMappings: {
    args: [{ field: 'post_urn', name: 'post-urn', required: true }],
    options: [
      { field: 'limit', flags: '-l, --limit <number>', description: 'Number of comments' },
      { field: 'start', flags: '--start <number>', description: 'Pagination offset' },
      { field: 'sort', flags: '-s, --sort <order>', description: 'Sort: RELEVANCE or REVERSE_CHRONOLOGICAL' },
    ],
  },

  handler: async (input, client) => {
    return client.get('/feed/comments', {
      count: input.limit,
      start: input.start,
      q: 'comments',
      sortOrder: input.sort,
      updateId: `activity:${input.post_urn}`,
    });
  },

  summarize: summarizeCommentsList,
};

export const engageShareCommand: CommandDefinition = {
  name: 'engage_share',
  group: 'engage',
  subcommand: 'share',
  description: 'Share/repost a post with optional commentary',
  mcpDescription:
    'Repost someone else\'s share to your feed, optionally with your own commentary on top. IMPORTANT: share_urn is the FULL URN of the original share (e.g., "urn:li:share:7123456789"), NOT an activity URN and NOT a bare numeric id. Inputs: share_urn (full URN), text (optional commentary, max 3000 chars). Returns the new repost share object.',
  examples: [
    'linkedin engage share urn:li:share:12345',
    'linkedin engage share urn:li:share:12345 --text "This is worth reading"',
  ],

  inputSchema: z.object({
    share_urn: z.string().describe('Original share URN to repost'),
    text: z.string().max(3000).optional().describe('Optional commentary text'),
  }),

  cliMappings: {
    args: [{ field: 'share_urn', name: 'share-urn', required: true }],
    options: [
      { field: 'text', flags: '-t, --text <text>', description: 'Optional commentary' },
    ],
  },

  handler: async (input, client) => {
    const payload: any = {
      visibleToConnectionsOnly: false,
      externalAudienceProviders: [],
      commentaryV2: {
        text: input.text ?? '',
        attributes: [],
      },
      origin: 'FEED',
      allowedCommentersScope: 'ALL',
      postState: 'PUBLISHED',
      media: [],
      resharedUpdate: input.share_urn,
    };
    return client.post('/contentcreation/normShares', payload);
  },
};

export const engageCommands = [
  engageReactCommand,
  engageReactionsCommand,
  engageCommentCommand,
  engageCommentsListCommand,
  engageShareCommand,
];
