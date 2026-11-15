/**
 * Input validation (zod). The same profile schema validates the profile form on save
 * and the body of the stateless /api/match endpoint. Opportunity data is validated
 * when it is loaded, so a malformed data file fails fast with a clear message.
 */
import { z } from 'zod';
import { EDUCATION_LEVELS, LANGUAGE_LEVELS, REGIONS } from '../matching/taxonomy.js';

const educationLevel = z.enum(Object.keys(EDUCATION_LEVELS));
const languageLevel = z.enum(Object.keys(LANGUAGE_LEVELS));

const text = (max) => z.string().trim().max(max, `Must be ${max} characters or fewer`);
const tag = text(60).min(1, 'Cannot be empty');

/** List of short tags, trimmed and de-duplicated case-insensitively. */
const tagList = (max, label) =>
  z
    .array(tag, { invalid_type_error: `${label} must be a list` })
    .max(max, `Add at most ${max} ${label.toLowerCase()}`)
    .transform((list) => {
      const seen = new Set();
      return list.filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

export const profileSchema = z
  .object({
    displayName: text(80).optional().default(''),
    education: z
      .object({
        level: educationLevel.nullable().optional().default(null),
        field: text(100).optional().default(''),
        currentlyEnrolled: z.enum(['yes', 'no', 'unknown']).optional().default('unknown'),
      })
      .strict(),
    experience: z
      .object({
        totalYears: z
          .number({ invalid_type_error: 'Years of experience must be a number' })
          .min(0, 'Years of experience cannot be negative')
          .max(60, 'Years of experience looks too high')
          .nullable()
          .optional()
          .default(null),
        areas: tagList(20, 'Experience areas').optional().default([]),
        summary: text(1000).optional().default(''),
      })
      .strict(),
    skills: tagList(50, 'Skills').refine((l) => l.length > 0, 'Add at least one skill'),
    languages: z
      .array(z.object({ language: tag, level: languageLevel }).strict())
      .min(1, 'Add at least one language')
      .max(15, 'Add at most 15 languages')
      .refine(
        (list) => new Set(list.map((l) => l.language.toLowerCase())).size === list.length,
        'Each language should only be listed once',
      ),
    preferredLocations: tagList(20, 'Preferred locations').optional().default([]),
    openToRemote: z.boolean().optional().default(false),
    careerInterests: tagList(20, 'Career interests').optional().default([]),
    currentCountry: text(60).optional().default(''),
    workAuthorisation: z
      .object({
        status: z.enum(['unknown', 'specified']),
        countries: tagList(30, 'Countries').optional().default([]),
      })
      .strict()
      .refine((v) => v.status === 'unknown' || v.countries.length > 0, {
        message: 'List at least one country, or choose "Not specified"',
        path: ['countries'],
      })
      .optional()
      .default({ status: 'unknown', countries: [] }),
  })
  .strict();

const languageRequirement = z
  .object({ language: tag, level: languageLevel, required: z.boolean().optional().default(true) })
  .strict();

export const opportunitySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: tag.max(120),
    organisation: text(120).min(1),
    type: z.enum(['job', 'internship', 'contract']),
    location: z
      .object({
        city: z.string().nullable(),
        country: z.string().nullable(),
        region: z.string().nullable(),
        workMode: z.enum(['onsite', 'hybrid', 'remote']),
      })
      .strict()
      .refine((l) => l.workMode === 'remote' || l.country, 'Non-remote roles need a country'),
    description: text(2000),
    requiredSkills: z.array(tag),
    preferredSkills: z.array(tag).optional().default([]),
    experience: z
      .object({
        minYears: z.number().min(0).nullable(),
        maxYears: z.number().min(0).nullable(),
        areas: z.array(tag).optional().default([]),
      })
      .strict()
      .nullable()
      .refine((e) => !e || e.minYears == null || e.maxYears == null || e.minYears <= e.maxYears, 'minYears > maxYears'),
    education: z
      .object({ minLevel: educationLevel.nullable(), fields: z.array(tag).optional().default([]) })
      .strict()
      .nullable(),
    languages: z.array(languageRequirement),
    categories: z.array(tag),
    eligibility: z
      .object({
        workAuthorisationRequired: z.boolean(),
        visaSponsorship: z.enum(['available', 'not_available', 'unknown']).optional(),
        enrolledStudentRequired: z.boolean().optional(),
        residenceRegion: z.enum(Object.keys(REGIONS)).optional(),
        otherRequirements: z.array(z.string()).optional(),
      })
      .strict(),
    salary: z.string().optional(),
    postedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const shortlistAddSchema = z.object({ opportunityId: z.string().min(1).max(40) }).strict();

export const shortlistStatusSchema = z.object({ status: z.enum(['saved', 'applied']) }).strict();

/** Convert a ZodError into a flat, UI-friendly list of { path, message }. */
export function formatIssues(error) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}
