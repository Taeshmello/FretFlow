import { barFill, createScore, validateScore, type Score } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { cursorBeat, cursorNote } from './cursor';
import { createEditor, execute, type Command, type EditorState } from './editor';

function run(state: EditorState, commands: (Command | [Command, number])[]): EditorState {
  let s = state;
  let t = 0;
  for (const c of commands) {
    const [cmd, at] = Array.isArray(c) ? c : [c, (t += 1000)];
    t = at;
    s = execute(s, cmd, at);
  }
  return s;
}

const digit = (d: number): Command => ({ type: 'digit', digit: d });
const fresh = (score: Score = createScore()) => createEditor(score);

describe('chord symbols', () => {
  it('stores a symbol on the selected beat and undoes consecutive typing together', () => {
    const initial = fresh();
    const beatId = initial.score.tracks[0].bars[0].beats[0].id;
    const typed = run(initial, [
      [{ type: 'setChord', beatId, chord: 'A' }, 100],
      [{ type: 'setChord', beatId, chord: 'Am7' }, 200],
    ]);
    expect(cursorBeat(typed.score, typed.cursor)?.chord).toBe('Am7');
    const undone = run(typed, [{ type: 'undo' }]);
    expect(cursorBeat(undone.score, undone.cursor)?.chord).toBeUndefined();
  });

  it('keeps symbols on their beats when the cursor moves and allows clearing them', () => {
    const initial = fresh();
    const beatId = initial.score.tracks[0].bars[0].beats[0].id;
    const edited = run(initial, [
      { type: 'moveBeat', delta: 1 },
      { type: 'setChord', beatId, chord: 'G/B' },
      { type: 'setChord', beatId, chord: '' },
    ]);
    expect(edited.score.tracks[0].bars[0].beats[0].chord).toBeUndefined();
    expect(cursorBeat(edited.score, edited.cursor)?.chord).toBeUndefined();
  });
});

describe('lyrics and display-only instruments', () => {
  it('edits lyrics on a beat and merges typing into one undo step', () => {
    const initial = fresh();
    const beatId = initial.score.tracks[0].bars[0].beats[0].id;
    const typed = run(initial, [[{ type: 'setLyric', beatId, lyric: 'Hel' }, 100], [{ type: 'setLyric', beatId, lyric: 'Hello' }, 200]]);
    expect(typed.score.tracks[0].bars[0].beats[0].lyric).toBe('Hello');
    expect(run(typed, [{ type: 'undo' }]).score.tracks[0].bars[0].beats[0].lyric).toBeUndefined();
  });

  it('keeps piano and drums valid without pretending fret input works', () => {
    for (const instrument of ['piano', 'drums'] as const) {
      const initial = fresh(createScore({ instrument }));
      expect(validateScore(initial.score)).toEqual([]);
      expect(run(initial, [digit(4)]).score).toEqual(initial.score);
      expect(run(initial, [{ type: 'placeFret', string: 1, fret: 4 }]).score).toEqual(initial.score);
      expect(initial.cursor.string).toBe(1);
    }
  });
});

