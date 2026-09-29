import type { Score } from '@fretflow/score-model';

/**
 * Product analytics (PostHog) and error reports (Sentry) over their plain HTTP
 * APIs, so no SDK ships in the bundle. Both are off unless their key is set.
 * Events never carry score content, audio or e-mail addresses (D-009).
 */
const POSTHOG_KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ?? '';
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com';
const SENTRY_DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '';

export type EventName = 'signed_in' | 'score_created' | 'first_score' | 'score_imported' | 'reached_16_bars' | 'audio_connected' | 'loop_used';

export function buildPosthogEvent(apiKey: string, distinctId: string, event: EventName, properties: Record<string, string | number | boolean>, at: Date) {
  return { api_key: apiKey, event, distinct_id: distinctId, properties: { ...properties, $lib: 'fretflow-web' }, timestamp: at.toISOString() };
}

export function parseDsn(dsn: string): { endpoint: string; dsn: string } | null {
  const m = /^(https?):\/\/([^@/]+)@([^/]+)\/(\d+)$/.exec(dsn.trim());
  if (!m) {
    return null;
  }
  const [, scheme, key, host, project] = m;
  return { endpoint: `${scheme}://${host}/api/${project}/envelope/?sentry_key=${key}&sentry_version=7`, dsn };
}

export function buildSentryEnvelope(dsn: string, error: unknown, eventId: string, at: Date): string {
  const err = error instanceof Error ? error : new Error(String(error));
  const event = {
    event_id: eventId,
    timestamp: at.getTime() / 1000,
    platform: 'javascript',
    level: 'error',
    exception: { values: [{ type: err.name, value: err.message, ...(err.stack ? { stacktrace: { frames: [{ filename: 'app', function: err.stack.slice(0, 2000) }] } } : {}) }] },
  };
  return [JSON.stringify({ event_id: eventId, sent_at: at.toISOString(), dsn }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n');
}

/** Bars (in any track) that contain at least one note — for the "16 bars written" milestone. */
export function barsWithNotes(score: Score): number {
  let count = 0;
  for (let i = 0; i < score.masterBars.length; i++) {
    if (score.tracks.some(t => t.bars[i]?.beats.some(b => b.notes.length > 0))) {
      count++;
    }
  }
  return count;
}

function anonymousId(): string {
  try {
    const existing = localStorage.getItem('ff:anon');
    if (existing) {
      return existing;
    }
    const id = crypto.randomUUID();
    localStorage.setItem('ff:anon', id);
    return id;
  } catch {
    return 'anonymous';
  }
}

function once(key: string): boolean {
  try {
    if (localStorage.getItem(`ff:once:${key}`)) {
      return false;
    }
    localStorage.setItem(`ff:once:${key}`, '1');
    return true;
  } catch {
    return true;
  }
}

export function track(event: EventName, properties: Record<string, string | number | boolean> = {}, onceKey?: string): void {
  if (!POSTHOG_KEY || (onceKey && !once(onceKey))) {
    return;
  }
  const body = JSON.stringify(buildPosthogEvent(POSTHOG_KEY, anonymousId(), event, properties, new Date()));
  void fetch(`${POSTHOG_HOST}/i/v0/e/`, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
}

/** Fires "reached_16_bars" once per score. */
export function checkMilestones(score: Score): void {
  if (POSTHOG_KEY && barsWithNotes(score) >= 16) {
    track('reached_16_bars', {}, `16bars:${score.id}`);
  }
}

export function installErrorReporting(): void {
  const target = SENTRY_DSN ? parseDsn(SENTRY_DSN) : null;
  if (!target) {
    return;
  }
  const send = (error: unknown) => {
    const body = buildSentryEnvelope(target.dsn, error, crypto.randomUUID().replace(/-/g, ''), new Date());
    void fetch(target.endpoint, { method: 'POST', body, headers: { 'content-type': 'application/x-sentry-envelope' }, keepalive: true }).catch(() => {});
  };
  window.addEventListener('error', e => send(e.error ?? e.message));
  window.addEventListener('unhandledrejection', e => send(e.reason));
}
