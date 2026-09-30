import { describe, expect, it } from 'vitest';
import { cloneBeat, createScore } from './create';
import { DRUM_PIECES, createDrumHit, createKeyNote, drumPieceForMidi, isFretted } from './instruments';
import { findBeat } from './locate';
import { applyOps, deleteOp, insertOp, invert, setOp } from './ops';
import { validateScore } from './validate';

describe('instrument helpers', () => {
  it('tells fretted instruments from piano and drums', () => {
    expect(isFretted('guitar')).toBe(true);
    expect(isFretted('bass')).toBe(true);
    expect(isFretted('piano')).toBe(false);
    expect(isFretted('drums')).toBe(false);
  });

  it('maps every drum piece to a unique General MIDI percussion number and back', () => {
    const numbers = Object.values(DRUM_PIECES).map(p => p.midi);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(DRUM_PIECES.kick.midi).toBe(36);
    expect(DRUM_PIECES.snare.midi).toBe(38);
    expect(drumPieceForMidi(42)).toBe('hihatClosed');
    expect(drumPieceForMidi(35)).toBe('kick'); // acoustic bass drum folds into kick
    expect(drumPieceForMidi(12)).toBeNull();
  });
});

describe('piano keys and drum hits as ops', () => {
  it('inserts, updates and inverts piano keys on a beat', () => {
    const score = createScore({ instrument: 'piano', bars: 1 });
    const beat = score.tracks[0].bars[0].beats[0];
    const key = createKeyNote(60);
    const ops = [setOp(score, beat.id, ['rest'], false), insertOp('key', beat.id, 0, key)];
    const edited = applyOps(score, ops);
    expect(findBeat(edited, beat.id)?.keys?.map(k => k.pitch)).toEqual([60]);
    const moved = applyOps(edited, [setOp(edited, key.id, ['pitch'], 62)]);
    expect(findBeat(moved, beat.id)?.keys?.[0].pitch).toBe(62);
    const back = applyOps(edited, invert({ id: 't', ops, label: '', at: 0 }).ops);
    expect(back).toEqual(score);
    expect(validateScore(edited)).toEqual([]);
  });

  it('deletes a drum hit by id and restores it through invert', () => {
    const score = createScore({ instrument: 'drums', bars: 1 });
    const beat = score.tracks[0].bars[0].beats[0];
    const hit = createDrumHit('snare');
    const withHit = applyOps(score, [setOp(score, beat.id, ['rest'], false), insertOp('hit', beat.id, 0, hit)]);
    const del = deleteOp(withHit, hit.id);
    const gone = applyOps(withHit, [del]);
    expect(findBeat(gone, beat.id)?.hits).toBeUndefined();
    expect(applyOps(gone, invert({ id: 't', ops: [del], label: '', at: 0 }).ops)).toEqual(withHit);
  });

  it('gives cloned beats fresh ids for keys and hits', () => {
    const key = createKeyNote(64);
    const beat = { id: 'b', duration: { base: 4 as const, dots: 0 as const }, rest: false, notes: [], keys: [key] };
    expect(cloneBeat(beat).keys?.[0].id).not.toBe(key.id);
    expect(cloneBeat(beat).keys?.[0].pitch).toBe(64);
  });
});

describe('validateScore for piano and drums', () => {
  function withBeat<T>(instrument: 'piano' | 'drums' | 'guitar', patch: (beat: ReturnType<typeof createScore>['tracks'][0]['bars'][0]['beats'][0]) => T) {
    const score = createScore({ instrument, bars: 1 });
    const beat = score.tracks[0].bars[0].beats[0];
    beat.rest = false;
    patch(beat);
    return validateScore(score).map(i => i.code);
  }

  it('rejects the same key twice in one beat and keys outside the piano range', () => {
    expect(withBeat('piano', b => (b.keys = [createKeyNote(60), createKeyNote(60)]))).toContain('duplicateKey');
    expect(withBeat('piano', b => (b.keys = [createKeyNote(10)]))).toContain('keyRange');
  });

  it('rejects the same drum piece twice in one beat', () => {
    expect(withBeat('drums', b => (b.hits = [createDrumHit('kick'), createDrumHit('kick')]))).toContain('duplicateHit');
  });

  it('keeps each instrument to its own kind of notes', () => {
    expect(withBeat('guitar', b => (b.keys = [createKeyNote(60)]))).toContain('wrongNoteKind');
    expect(withBeat('piano', b => (b.hits = [createDrumHit('kick')]))).toContain('wrongNoteKind');
  });

  it('allows the sustain pedal on piano tracks only', () => {
    expect(withBeat('piano', b => (b.pedal = 'down'))).toEqual([]);
    expect(withBeat('guitar', b => (b.pedal = 'down'))).toContain('pedal');
    expect(withBeat('piano', b => ((b as { pedal?: string }).pedal = 'half'))).toContain('pedal');
  });

  it('flags a rest that still has keys or hits', () => {
    const score = createScore({ instrument: 'piano', bars: 1 });
    score.tracks[0].bars[0].beats[0].keys = [createKeyNote(60)];
    expect(validateScore(score).map(i => i.code)).toContain('restWithNotes');
  });
});
