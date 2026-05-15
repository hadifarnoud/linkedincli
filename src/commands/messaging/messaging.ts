import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';
import { generateTrackingId } from '../../core/client.js';

export const messagingConversationsCommand: CommandDefinition = {
  name: 'messaging_conversations',
  group: 'messaging',
  subcommand: 'conversations',
  description: 'List your messaging conversations',
  mcpDescription:
    'List the authenticated user\'s messaging inbox (all conversations). Use to find a conversation_id before fetching messages or sending a follow-up. No inputs. Returns: { elements: [{ entityUrn (conversation URN), participants: [{ miniProfile }], events (latest message), unreadCount, lastActivityAt }], paging }. The numeric tail of entityUrn is the conversation_id used by other messaging tools.',
  examples: ['linkedin messaging conversations'],

  inputSchema: z.object({}),

  cliMappings: {},

  handler: async (_input, client) => {
    return client.get('/messaging/conversations', {
      keyVersion: 'LEGACY_INBOX',
    });
  },
};

export const messagingConversationWithCommand: CommandDefinition = {
  name: 'messaging_conversation-with',
  group: 'messaging',
  subcommand: 'conversation-with',
  description: 'Get conversation with a specific person by their URN ID',
  mcpDescription:
    'Look up the existing 1:1 conversation with a specific person. Input: profile_urn is the recipient\'s URN ID (alphanumeric tail like "ACoAABxxxxxxx") — NOT a public ID/URL slug. Use when you have someone\'s URN and want to find or open their thread. Returns: { elements: [...] } — empty if no conversation exists yet (use messaging_send-new to start one).',
  examples: ['linkedin messaging conversation-with ACoAABxxxxxxx'],

  inputSchema: z.object({
    profile_urn: z.string().describe('Profile URN ID of the recipient'),
  }),

  cliMappings: {
    args: [{ field: 'profile_urn', name: 'profile-urn', required: true }],
  },

  handler: async (input, client) => {
    return client.get('/messaging/conversations', {
      keyVersion: 'LEGACY_INBOX',
      q: 'participants',
      recipients: `List(${input.profile_urn})`,
    });
  },
};

export const messagingMessagesCommand: CommandDefinition = {
  name: 'messaging_messages',
  group: 'messaging',
  subcommand: 'messages',
  description: 'Get messages from a specific conversation',
  mcpDescription:
    'Fetch the messages inside one conversation. Input: conversation_id is the numeric tail of conversation.entityUrn from messaging_conversations (NOT a profile URN). Optional before: epoch ms — fetch older messages before this time (for pagination). Returns: { elements: [{ from, eventContent.attributedBody.text, createdAt }], paging }.',
  examples: ['linkedin messaging messages CONVERSATION_URN_ID'],

  inputSchema: z.object({
    conversation_id: z.string().describe('Conversation URN ID'),
    before: z.coerce.number().optional().describe('Timestamp (ms) — get messages before this time'),
  }),

  cliMappings: {
    args: [{ field: 'conversation_id', name: 'conversation-id', required: true }],
    options: [
      { field: 'before', flags: '--before <timestamp>', description: 'Get messages before this timestamp (ms)' },
    ],
  },

  handler: async (input, client) => {
    const query: Record<string, any> = { keyVersion: 'LEGACY_INBOX' };
    if (input.before) {
      query.createdBefore = input.before;
    }
    return client.get(`/messaging/conversations/${input.conversation_id}/events`, query);
  },
};

