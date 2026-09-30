import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins/magic-link';
import type { Db } from '../db/client.ts';
import { schema } from '../db/client.ts';
import type { EmailSender } from '../lib/email.ts';
import type { Logger } from '../lib/logger.ts';

export interface AuthConfig {
  db: Db;
  secret: string;
  baseURL: string;
  webOrigins: string[];
  google?: { clientId: string; clientSecret: string };
  email: EmailSender;
  logger: Logger;
  /** Secure cookies. On everywhere except local http development and tests. */
  secureCookies: boolean;
}

export function createAuth(config: AuthConfig) {
  const log = config.logger.child({ module: 'better-auth' });
  return betterAuth({
    baseURL: config.baseURL,
    basePath: '/api/auth',
    secret: config.secret,
    trustedOrigins: config.webOrigins,
    database: drizzleAdapter(config.db, {
      provider: 'pg',
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    socialProviders: config.google
      ? { google: { clientId: config.google.clientId, clientSecret: config.google.clientSecret } }
      : {},
    // Email + password (hashing, sessions and checks are Better Auth's; scrypt by default).
    // The magic link stays as the way back in for a forgotten password.
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 10,
        storeToken: 'hashed',
        async sendMagicLink({ email, url }) {
          await config.email.send({
            to: email,
            subject: 'Sign in to FretFlow',
            text: `Sign in to FretFlow: ${url}\n\nThis link expires in 10 minutes. If you did not request it, ignore this email.`,
            html: `<p><a href="${url}">Sign in to FretFlow</a></p><p>This link expires in 10 minutes. If you did not request it, ignore this email.</p>`,
          });
        },
      }),
    ],
    // Login rate limiting is done by our own limiter in app.ts (injectable in tests).
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    advanced: {
      useSecureCookies: config.secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: config.secureCookies },
    },
    // Forward only the message: Better Auth may pass user objects as extra args.
    logger: {
      log(level, message) {
        log[level](message);
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