describe('fret input (SPEC §5.3)', () => {
  it('enters a digit immediately and clears the rest', () => {
    const s = run(fresh(), [digit(5)]);
    expect(cursorNote(s.score, s.cursor)?.fret).toBe(5);
    expect(cursorBeat(s.score, s.cursor)?.rest).toBe(false);
    expect(cursorNote(s.score, s.cursor)?.pitch).toBe(69);
  });

  it('combines two digits within 600ms into one fret', () => {
    const s = run(fresh(), [[digit(1), 0], [digit(2), 400]]);
    expect(cursorNote(s.score, s.cursor)?.fret).toBe(12);
  });

  it('replaces with the second digit when the combined fret is over maxFret', () => {
    const s = run(fresh(), [[digit(3), 0], [digit(5), 300]]);
    expect(cursorNote(s.score, s.cursor)?.fret).toBe(5);
  });

  it('treats a digit after 600ms as a fresh overwrite', () => {
    const s = run(fresh(), [[digit(1), 0], [digit(2), 700]]);
    expect(cursorNote(s.score, s.cursor)?.fret).toBe(2);
  });

  it('undoes a two-digit fret in one step', () => {
    const s = run(fresh(), [[digit(1), 0], [digit(2), 100], [{ type: 'undo' }, 200]]);
    expect(cursorNote(s.score, s.cursor)).toBeUndefined();
    expect(cursorBeat(s.score, s.cursor)?.rest).toBe(true);
  });

  it('adds a chord note on another string of the same beat', () => {
    const s = run(fresh(), [digit(0), { type: 'moveString', delta: 1 }, digit(1)]);
    const beat = cursorBeat(s.score, s.cursor);
    expect(beat?.notes.map(n => [n.string, n.fret])).toEqual([[1, 0], [2, 1]]);
  });

  it('overwrites the note on the same string', () => {
    const s = run(fresh(), [digit(3), digit(7)]);
    expect(cursorBeat(s.score, s.cursor)?.notes).toHaveLength(1);
    expect(cursorNote(s.score, s.cursor)?.fret).toBe(7);
  });

  it('keeps the cursor in place by default and advances when the setting is on', () => {
    expect(run(fresh(), [digit(3)]).cursor.beatIndex).toBe(0);
    const s = run(createEditor(createScore(), { advanceAfterInput: true }), [[digit(1), 0], [digit(2), 100]]);
    expect(s.cursor.beatIndex).toBe(1);
    expect(s.score.tracks[0].bars[0].beats[0].notes[0].fret).toBe(12);
  });

  it('keeps the score valid after mixed input', () => {
    const s = run(fresh(), [digit(3), { type: 'moveString', delta: 1 }, digit(5), { type: 'moveBeat', delta: 1 }, digit(0)]);
    expect(validateScore(s.score)).toEqual([]);
  });
});

describe('navigation', () => {
  it('creates a new bar when moving right from the last beat', () => {
    const score = createScore({ bars: 1 });
    let s = fresh(score);
    for (let i = 0; i < 4; i++) {
      s = execute(s, { type: 'moveBeat', delta: 1 }, i);
    }
    expect(s.score.masterBars).toHaveLength(2);
    expect(s.score.tracks[0].bars).toHaveLength(2);
    expect(s.cursor).toMatchObject({ barIndex: 1, beatIndex: 0 });
    expect(validateScore(s.score)).toEqual([]);
  });

  it('crosses bar lines going left and stops at the first beat', () => {
    let s = run(fresh(), [{ type: 'moveBar', delta: 1 }, { type: 'moveBeat', delta: -1 }]);
    expect(s.cursor).toMatchObject({ barIndex: 0, beatIndex: 3 });
    s = run(fresh(), [{ type: 'moveBeat', delta: -1 }]);
    expect(s.cursor).toMatchObject({ barIndex: 0, beatIndex: 0 });
  });

  it('keeps the string inside the tuning', () => {
    const s = run(fresh(), Array(10).fill({ type: 'moveString', delta: 1 }));
    expect(s.cursor.string).toBe(6);
  });
});

