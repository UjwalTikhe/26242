/**
 * Shared primitives used across every contract schema.
 * Person A (frontend) and Person B (backend) both import from @sih/contracts.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Identifiers & time                                                  */
/* ------------------------------------------------------------------ */

/** Client-generated UUID (v4). The mobile/PWA creates ids offline. */
export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

/** ISO-8601 timestamp, timezone offset allowed (e.g. +05:30). */
export const DateTime = z.iso.datetime({ offset: true });
export type DateTime = z.infer<typeof DateTime>;

/** Optimistic-concurrency / last-write-wins version counter. */
export const Version = z.number().int().min(0);
export type Version = z.infer<typeof Version>;

export const IdempotencyKey = z.string().min(8).max(200);
export type IdempotencyKey = z.infer<typeof IdempotencyKey>;

/* ------------------------------------------------------------------ */
/* Localisation                                                        */
/* ------------------------------------------------------------------ */

export const LANGUAGES = ['en', 'hi', 'mr'] as const;
export const Language = z.enum(LANGUAGES);
export type Language = z.infer<typeof Language>;
export type LanguageCode = (typeof LANGUAGES)[number];

/** English required, Hindi/Marathi optional. Voice-first UI reads these aloud. */
export const LocalizedText = z.object({
  en: z.string().min(1),
  hi: z.string().min(1).optional(),
  mr: z.string().min(1).optional(),
});
export type LocalizedText = z.infer<typeof LocalizedText>;

/* ------------------------------------------------------------------ */
/* Geo / device (evidence integrity)                                   */
/* ------------------------------------------------------------------ */

export const GeoPoint = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(),
  source: z.enum(['gps', 'network', 'manual']).default('gps'),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const Timestamps = z.object({
  createdAt: DateTime,
  updatedAt: DateTime,
});
export type Timestamps = z.infer<typeof Timestamps>;

/** Standard envelope for list responses. */
export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
  });
}
