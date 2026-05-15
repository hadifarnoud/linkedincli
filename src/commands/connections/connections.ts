import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';
import { generateTrackingId } from '../../core/client.js';

export const connectionsSendCommand: CommandDefinition = {
  name: 'connections_send',
  group: 'connections',
  subcommand: 'send',
  description: 'Send a connection request to a profile',
  mcpDescription:
    'Send a 1st-degree connection invitation to a profile, optionally with a custom note. IMPORTANT: profile_urn is the URN ID (the long alphanumeric tail like "ACoAABxxxxxxx") — NOT the public ID/URL slug. Get this from profile_view via miniProfile.entityUrn (drop the "urn:li:fs(d)_profile:" prefix). Inputs: profile_urn, optional message (max 300 chars). Use only when user explicitly says "connect with".',
  examples: [
    'linkedin connections send ACoAABxxxxxxx',
    'linkedin connections send ACoAABxxxxxxx --message "Hi, I\'d love to connect!"',
  ],

  inputSchema: z.object({
    profile_urn: z.string().describe('Profile URN ID (e.g., ACoAABxxxxxxx)'),
    message: z.string().max(300).optional().describe('Optional connection message (max 300 chars)'),
  }),

  cliMappings: {
    args: [{ field: 'profile_urn', name: 'profile-urn', required: true }],
    options: [
      { field: 'message', flags: '-m, --message <text>', description: 'Connection message (max 300 chars)' },
    ],
  },

  handler: async (input, client) => {
    const payload: any = {
      invitee: {
        inviteeUnion: {
          memberProfile: `urn:li:fsd_profile:${input.profile_urn}`,
        },
      },
    };
    if (input.message) {
      payload.customMessage = input.message;
    }

    return client.post(
      '/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2',
      payload,
    );
  },
};

export const connectionsReceivedCommand: CommandDefinition = {
  name: 'connections_received',
  group: 'connections',
  subcommand: 'received',
  description: 'List received connection invitations',
  mcpDescription:
    'List pending INCOMING connection invitations the authenticated user has received. Use to find pending invites the user can accept/reject. No profile id required. Inputs: limit (default 100), start. Returns: { elements: [{ invitation: { entityUrn, sharedSecret, fromMember: { miniProfile } }, inviterInsights }], paging }. The numeric tail of invitation.entityUrn is the invitation_id for accept/reject.',
  examples: ['linkedin connections received'],

  inputSchema: z.object({
    limit: z.coerce.number().min(1).max(100).default(100).describe('Number of invitations'),
    start: z.coerce.number().default(0).describe('Pagination offset'),
  }),

  cliMappings: {
    options: [
      { field: 'limit', flags: '-l, --limit <number>', description: 'Number of invitations' },
      { field: 'start', flags: '--start <number>', description: 'Pagination offset' },
    ],
  },

  handler: async (input, client) => {
    return client.get('/relationships/invitationViews', {
      start: input.start,
      count: input.limit,
      includeInsights: true,
      q: 'receivedInvitation',
    });
  },
};

export const connectionsSentCommand: CommandDefinition = {
  name: 'connections_sent',
  group: 'connections',
  subcommand: 'sent',
  description: 'List sent connection invitations',
  mcpDescription:
    'List pending OUTGOING connection invitations the authenticated user has sent (and not yet accepted/withdrawn). Use to audit pending invites or find one to withdraw. No profile id required. Inputs: limit (default 100), start. Returns: { elements: [{ invitation: { entityUrn, toMember: { miniProfile }, sentTime } }], paging }.',
  examples: ['linkedin connections sent'],

  inputSchema: z.object({
    limit: z.coerce.number().min(1).max(100).default(100).describe('Number of invitations'),
    start: z.coerce.number().default(0).describe('Pagination offset'),
  }),

  cliMappings: {
    options: [
      { field: 'limit', flags: '-l, --limit <number>', description: 'Number of invitations' },
      { field: 'start', flags: '--start <number>', description: 'Pagination offset' },
    ],
  },

  handler: async (input, client) => {
    return client.get('/relationships/sentInvitationViewsV2', {
      start: input.start,
      count: input.limit,
      invitationType: 'CONNECTION',
      q: 'invitationType',
    });
  },
};