describe('rhythm', () => {
  it('shortens and lengthens the cursor beat and cycles dots', () => {
    let s = run(fresh(), [{ type: 'shorter' }]);
    expect(cursorBeat(s.score, s.cursor)?.duration.base).toBe(8);
    s = run(s, [{ type: 'longer' }, { type: 'longer' }, { type: 'dots' }, { type: 'dots' }, { type: 'dots' }]);
    expect(cursorBeat(s.score, s.cursor)?.duration).toEqual({ base: 2, dots: 0 });
  });

  it('reports an overfull bar after lengthening a beat', () => {
    const s = run(fresh(), [{ type: 'longer' }]);
    expect(barFill(s.score.tracks[0].bars[0], s.score.masterBars[0]).state).toBe('over');
  });

  it('turns a note beat into a rest and removes its notes', () => {
    const s = run(fresh(), [digit(3), { type: 'rest' }]);
    expect(cursorBeat(s.score, s.cursor)).toMatchObject({ rest: true, notes: [] });
  });

  it('inserts a beat with the same duration after Enter and moves to it', () => {
    const s = run(fresh(), [{ type: 'shorter' }, { type: 'insertBeat' }]);
    expect(s.cursor.beatIndex).toBe(1);
    expect(cursorBeat(s.score, s.cursor)?.duration.base).toBe(8);
    expect(s.score.tracks[0].bars[0].beats).toHaveLength(5);
  });

  it('never leaves a bar without beats', () => {
    const score = createScore({ timeSig: [1, 4] });
    const s = run(fresh(score), [digit(4), { type: 'deleteBeat' }]);
    expect(s.score.tracks[0].bars[0].beats).toHaveLength(1);
    expect(s.score.tracks[0].bars[0].beats[0].rest).toBe(true);
  });

  it('toggles a triplet', () => {
    const s = run(fresh(), [{ type: 'tuplet' }]);
    expect(cursorBeat(s.score, s.cursor)?.duration.tuplet).toEqual([3, 2]);
    expect(cursorBeat(run(s, [{ type: 'tuplet' }]).score, s.cursor)?.duration.tuplet).toBeUndefined();
  });
});

describe('effects', () => {
  it('cycles bends full → ½ → release → none', () => {
    let s = run(fresh(), [digit(7)]);
    const seen: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      s = execute(s, { type: 'bend' }, 10_000 + i);
      seen.push(cursorNote(s.score, s.cursor)?.effects.bend);
    }
    expect(seen).toEqual([{ type: 'bend', amount: 1 }, { type: 'bend', amount: 0.5 }, { type: 'release', amount: 1 }, undefined]);
  });

  it('toggles palm mute, dead note, let ring, vibrato and hammer', () => {
    const s = run(fresh(), [digit(0), { type: 'palmMute' }, { type: 'dead' }, { type: 'letRing' }, { type: 'vibrato' }, { type: 'hammer' }]);
    expect(cursorNote(s.score, s.cursor)?.effects).toEqual({ palmMute: true, dead: true, letRing: true, vibrato: 'slight', hammerPull: true });
  });

  it('ties to the previous note on the same string and copies its fret', () => {
    const s = run(fresh(), [digit(5), { type: 'moveBeat', delta: 1 }, digit(7), { type: 'tie' }]);
    expect(cursorNote(s.score, s.cursor)).toMatchObject({ tieFromPrev: true, fret: 5 });
  });

  it('does nothing on an empty cell', () => {
    const s = fresh();
    expect(execute(s, { type: 'palmMute' }, 0).score).toBe(s.score);
  });
});

describe('bars', () => {
  it('inserts, duplicates and deletes bars across all tracks', () => {
    let s = run(fresh(), [digit(3), { type: 'addTrack', instrument: 'bass' }]);
    s = run(s, [{ type: 'insertBar', after: true }, { type: 'duplicateBar' }]);
    expect(s.score.masterBars).toHaveLength(6);
    expect(s.score.tracks.every(t => t.bars.length === 6)).toBe(true);
    s = run(s, [{ type: 'deleteBar' }]);
    expect(s.score.masterBars).toHaveLength(5);
    expect(validateScore(s.score)).toEqual([]);
  });

  it('keeps the tempo when the first bar is deleted', () => {
    const s = run(fresh(), [{ type: 'deleteBar' }]);
    expect(s.score.masterBars[0].tempo).toBe(120);
  });

  it('toggles repeat marks and cycles repeat counts', () => {
    const s = run(fresh(), [{ type: 'repeatStart' }, { type: 'repeatEnd' }, { type: 'repeatEnd' }]);
    expect(s.score.masterBars[0]).toMatchObject({ repeatStart: true, repeatEnd: 3 });
  });

  it('rejects an invalid time signature', () => {
    const s = fresh();
    expect(execute(s, { type: 'setMasterBar', prop: 'timeSig', value: [4, 3] }, 0).score).toBe(s.score);
    expect(execute(s, { type: 'setMasterBar', prop: 'timeSig', value: [6, 8] }, 0).score.masterBars[0].timeSig).toEqual([6, 8]);
  });
});

