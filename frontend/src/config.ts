// Central app config. Change the working name here (manifest, header, SEO all read it).
export const APP_NAME = 'DakshSetu';
export const APP_NAME_HI = 'दक्षसेतु';
export const APP_TAGLINE = 'Skilled. Verified.';
export const SIH_HINT = 'Smart India Hackathon 2026 · Problem SIH26242';

/**
 * API origin. Empty in dev — requests are same-origin relative paths
 * (`/api/v1/...`) that the Vite proxy forwards to the backend on :4000.
 * In production set VITE_API_URL to the API origin (e.g.
 * `https://api.dakshsetu.gov.in`); never include a trailing `/api`.
 */
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

/** Origin used for public QR / verify links and PDF downloads. */
export const PUBLIC_BASE_URL =
  (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined) ?? window.location.origin;

/** Offline outbox reliability knobs. */
export const SYNC_FLUSH_INTERVAL_MS = 20000;
export const SYNC_MAX_BATCH = 50;
export const SYNC_MAX_ATTEMPTS = 5;

export const APP_VERSION = '0.1.0';
export const DEVICE_ID_KEY = 'dakshsetu.deviceId';