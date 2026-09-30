import { createScore, validateScore, type Score } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { createEditor, execute, type Command, type EditorState } from './editor';

function run(state: EditorState, commands: Command[]): EditorState {
  return commands.reduce((s, c, i) => execute(s, c, 1000 * (i + 1) + s.revision * 10_000), state);
}

/** Bar i gets fret i on string 1 in its first beat, so bars can be told apart. */
function numbered(bars: number): EditorState {
  let s = createEditor(createScore({ bars }));
  for (let i = 0; i < bars; i++) {
    s = { ...s, cursor: { ...s.cursor, barIndex: i, beatIndex: 0, string: 1 } };
    s = execute(s, { type: 'placeFret', string: 1, fret: i }, 100_000 * (i + 1));
  }
  return { ...s, cursor: { ...s.cursor, barIndex: 0, beatIndex: 0 } };
}

const firstFrets = (score: Score, track = 0) => score.tracks[track].bars.map(b => b.beats[0].notes[0]?.fret ?? '-');
const at = (s: EditorState, barIndex: number): EditorState => ({ ...s, cursor: { ...s.cursor, barIndex, beatIndex: 0 }, selection: null });

describe('bar copy and paste', () => {
  it('selects whole bars with Shift+Cmd+arrows and grows or shrinks one bar at a time', () => {
    let s = run(numbered(4), [{ type: 'moveBar', delta: 1, extend: true }]);
    expect(s.selection).toMatchObject({ anchor: { barIndex: 0, beatIndex: 0 }, head: { barIndex: 0, beatIndex: 3 } });
    s = run(s, [{ type: 'moveBar', delta: 1, extend: true }]);
    expect(s.selection?.head).toMatchObject({ barIndex: 1, beatIndex: 3 });
    s = run(s, [{ type: 'moveBar', delta: -1, extend: true }]);
    expect(s.selection?.head).toMatchObject({ barIndex: 0, beatIndex: 3 });
  });

  it('pastes copied bars over the bars from the cursor, adding bars past the end', () => {
    let s = run(numbered(4), [
      { type: 'moveBar', delta: 1, extend: true },
      { type: 'moveBar', delta: 1, extend: true },
      { type: 'copy' },
    ]);
    s = run(at(s, 3), [{ type: 'paste' }]);
    expect(firstFrets(s.score)).toEqual([0, 1, 2, 0, 1]);
    expect(s.cursor).toMatchObject({ barIndex: 3, beatIndex: 0 });
    expect(validateScore(s.score)).toEqual([]);
    // One undo takes the whole paste back.
    expect(firstFrets(run(s, [{ type: 'undo' }]).score)).toEqual([0, 1, 2, 3]);
  });

  it('inserts copied bars as new bars before the cursor bar with Shift+Cmd+V', () => {
    let s = run(numbered(3), [{ type: 'copyBars' }]);
    s = run(at(s, 2), [{ type: 'paste', insert: true }]);
    expect(firstFrets(s.score)).toEqual([0, 1, 0, 2]);
    expect(validateScore(s.score)).toEqual([]);
  });

  it('carries the time and key signature, section, width, chords, lyrics and tremolo', () => {
    let s = numbered(2);
    s = run(s, [
      { type: 'setMasterBar', prop: 'timeSig', value: [3, 4] },
      { type: 'setMasterBar', prop: 'keySig', value: 2 },
      { type: 'setMasterBar', prop: 'section', value: 'Riff' },
      { type: 'setMasterBar', prop: 'width', value: 1.5 },
      { type: 'tremolo', speed: 16 },
    ]);
    const beatId = s.score.tracks[0].bars[0].beats[0].id;
    s = run(s, [{ type: 'setChord', beatId, chord: 'Am' }, { type: 'setLyric', beatId, lyric: 'la' }, { type: 'copyBars' }]);
    s = run(at(s, 1), [{ type: 'paste' }]);
    const [a, b] = s.score.masterBars;
    expect({ timeSig: b.timeSig, keySig: b.keySig, section: b.section, width: b.width }).toEqual({ timeSig: [3, 4], keySig: 2, section: 'Riff', width: 1.5 });
    expect(b.id).not.toBe(a.id);
    const beat = s.score.tracks[0].bars[1].beats[0];
    expect({ chord: beat.chord, lyric: beat.lyric, tremolo: beat.tremolo, fret: beat.notes[0].fret }).toEqual({ chord: 'Am', lyric: 'la', tremolo: 16, fret: 0 });
    expect(validateScore(s.score)).toEqual([]);
  });

  it('copies every track and pastes each into the same track, wherever the cursor is', () => {
    let s = run(numbered(2), [{ type: 'addTrack', instrument: 'bass' }]);
    s = { ...s, cursor: { ...s.cursor, trackId: s.score.tracks[0].id } };
    s = run(s, [{ type: 'copyBars' }]);
    const second = s.score.tracks[1].id;
    s = { ...s, cursor: { ...s.cursor, trackId: second, barIndex: 1, beatIndex: 0 }, selection: null };
    s = run(s, [{ type: 'paste' }]);
    const note = s.score.tracks[0].bars[1].beats[0].notes[0];
    expect(note.fret).toBe(0);
    expect(s.score.tracks[1].bars[1].beats[0].rest).toBe(true);
    expect(validateScore(s.score)).toEqual([]);
  });

  it('still pastes a partial beat selection as beats, not bars', () => {
    let s = numbered(2);
    s = run(s, [{ type: 'moveBeat', delta: 1, extend: true }, { type: 'copy' }]);
    expect(s.clipboard?.bars).toBeUndefined();
    s = run(at(s, 1), [{ type: 'paste' }]);
    expect(s.score.masterBars).toHaveLength(2);
  });
});
