import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';
import { summarizePostsList } from '../../core/summarize.js';

export const profileViewCommand: CommandDefinition = {
  name: 'profile_view',
  group: 'profile',
  subcommand: 'view',
  description: 'View a LinkedIn profile by public ID or URN ID',
  mcpDescription:
    'Fetch a full LinkedIn profile (positions, education, summary, headline) by public ID. Use when you have a URL-slug handle like "johndoe" from a profile URL (linkedin.com/in/<public_id>). Input: public_id is the URL slug, NOT a numeric URN ID. Returns: { profile: { firstName, lastName, headline, locationName }, positionView, educationView, ... }.',
  examples: [
    'linkedin profile view johndoe',
    'linkedin profile view johndoe --pretty',
  ],

  inputSchema: z.object({
    public_id: z.string().describe('Public profile identifier (the URL slug)'),
  }),

  cliMappings: {
    args: [{ field: 'public_id', name: 'public-id', required: true }],
  },

  handler: async (input, client) => {
    return client.get(`/identity/profiles/${encodeURIComponent(input.public_id)}/profileView`);
  },
};

export const profileMeCommand: CommandDefinition = {
  name: 'profile_me',
  group: 'profile',
  subcommand: 'me',
  description: 'View your own LinkedIn profile',
  mcpDescription:
    'Fetch the currently authenticated user\'s mini-profile. Use whenever you need the agent\'s own identity (own URN ID, name, headline) before calling another tool. No inputs. Returns: { plainId, miniProfile: { entityUrn, firstName, lastName, publicIdentifier, occupation } }. The numeric tail of entityUrn is the URN ID used by profile_posts.',
  examples: ['linkedin profile me'],

  inputSchema: z.object({}),

  cliMappings: {},

  handler: async (_input, client) => {
    return client.get('/me');
  },
};

export const profileContactInfoCommand: CommandDefinition = {
  name: 'profile_contact-info',
  group: 'profile',
  subcommand: 'contact-info',
  description: 'Get contact info (email, phone, websites) for a profile',
  mcpDescription:
    'Fetch a profile\'s contact info: email, phone numbers, websites, IM handles, birthday, address. Use when the user explicitly asks for contact details of someone. Input: public_id is the URL slug (e.g., "johndoe"), NOT a URN ID. Returns: { emailAddress, phoneNumbers: [], websites: [], ims: [], twitterHandles: [] }. Only fields the profile has shared are populated.',
  examples: ['linkedin profile contact-info johndoe'],

  inputSchema: z.object({
    public_id: z.string().describe('Public profile identifier'),
  }),

  cliMappings: {
    args: [{ field: 'public_id', name: 'public-id', required: true }],
  },

  handler: async (input, client) => {
    return client.get(
      `/identity/profiles/${encodeURIComponent(input.public_id)}/profileContactInfo`,
    );
  },
};

export const profileSkillsCommand: CommandDefinition = {
  name: 'profile_skills',
  group: 'profile',
  subcommand: 'skills',
  description: 'List skills for a profile',
  mcpDescription:
    'List skills declared on a profile along with endorsement counts. Use when comparing skill match or reviewing expertise. Input: public_id is the URL slug, NOT a URN ID; limit defaults to 100. Returns: { elements: [{ name, standardizedSkillUrn, endorsementCount }], paging }.',
  examples: ['linkedin profile skills johndoe'],

  inputSchema: z.object({
    public_id: z.string().describe('Public profile identifier'),
    limit: z.coerce.number().min(1).max(100).default(100).describe('Number of skills'),
  }),

  cliMappings: {
    args: [{ field: 'public_id', name: 'public-id', required: true }],
    options: [
      { field: 'limit', flags: '-l, --limit <number>', description: 'Number of skills to return' },
    ],
  },

  handler: async (input, client) => {
    return client.get(`/identity/profiles/${encodeURIComponent(input.public_id)}/skills`, {
      count: input.limit,
      start: 0,
    });
  },
};

export const profileNetworkCommand: CommandDefinition = {
  name: 'profile_network',
  group: 'profile',
  subcommand: 'network',
  description: 'Get network info (connections, followers, distance) for a profile',
  mcpDescription:
    'Fetch network stats for a profile: connection count, follower count, distance from the current user (1st, 2nd, 3rd). Use to decide whether a connection request is appropriate or to gauge reach. Input: public_id is the URL slug, NOT a URN ID. Returns: { connectionsCount, followersCount, followable, following, distance: { value: "DISTANCE_1" | "DISTANCE_2" | ... } }.',
  examples: ['linkedin profile network johndoe'],

  inputSchema: z.object({
    public_id: z.string().describe('Public profile identifier'),
  }),

  cliMappings: {
    args: [{ field: 'public_id', name: 'public-id', required: true }],
  },

  handler: async (input, client) => {
    return client.get(`/identity/profiles/${encodeURIComponent(input.public_id)}/networkinfo`);
  },
};

