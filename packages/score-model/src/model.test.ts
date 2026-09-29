import { describe, expect, it } from 'vitest';
import { cloneWithNewIds, createNote, createScore, createTrack } from './create';
import { migrateScore, MigrationError } from './migrate';
import { fretFor, pitchName, pitchOf } from './pitch';
import { barFill } from './time';
import { validateScore } from './validate';

describe('createScore', () => {
  it('creates a valid 4-bar guitar score in standard tuning by default', () => {
    const score = createScore();
    expect(score.masterBars).toHaveLength(4);
    expect(score.tracks[0].tuning).toEqual([64, 59, 55, 50, 45, 40]);
    expect(score.masterBars[0].tempo).toBe(120);
    expect(validateScore(score)).toEqual([]);
  });

  it('fills every bar with rests so it is full from the start', () => {
    const score = createScore({ timeSig: [3, 4] });
    const bar = score.tracks[0].bars[0];
    expect(bar.beats.every(b => b.rest)).toBe(true);
    expect(barFill(bar, score.masterBars[0]).state).toBe('full');
  });

  it('gives every node a unique id', () => {
    const score = createScore({ bars: 50 });
    const ids = [score.id, ...score.masterBars.map(m => m.id), ...score.tracks[0].bars.flatMap(b => [b.id, ...b.beats.map(x => x.id)])];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses bass standard tuning for a bass track', () => {
    const score = createScore({ instrument: 'bass' });
    expect(score.tracks[0].tuning).toEqual([43, 38, 33, 28]);
  });
});

describe('pitch', () => {
  const track = { tuning: [64, 59, 55, 50, 45, 40], capo: 2, maxFret: 24 };

  it('adds tuning, capo and fret', () => {
    expect(pitchOf(track, 6, 0)).toBe(42);
    expect(pitchOf(track, 1, 3)).toBe(69);
  });

  it('finds the fret for a pitch or null when out of range', () => {
    expect(fretFor(track, 1, 69)).toBe(3);
    expect(fretFor(track, 1, 40)).toBeNull();
  });

  it('names pitches with octave numbers', () => {
    expect(pitchName(64)).toBe('E4');
    expect(pitchName(40)).toBe('E2');
  });
});

describe('validateScore', () => {
  it('flags a duplicate string in one beat', () => {
    const score = createScore();
    const track = score.tracks[0];
    const beat = track.bars[0].beats[0];
    beat.rest = false;
    beat.notes.push(createNote(track, 1, 0), createNote(track, 1, 2));
    expect(validateScore(score).map(i => i.code)).toContain('duplicateString');
  });

  it('flags an out-of-range fret and a stale pitch', () => {
    const score = createScore();
    const track = score.tracks[0];
    const beat = track.bars[0].beats[0];
    beat.rest = false;
    beat.notes.push({ ...createNote(track, 2, 0), fret: 30 });
    const codes = validateScore(score).map(i => i.code);
    expect(codes).toContain('fretRange');
    expect(codes).toContain('pitchMismatch');
  });

  it('flags a track whose bar count differs from the master bars', () => {
    const score = createScore({ bars: 2 });
    score.tracks.push(createTrack(score.masterBars.slice(0, 1)));
    expect(validateScore(score).map(i => i.code)).toContain('barCount');
  });

  it('flags duplicate ids', () => {
    const score = createScore();
    score.masterBars[1].id = score.masterBars[0].id;
    expect(validateScore(score).map(i => i.code)).toContain('duplicateId');
  });
});

describe('cloneWithNewIds', () => {
  it('keeps the music but changes every id', () => {
    const score = createScore({ bars: 2 });
    const copy = cloneWithNewIds(score);
    expect(copy.id).not.toBe(score.id);
    expect(copy.tracks[0].bars[0].masterBarId).toBe(copy.masterBars[0].id);
    expect(validateScore(copy)).toEqual([]);
  });
});

describe('migrateScore', () => {
  it('accepts a version 1 score and rejects anything else', () => {
    const score = createScore();
    expect(migrateScore(JSON.parse(JSON.stringify(score)))).toEqual(score);
    expect(() => migrateScore({ schemaVersion: 9 })).toThrow(MigrationError);
    expect(() => migrateScore(null)).toThrow(MigrationError);
  });
});