describe('tracks', () => {
  it('keeps frets and moves pitches when the tuning or capo changes', () => {
    let s = run(fresh(), [{ type: 'moveString', delta: 5 }, digit(0)]);
    s = run(s, [{ type: 'setTuning', tuning: [64, 59, 55, 50, 45, 38] }]);
    expect(cursorNote(s.score, s.cursor)).toMatchObject({ fret: 0, pitch: 38 });
    s = run(s, [{ type: 'setCapo', capo: 2 }]);
    expect(cursorNote(s.score, s.cursor)?.pitch).toBe(40);
    expect(validateScore(s.score)).toEqual([]);
  });

  it('allows at most two tracks and never removes the last one', () => {
    const s = run(fresh(), [{ type: 'addTrack', instrument: 'guitar' }, { type: 'addTrack', instrument: 'guitar' }]);
    expect(s.score.tracks).toHaveLength(2);
    const one = run(fresh(), [{ type: 'removeTrack' }]);
    expect(one.score.tracks).toHaveLength(1);
  });
});

describe('clipboard (SPEC §5.5)', () => {
  it('copies whole beats and pastes them before the cursor beat', () => {
    let s = run(fresh(), [digit(3), { type: 'moveBeat', delta: 1, extend: true }, { type: 'copy' }]);
    s = run(s, [{ type: 'moveBar', delta: 1 }, { type: 'paste' }]);
    const bar = s.score.tracks[0].bars[1];
    expect(bar.beats).toHaveLength(6);
    expect(bar.beats[0].notes[0].fret).toBe(3);
    expect(validateScore(s.score)).toEqual([]);
  });

  it('keeps pitch when pasting into a track with another tuning', () => {
    let s = run(fresh(), [{ type: 'moveString', delta: 5 }, digit(0), { type: 'copy' }]);
    s = run(s, [{ type: 'addTrack', instrument: 'guitar', tuning: [64, 59, 55, 50, 45, 38] }]);
    s = run(s, [{ type: 'setCursor', cursor: { ...s.cursor, string: 6 } }, { type: 'paste' }]);
    const pasted = s.score.tracks[1].bars[0].beats[0].notes[0];
    expect(pasted).toMatchObject({ pitch: 40, string: 6, fret: 2 });
  });

  it('cut clears the copied notes', () => {
    const s = run(fresh(), [digit(3), { type: 'cut' }]);
    expect(cursorBeat(s.score, s.cursor)?.rest).toBe(true);
    expect(s.clipboard?.beats[0].notes[0].fret).toBe(3);
  });

  it('pastes a partial string range over existing beats', () => {
    let s = run(fresh(), [digit(5), { type: 'moveString', delta: 1, extend: true }, { type: 'copy' }]);
    s = run(s, [{ type: 'moveBar', delta: 1 }, { type: 'moveString', delta: 1 }, { type: 'paste' }]);
    const beat = s.score.tracks[0].bars[1].beats[0];
    // Pitch is canonical: A4 (string 1 fret 5 = 69) lands on string 3 at fret 14.
    expect(beat.notes.map(n => [n.string, n.fret, n.pitch])).toEqual([[3, 14, 69]]);
    expect(s.score.tracks[0].bars[1].beats).toHaveLength(4);
    expect(validateScore(s.score)).toEqual([]);
  });
});

