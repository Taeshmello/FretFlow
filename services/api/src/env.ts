import { z } from 'zod';

const csv = z
  .string()
  .min(1)
  .transform(s => s.split(',').map(v => v.trim()).filter(Boolean))
  .pipe(z.array(z.url()).min(1));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: csv,
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  EMAIL_PROVIDER_API_KEY: z.string().min(1),
  /** Resend-compatible JSON endpoint: POST { from, to, subject, text, html }. */
  EMAIL_PROVIDER_URL: z.url().default('https://api.resend.com/emails'),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** Force path-style bucket URLs (MinIO). R2 works with either. */
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  SENTRY_DSN: z.string().optional(),
  /** Per-user audio storage cap (default 2GB) and unfinished-upload cap. */
  AUDIO_QUOTA_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024 * 1024),
  AUDIO_MAX_PENDING: z.coerce.number().int().positive().default(20),
  /**
   * Header the hosting proxy sets to the real client IP, overwriting any value
   * the client sent (e.g. "fly-client-ip"). Required in production. Unset in
   * development = socket address. X-Forwarded-For is refused: proxies append to
   * it, so its first entry is whatever the client wrote.
   */
  CLIENT_IP_HEADER: z
    .string()
    .transform(v => v.trim().toLowerCase())
    .refine(v => v.length > 0 && v !== 'x-forwarded-for', 'must be a proxy-overwritten header, not x-forwarded-for')
    .optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && !env.CLIENT_IP_HEADER) {
    ctx.addIssue({ code: 'custom', path: ['CLIENT_IP_HEADER'], message: 'required in production' });
  }
});

export type Env = z.infer<typeof envSchema>;

/** Parses env vars and throws on anything missing. Never echoes values, only key names. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map(i => i.path.join('.')))];
    throw new Error(`Invalid or missing environment variables: ${keys.join(', ')}`);
  }
  return result.data;
}
