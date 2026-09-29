import { createScore } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { suggestNextNotes } from './soloGuide';

describe('solo guide', () => {
  it('requires explicit chord context and never claims to be generated AI', () => {
    const score = createScore();
    const cursor = { trackId: score.tracks[0].id, barIndex: 0, beatIndex: 0, string: 1 };
    expect(suggestNextNotes(score, cursor).notes).toEqual([]);
    score.tracks[0].bars[0].beats[0].chord = 'Am7';
    const guide = suggestNextNotes(score, cursor);
    expect(guide.chord).toBe('Am7');
    expect(guide.notes.some(n => n.kind === 'chord')).toBe(true);
    expect(guide.notes.every(n => n.string >= 1 && n.string <= 6 && n.fret >= 0 && n.fret <= 15)).toBe(true);
    expect(guide.notes.filter(n => n.kind === 'chord').every(n => [9, 0, 4, 7].includes(n.pitch % 12))).toBe(true);
  });

  it('fails closed on an unsupported chord instead of showing misleading notes', () => {
    const score = createScore();
    score.tracks[0].bars[0].beats[0].chord = 'Cadd#11';
    const guide = suggestNextNotes(score, { trackId: score.tracks[0].id, barIndex: 0, beatIndex: 0, string: 1 });
    expect(guide.notes).toEqual([]);
  });
});