describe('undo / redo', () => {
  it('reverts and replays every change', () => {
    const start = fresh();
    const edited = run(start, [digit(3), { type: 'insertBar', after: true }, { type: 'palmMute' }]);
    let s = edited;
    for (let i = 0; i < 3; i++) {
      s = execute(s, { type: 'undo' }, 99_000 + i);
    }
    expect(s.score).toEqual(start.score);
    for (let i = 0; i < 3; i++) {
      s = execute(s, { type: 'redo' }, 99_100 + i);
    }
    expect(s.score).toEqual(edited.score);
  });

  it('drops the redo stack after a new change', () => {
    const s = run(fresh(), [digit(3), { type: 'undo' }, digit(4)]);
    expect(s.history.redo).toHaveLength(0);
  });
});

describe('typing into inspector fields', () => {
  it('undoes a whole typed word in one step', () => {
    let s = fresh();
    ['V', 'Ve', 'Ver', 'Vers', 'Verse'].forEach((v, i) => {
      s = execute(s, { type: 'setMasterBar', prop: 'section', value: v }, 1000 + i * 200);
    });
    expect(s.score.masterBars[0].section).toBe('Verse');
    expect(s.history.undo).toHaveLength(1);
    s = execute(s, { type: 'undo' }, 3000);
    expect(s.score.masterBars[0].section).toBeUndefined();
  });

  it('starts a new undo step after a pause or when another field is edited', () => {
    let s = fresh();
    s = execute(s, { type: 'setTitle', title: 'A' }, 0);
    s = execute(s, { type: 'setTitle', title: 'AB' }, 300);
    s = execute(s, { type: 'setTitle', title: 'ABC' }, 5000);
    expect(s.history.undo).toHaveLength(2);
    s = execute(s, { type: 'setMasterBar', prop: 'tempo', value: 90 }, 5100);
    s = execute(s, { type: 'setMasterBar', prop: 'section', value: 'X' }, 5200);
    expect(s.history.undo).toHaveLength(4);
  });

  it('never merges typing into a note edit made in between', () => {
    let s = fresh();
    s = execute(s, { type: 'setMasterBar', prop: 'tempo', value: 100 }, 0);
    s = execute(s, { type: 'digit', digit: 3 }, 100);
    s = execute(s, { type: 'setMasterBar', prop: 'tempo', value: 110 }, 200);
    expect(s.history.undo).toHaveLength(3);
  });
});

describe('fingering lock', () => {
  it('unlocks and relocks the fingering of the cursor note', () => {
    let s = run(fresh(), [digit(7)]);
    expect(cursorNote(s.score, s.cursor)?.fingeringLocked).toBe(true);
    s = run(s, [{ type: 'toggleFingeringLock' }]);
    expect(cursorNote(s.score, s.cursor)?.fingeringLocked).toBe(false);
    s = run(s, [{ type: 'undo' }]);
    expect(cursorNote(s.score, s.cursor)?.fingeringLocked).toBe(true);
  });

  it('does nothing on an empty cell', () => {
    const s = fresh();
    expect(execute(s, { type: 'toggleFingeringLock' }, 0).score).toBe(s.score);
  });
});

