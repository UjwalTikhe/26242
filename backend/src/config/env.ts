/**
 * Environment config: loads .env from cwd (backend/) and repo root,
 * validates with Zod, exports a frozen typed config object.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Load order: cwd/.env wins over repo-root/.env (dotenv does not override)
for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '.env')]) {
  if (existsSync(p)) dotenvConfig({ path: p });
}

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  MONGO_URI: z.string().default('mongodb://127.0.0.1:27017/sih_rpl'),
  REDIS_URL: z.string().optional().default(''),

  QUEUE_DRIVER: z.enum(['inline', 'bullmq', 'auto']).default('auto'),

  JWT_ACCESS_SECRET: z.string().min(8).default('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(8).default('dev-refresh-secret-change-me'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().default(30),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  OTP_PROVIDER: z.enum(['mock', 'firebase', 'msg91']).default('mock'),
  OTP_MOCK_CODE: z.string().optional().default(''),
  OTP_TTL_SEC: z.coerce.number().int().default(300),
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),
  MSG91_AUTH_KEY: z.string().optional().default(''),
  MSG91_SENDER_ID: z.string().optional().default(''),
  MSG91_TEMPLATE_ID: z.string().optional().default(''),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('./data/storage'),
  TUS_UPLOAD_DIR: z.string().default('./data/tus'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().default(524_288_000),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_PUBLIC_BASE_URL: z.string().optional().default(''),

  AI_MODE: z.enum(['auto', 'llm', 'mock']).default('auto'),
  LLM_BASE_URL: z.string().default('https://api.openai.com/v1'),
  LLM_API_KEY: z.string().optional().default(''),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_VISION_MODEL: z.string().default('gpt-4o-mini'),
  LLM_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  LLM_ASR_MODEL: z.string().default('whisper-1'),
  AI_CONFIDENCE_HUMAN_ROUTE: z.coerce.number().min(0).max(1).default(0.65),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment:\n${issues}`);
}

export const env: Env = Object.freeze(parsed.data);

/** True when a real LLM-backed flow should be attempted. */
export const llmEnabled = env.AI_MODE === 'llm' || (env.AI_MODE === 'auto' && env.LLM_API_KEY !== '');
/** Queue driver actually in use (auto resolves against REDIS_URL). */
export const effectiveQueueDriver: 'inline' | 'bullmq' =
  env.QUEUE_DRIVER === 'bullmq' || (env.QUEUE_DRIVER === 'auto' && env.REDIS_URL !== '')
    ? 'bullmq'
    : 'inline';
