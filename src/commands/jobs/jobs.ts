import { z } from 'zod';
import type { CommandDefinition } from '../../core/types.js';

export const jobsViewCommand: CommandDefinition = {
  name: 'jobs_view',
  group: 'jobs',
  subcommand: 'view',
  description: 'View job posting details by job ID',
  mcpDescription:
    'Fetch full details for a single job posting (title, description, location, salary, company, applicant insights, posted date). Input: job_id is the numeric posting ID (the tail of urn:li:fsd_jobPosting:<id>), found in search_jobs results or LinkedIn URLs like /jobs/view/<job_id>. Returns: { title, description: { text }, formattedLocation, listedAt, companyDetails, workplaceTypes, applies }.',
  examples: ['linkedin jobs view 3456789012'],

  inputSchema: z.object({
    job_id: z.string().describe('Job posting ID'),
  }),

  cliMappings: {
    args: [{ field: 'job_id', name: 'job-id', required: true }],
  },

  handler: async (input, client) => {
    return client.get(`/jobs/jobPostings/${input.job_id}`, {
      decorationId: 'com.linkedin.voyager.deco.jobs.web.shared.WebLightJobPosting-23',
    });
  },
};

export const jobsSkillsCommand: CommandDefinition = {
  name: 'jobs_skills',
  group: 'jobs',
  subcommand: 'skills',
  description: 'Get skill match insights for a job posting',
  mcpDescription:
    'Fetch skill-match insight for a job posting: which of the user\'s declared skills match the job, which are missing. Input: job_id is the numeric posting ID (same value passed to jobs_view). Use to answer "am I a fit for this job" or "what skills am I missing". Returns: { matchingSkills: [...], missingSkills: [...], skillMatchScore }.',
  examples: ['linkedin jobs skills 3456789012'],

  inputSchema: z.object({
    job_id: z.string().describe('Job posting ID'),
  }),

  cliMappings: {
    args: [{ field: 'job_id', name: 'job-id', required: true }],
  },

  handler: async (input, client) => {
    const urn = encodeURIComponent(`urn:li:fsd_jobSkillMatchInsight:${input.job_id}`);
    return client.get(`/voyagerAssessmentsDashJobSkillMatchInsight/${urn}`, {
      decorationId: 'com.linkedin.voyager.dash.deco.assessments.FullJobSkillMatchInsight-17',
    });
  },
};

export const jobsCommands = [
  jobsViewCommand,
  jobsSkillsCommand,
];
