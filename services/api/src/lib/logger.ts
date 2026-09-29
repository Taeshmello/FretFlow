import { pino, type Logger } from 'pino';

export type { Logger };

// Belt and braces: no code path should log these, but redact them if one does.
const REDACT = [
  'email',
  '*.email',
  'token',
  '*.token',
  'password',
  '*.password',
  'headers.cookie',
  'headers.authorization',
  'req.headers.cookie',
  'req.headers.authorization',
  '*.secret',
];

export function createLogger(level: string = 'info'): Logger {
  return pino({ level, redact: { paths: REDACT, censor: '[redacted]' } });
}

export function silentLogger(): Logger {
  return pino({ level: 'silent' });
}