describe('piano input (D-023)', () => {
  const piano = () => fresh(createScore({ instrument: 'piano', bars: 2 }));
  const keysOf = (s: EditorState) => cursorBeat(s.score, s.cursor)?.keys?.map(k => k.pitch) ?? [];

  it('adds pitches to the cursor beat as a chord, sorted low to high, and clears the rest', () => {
    const s = run(piano(), [{ type: 'togglePitch', pitch: 64 }, { type: 'togglePitch', pitch: 60 }, { type: 'togglePitch', pitch: 67 }]);
    expect(keysOf(s)).toEqual([60, 64, 67]);
    expect(cursorBeat(s.score, s.cursor)?.rest).toBe(false);
    expect(validateScore(s.score)).toEqual([]);
  });

  it('removes a pitch that is already there and turns the beat back into a rest', () => {
    const s = run(piano(), [{ type: 'togglePitch', pitch: 60 }, { type: 'togglePitch', pitch: 60 }]);
    expect(keysOf(s)).toEqual([]);
    expect(cursorBeat(s.score, s.cursor)?.rest).toBe(true);
  });

  it('transposes the whole chord by semitones and stays inside the piano range', () => {
    let s = run(piano(), [{ type: 'togglePitch', pitch: 60 }, { type: 'togglePitch', pitch: 64 }, { type: 'transposeKeys', delta: 2 }]);
    expect(keysOf(s)).toEqual([62, 66]);
    s = run(fresh(createScore({ instrument: 'piano' })), [{ type: 'togglePitch', pitch: 108 }, { type: 'transposeKeys', delta: 1 }]);
    expect(keysOf(s)).toEqual([108]);
  });

  it('undoes a chord note by note', () => {
    const s = run(piano(), [{ type: 'togglePitch', pitch: 60 }, { type: 'togglePitch', pitch: 64 }, { type: 'undo' }]);
    expect(keysOf(s)).toEqual([60]);
  });

  it('clears the beat with Delete and a rest toggle', () => {
    let s = run(piano(), [{ type: 'togglePitch', pitch: 60 }, { type: 'deleteNote' }]);
    expect(cursorBeat(s.score, s.cursor)?.rest).toBe(true);
    s = run(piano(), [{ type: 'togglePitch', pitch: 60 }, { type: 'rest' }]);
    expect(keysOf(s)).toEqual([]);
    expect(validateScore(s.score)).toEqual([]);
  });

  it('ties keys that repeat the previous beat', () => {
    const s = run(piano(), [{ type: 'togglePitch', pitch: 60 }, { type: 'moveBeat', delta: 1 }, { type: 'togglePitch', pitch: 60 }, { type: 'togglePitch', pitch: 64 }, { type: 'tie' }]);
    const keys = cursorBeat(s.score, s.cursor)?.keys ?? [];
    expect(keys.map(k => [k.pitch, !!k.tieFromPrev])).toEqual([[60, true], [64, false]]);
  });

  it('copies and pastes piano beats into another bar', () => {
    const s = run(piano(), [{ type: 'togglePitch', pitch: 60 }, { type: 'copy' }, { type: 'moveBar', delta: 1 }, { type: 'paste' }]);
    expect(s.score.tracks[0].bars[1].beats[0].keys?.map(k => k.pitch)).toEqual([60]);
    expect(validateScore(s.score)).toEqual([]);
  });
});

describe('drum input (D-023)', () => {
  const drums = () => fresh(createScore({ instrument: 'drums', bars: 1 }));
  const hitsOf = (s: EditorState) => cursorBeat(s.score, s.cursor)?.hits?.map(h => h.piece) ?? [];

  it('toggles kit pieces on the cursor beat in kit order', () => {
    const s = run(drums(), [{ type: 'toggleHit', piece: 'snare' }, { type: 'toggleHit', piece: 'kick' }, { type: 'toggleHit', piece: 'hihatClosed' }]);
    expect(hitsOf(s)).toEqual(['kick', 'snare', 'hihatClosed']);
    expect(validateScore(s.score)).toEqual([]);
    const off = run(s, [{ type: 'toggleHit', piece: 'snare' }]);
    expect(hitsOf(off)).toEqual(['kick', 'hihatClosed']);
  });

  it('ignores piano and drum commands on the wrong instrument', () => {
    const g = fresh();
    expect(execute(g, { type: 'togglePitch', pitch: 60 }, 0).score).toBe(g.score);
    expect(execute(g, { type: 'toggleHit', piece: 'kick' }, 0).score).toBe(g.score);
    const d = drums();
    expect(execute(d, { type: 'togglePitch', pitch: 60 }, 0).score).toBe(d.score);
  });
});
