import { createNote, createScore, type Score } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { barsWithNotes, buildPosthogEvent, buildSentryEnvelope, parseDsn } from './telemetry';

function withNotesInBars(count: number): Score {
  const score = createScore({ bars: 20 });
  const track = score.tracks[0];
  for (let i = 0; i < count; i++) {
    const beat = track.bars[i].beats[0];
    beat.rest = false;
    beat.notes = [createNote(track, 1, 3)];
  }
  return score;
}

describe('telemetry payloads', () => {
  it('builds a PostHog capture event without personal data', () => {
    const e = buildPosthogEvent('phc_key', 'anon-1', 'score_created', { bars: 8 }, new Date('2026-09-29T00:00:00Z'));
    expect(e).toEqual({
      api_key: 'phc_key',
      event: 'score_created',
      distinct_id: 'anon-1',
      properties: { bars: 8, $lib: 'fretflow-web' },
      timestamp: '2026-09-29T00:00:00.000Z',
    });
  });

  it('parses a Sentry DSN into the envelope endpoint', () => {
    expect(parseDsn('https://abc123@o1.ingest.sentry.io/4507')).toEqual({
      endpoint: 'https://o1.ingest.sentry.io/api/4507/envelope/?sentry_key=abc123&sentry_version=7',
      dsn: 'https://abc123@o1.ingest.sentry.io/4507',
    });
    expect(parseDsn('not a dsn')).toBeNull();
  });

  it('builds a three-line Sentry envelope for an error', () => {
    const err = new TypeError('boom');
    const text = buildSentryEnvelope('https://k@h.io/1', err, 'evt1', new Date('2026-09-29T00:00:00Z'));
    const [header, item, event] = text.split('\n').map(l => JSON.parse(l));
    expect(header).toEqual({ event_id: 'evt1', sent_at: '2026-09-29T00:00:00.000Z', dsn: 'https://k@h.io/1' });
    expect(item).toEqual({ type: 'event' });
    expect(event.exception.values[0]).toMatchObject({ type: 'TypeError', value: 'boom' });
    expect(event.level).toBe('error');
  });
});

describe('barsWithNotes', () => {
  it('counts bars that contain at least one note (the 16-bar milestone)', () => {
    expect(barsWithNotes(withNotesInBars(0))).toBe(0);
    expect(barsWithNotes(withNotesInBars(16))).toBe(16);
  });
});