export const profileBadgesCommand: CommandDefinition = {
  name: 'profile_badges',
  group: 'profile',
  subcommand: 'badges',
  description: 'Get member badges (premium, influencer, job seeker) for a profile',
  mcpDescription:
    'Fetch a profile\'s member badges: premium, influencer, open-to-work / job-seeker, hiring. Use to detect if someone is open to opportunities before sending a recruiting message. Input: public_id is the URL slug, NOT a URN ID. Returns: { premium, influencer, openLink, jobSeeker, hiring }.',
  examples: ['linkedin profile badges johndoe'],

  inputSchema: z.object({
    public_id: z.string().describe('Public profile identifier'),
  }),

  cliMappings: {
    args: [{ field: 'public_id', name: 'public-id', required: true }],
  },

  handler: async (input, client) => {
    return client.get(`/identity/profiles/${encodeURIComponent(input.public_id)}/memberBadges`);
  },
};

export const profilePrivacyCommand: CommandDefinition = {
  name: 'profile_privacy',
  group: 'profile',
  subcommand: 'privacy',
  description: 'Get privacy settings for a profile',
  mcpDescription:
    'Fetch visibility/privacy settings for a profile: who can see connections, contact info visibility, public profile visibility flags. Use rarely — usually only when troubleshooting why another tool returned empty fields. Input: public_id is the URL slug, NOT a URN ID. Returns: { showPublicProfile, allowOpenProfile, allowProfileEditConfirmation, ... }.',
  examples: ['linkedin profile privacy johndoe'],

  inputSchema: z.object({
    public_id: z.string().describe('Public profile identifier'),
  }),

  cliMappings: {
    args: [{ field: 'public_id', name: 'public-id', required: true }],
  },

  handler: async (input, client) => {
    return client.get(`/identity/profiles/${encodeURIComponent(input.public_id)}/privacySettings`);
  },
};

export const profilePostsCommand: CommandDefinition = {
  name: 'profile_posts',
  group: 'profile',
  subcommand: 'posts',
  description: 'List recent posts from a profile',
  mcpDescription:
    'List recent posts authored by a specific profile (their member share feed). Use when asked about somebody else\'s recent activity/posts. IMPORTANT: urn_id is the full tail segment of urn:li:fsd_profile:<id> (typically alphanumeric, e.g. "ACoAAB..."), NOT the URL slug and NOT digits-only — to obtain it from a public ID, call profile_view first and read miniProfile.entityUrn. Returns: { elements: [{ updateMetadata, content, socialDetail }], paging }.',
  examples: [
    'linkedin profile posts johndoe',
    'linkedin profile posts johndoe --limit 50',
  ],

  inputSchema: z.object({
    urn_id: z.string().describe('Profile URN ID — full tail of urn:li:fsd_profile:<id> (alphanumeric, e.g. "ACoAAB..."), not the URL slug'),
    limit: z.coerce.number().min(1).max(100).default(10).describe('Number of posts'),
    start: z.coerce.number().default(0).describe('Offset for pagination'),
  }),

  cliMappings: {
    args: [{ field: 'urn_id', name: 'urn-id', required: true }],
    options: [
      { field: 'limit', flags: '-l, --limit <number>', description: 'Number of posts' },
      { field: 'start', flags: '--start <number>', description: 'Pagination offset' },
    ],
  },

  handler: async (input, client) => {
    return client.get('/identity/profileUpdatesV2', {
      count: input.limit,
      start: input.start,
      q: 'memberShareFeed',
      moduleKey: 'member-shares:phone',
      includeLongTermHistory: true,
      profileUrn: `urn:li:fsd_profile:${input.urn_id}`,
    });
  },

  summarize: summarizePostsList,
};

export const profileDisconnectCommand: CommandDefinition = {
  name: 'profile_disconnect',
  group: 'profile',
  subcommand: 'disconnect',
  description: 'Remove a connection (unfriend) by public ID',
  mcpDescription:
    'Disconnect from someone (remove an existing 1st-degree connection). DESTRUCTIVE and not reversible without re-sending an invite. Use only when the user explicitly says "disconnect" or "remove connection". Input: public_id is the URL slug, NOT a URN ID. This is functionally equivalent to connections_remove. Returns the disconnect action result.',
  examples: ['linkedin profile disconnect johndoe'],

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

export const profileCommands = [
  profileViewCommand,
  profileMeCommand,
  profileContactInfoCommand,
  profileSkillsCommand,
  profileNetworkCommand,
  profileBadgesCommand,
  profilePrivacyCommand,
  profilePostsCommand,
  profileDisconnectCommand,
];