export const messagingSendCommand: CommandDefinition = {
  name: 'messaging_send',
  group: 'messaging',
  subcommand: 'send',
  description: 'Send a message in an existing conversation',
  mcpDescription:
    'Send a reply into an EXISTING conversation thread. Input: conversation_id is the numeric tail of an existing conversation.entityUrn (from messaging_conversations); to start a brand-new conversation use messaging_send-new instead. Inputs: conversation_id, text. Use only when the user explicitly says "reply" / "message <person> back". Returns the created message event.',
  examples: ['linkedin messaging send CONVERSATION_URN_ID --text "Hello!"'],

  inputSchema: z.object({
    conversation_id: z.string().describe('Conversation URN ID'),
    text: z.string().describe('Message text'),
  }),

  cliMappings: {
    args: [{ field: 'conversation_id', name: 'conversation-id', required: true }],
    options: [
      { field: 'text', flags: '-t, --text <text>', description: 'Message text' },
    ],
  },

  handler: async (input, client) => {
    return client.post(
      `/messaging/conversations/${input.conversation_id}/events?action=create`,
      {
        eventCreate: {
          originToken: crypto.randomUUID(),
          value: {
            'com.linkedin.voyager.messaging.create.MessageCreate': {
              attributedBody: {
                text: input.text,
                attributes: [],
              },
              attachments: [],
            },
          },
          trackingId: generateTrackingId(),
        },
        dedupeByClientGeneratedToken: false,
      },
    );
  },
};

export const messagingSendNewCommand: CommandDefinition = {
  name: 'messaging_send-new',
  group: 'messaging',
  subcommand: 'send-new',
  description: 'Send a message to one or more people (creates a new conversation)',
  mcpDescription:
    'Start a NEW conversation with one or more recipients (1:1 or group). Inputs: recipients is a comma-separated string of profile URN IDs (alphanumeric like "ACoAABxxxxxxx", NOT public IDs and NOT a JSON array); text is the message body. Use only when no existing conversation thread is appropriate — to reply, use messaging_send. Returns the created conversation/event.',
  examples: [
    'linkedin messaging send-new --recipients ACoAABxxxxxxx --text "Hello!"',
    'linkedin messaging send-new --recipients ACoAABxxxxxxx,ACoAAByyyyyyy --text "Group message"',
  ],

  inputSchema: z.object({
    recipients: z.string().describe('Comma-separated profile URN IDs'),
    text: z.string().describe('Message text'),
  }),

  cliMappings: {
    options: [
      { field: 'recipients', flags: '-r, --recipients <urns>', description: 'Comma-separated profile URN IDs' },
      { field: 'text', flags: '-t, --text <text>', description: 'Message text' },
    ],
  },

  handler: async (input, client) => {
    const recipientList = input.recipients.split(',').map((r: string) => r.trim());

    return client.post('/messaging/conversations?action=create', {
      keyVersion: 'LEGACY_INBOX',
      conversationCreate: {
        eventCreate: {
          originToken: crypto.randomUUID(),
          value: {
            'com.linkedin.voyager.messaging.create.MessageCreate': {
              attributedBody: {
                text: input.text,
                attributes: [],
              },
              attachments: [],
            },
          },
          trackingId: generateTrackingId(),
        },
        recipients: recipientList,
        subtype: 'MEMBER_TO_MEMBER',
      },
    });
  },
};

export const messagingMarkReadCommand: CommandDefinition = {
  name: 'messaging_mark-read',
  group: 'messaging',
  subcommand: 'mark-read',
  description: 'Mark a conversation as read',
  mcpDescription:
    'Mark a conversation as read (clears the unread badge). Input: conversation_id is the numeric tail of conversation.entityUrn from messaging_conversations. Use when the user says "mark <thread> as read" or after the agent has summarized unread messages. Returns the patch result.',
  examples: ['linkedin messaging mark-read CONVERSATION_URN_ID'],

  inputSchema: z.object({
    conversation_id: z.string().describe('Conversation URN ID'),
  }),

  cliMappings: {
    args: [{ field: 'conversation_id', name: 'conversation-id', required: true }],
  },

  handler: async (input, client) => {
    return client.post(`/messaging/conversations/${input.conversation_id}`, {
      patch: {
        $set: {
          read: true,
        },
      },
    });
  },
};

export const messagingCommands = [
  messagingConversationsCommand,
  messagingConversationWithCommand,
  messagingMessagesCommand,
  messagingSendCommand,
  messagingSendNewCommand,
  messagingMarkReadCommand,
];
