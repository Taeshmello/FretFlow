import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createAuth } from './auth/auth.ts';
import { createPostgresDb } from './db/client.ts';
import { loadEnv } from './env.ts';
import { createHttpEmailSender } from './lib/email.ts';
import { createLogger } from './lib/logger.ts';
import { runMaintenance, startMaintenance } from './lib/maintenance.ts';
import { createS3Storage } from './lib/storage.ts';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const { db, close } = createPostgresDb(env.DATABASE_URL);

const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  webOrigins: env.WEB_ORIGIN,
  google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
  email: createHttpEmailSender({ url: env.EMAIL_PROVIDER_URL, apiKey: env.EMAIL_PROVIDER_API_KEY, from: env.EMAIL_FROM }),
  logger,
  secureCookies: env.NODE_ENV === 'production' || env.BETTER_AUTH_URL.startsWith('https://'),
});

const storage = createS3Storage({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

const app = createApp({
  db,
  auth,
  logger,
  webOrigins: env.WEB_ORIGIN,
  clientIpHeader: env.CLIENT_IP_HEADER,
  audioLimits: { quotaBytes: env.AUDIO_QUOTA_BYTES, maxPending: env.AUDIO_MAX_PENDING },
  storage,
});

// Daily cleanup (trash > 30 days, unfinished uploads > 1 day). Safe with several instances.
const stopMaintenance = startMaintenance(() => runMaintenance({ db, storage, logger }), { logger });

const server = serve({ fetch: app.fetch, port: env.PORT }, info => {
  logger.info({ port: info.port }, 'api listening');
});

function shutdown() {
  stopMaintenance();
  server.close(() => {
    void close().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