export const connectionsAcceptCommand: CommandDefinition = {
  name: 'connections_accept',
  group: 'connections',
  subcommand: 'accept',
  description: 'Accept a connection invitation',
  mcpDescription:
    'Accept a pending incoming connection invitation. BOTH inputs are required and come from connections_received: invitation_id is the numeric tail of invitation.entityUrn; secret is the invitation.sharedSecret value. Do NOT guess these — always call connections_received first. Returns the accept action result.',
  examples: ['linkedin connections accept 12345 --secret abc123'],

  inputSchema: z.object({
    invitation_id: z.string().describe('Invitation ID'),
    secret: z.string().describe('Invitation shared secret'),
  }),

  cliMappings: {
    args: [{ field: 'invitation_id', name: 'invitation-id', required: true }],
    options: [
      { field: 'secret', flags: '-s, --secret <secret>', description: 'Invitation shared secret' },
    ],
  },

  handler: async (input, client) => {
    return client.post(
      `/relationships/invitations/${input.invitation_id}?action=accept`,
      {
        invitationId: input.invitation_id,
        invitationSharedSecret: input.secret,
        isGenericInvitation: false,
      },
    );
  },
};

export const connectionsRejectCommand: CommandDefinition = {
  name: 'connections_reject',
  group: 'connections',
  subcommand: 'reject',
  description: 'Reject/ignore a connection invitation',
  mcpDescription:
    'Reject/ignore a pending incoming connection invitation. BOTH inputs come from connections_received: invitation_id is the numeric tail of invitation.entityUrn; secret is invitation.sharedSecret. Always call connections_received first to obtain these. Returns the ignore action result.',
  examples: ['linkedin connections reject 12345 --secret abc123'],

  inputSchema: z.object({
    invitation_id: z.string().describe('Invitation ID'),
    secret: z.string().describe('Invitation shared secret'),
  }),

  cliMappings: {
    args: [{ field: 'invitation_id', name: 'invitation-id', required: true }],
    options: [
      { field: 'secret', flags: '-s, --secret <secret>', description: 'Invitation shared secret' },
    ],
  },

  handler: async (input, client) => {
    return client.post(
      `/relationships/invitations/${input.invitation_id}?action=ignore`,
      {
        invitationId: input.invitation_id,
        invitationSharedSecret: input.secret,
        isGenericInvitation: false,
      },
    );
  },
};

export const connectionsWithdrawCommand: CommandDefinition = {
  name: 'connections_withdraw',
  group: 'connections',
  subcommand: 'withdraw',
  description: 'Withdraw a pending sent connection request',
  mcpDescription:
    'Withdraw (cancel) a pending OUTGOING connection request you previously sent. Input: invitation_id is the numeric tail of invitation.entityUrn from connections_sent. Use only when the user explicitly says "withdraw" / "cancel my invite". Returns the delete result.',
  examples: ['linkedin connections withdraw 12345'],

  inputSchema: z.object({
    invitation_id: z.string().describe('Invitation ID to withdraw'),
  }),

  cliMappings: {
    args: [{ field: 'invitation_id', name: 'invitation-id', required: true }],
  },

  handler: async (input, client) => {
    return client.delete(`/relationships/invitations/${input.invitation_id}`);
  },
};

export const connectionsRemoveCommand: CommandDefinition = {
  name: 'connections_remove',
  group: 'connections',
  subcommand: 'remove',
  description: 'Remove an existing connection',
  mcpDescription:
    'Remove (unfriend) an existing 1st-degree connection. DESTRUCTIVE and not reversible without sending a new invite. Input: public_id is the URL slug (e.g., "johndoe"), NOT a URN ID. Use only when the user explicitly says "disconnect" / "remove connection". Functionally equivalent to profile_disconnect.',
  examples: ['linkedin connections remove johndoe'],

  inputSchema: z.object({
    public_id: z.string().describe('Public profile identifier'),
  }),

  cliMappings: {
    args: [{ field: 'public_id', name: 'public-id', required: true }],
  },

  handler: async (input, client) => {
    return client.post(
      `/identity/profiles/${encodeURIComponent(input.public_id)}/profileActions?action=disconnect`,
    );
  },
};

export const connectionsCommands = [
  connectionsSendCommand,
  connectionsReceivedCommand,
  connectionsSentCommand,
  connectionsAcceptCommand,
  connectionsRejectCommand,
  connectionsWithdrawCommand,
  connectionsRemoveCommand,
];
