import { cursorBeat, type Command, type EditorState } from '@fretflow/editor-core';
import { pitchName } from '@fretflow/score-model';
import { previewPitch } from '../audio/preview';

interface Props {
  editor: EditorState;
  dispatch: (c: Command) => void;
  /** Octave the A–G keys type into (4 = middle C). */
  octave: number;
  onOctave: (octave: number) => void;
  /** How many octaves to draw, starting one below the entry octave. */
  span?: number;
}

const BLACK = new Set([1, 3, 6, 8, 10]);
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

/**
 * Clickable piano keyboard. Keys of the cursor beat are lit; clicking adds or
 * removes that pitch and plays it when it is added.
 */
export function PianoKeyboard({ editor, dispatch, octave, onOctave, span = 3 }: Props) {
  const beat = cursorBeat(editor.score, editor.cursor);
  const lit = new Set(beat?.keys?.map(k => k.pitch) ?? []);
  const first = Math.max(1, Math.min(octave - 1, 8 - span));
  const octaves = Array.from({ length: span }, (_, i) => first + i);

  const press = (pitch: number) => {
    if (!lit.has(pitch)) {
      previewPitch(pitch, 'piano');
    }
    dispatch({ type: 'togglePitch', pitch });
  };

  return (
    <div className="piano card" role="group" aria-label="Piano keyboard">
      <div className="piano-head">
        <b>Piano</b>
        <span className="muted small">Letters A–G enter notes in octave {octave} · Shift = sharp · Z / X change octave · ↑ ↓ transpose</span>
        <span className="spacer" />
        <button type="button" className="chip" aria-label="Octave down" disabled={octave <= 1} onClick={() => onOctave(octave - 1)}>
          −
        </button>
        <span className="mono">C{octave}</span>
        <button type="button" className="chip" aria-label="Octave up" disabled={octave >= 7} onClick={() => onOctave(octave + 1)}>
          +
        </button>
      </div>
      <div className="piano-keys">
        {octaves.map(o => (
          <div key={o} className={`piano-octave${o === octave ? ' is-entry' : ''}`}>
            {WHITE_KEYS.map(pc => {
              const pitch = (o + 1) * 12 + pc;
              return (
                <button key={pc} type="button" className="pk white" aria-pressed={lit.has(pitch)} title={pitchName(pitch)} onClick={() => press(pitch)}>
                  {pc === 0 && <span>C{o}</span>}
                </button>
              );
            })}
            {[1, 3, 6, 8, 10].map(pc => {
              const pitch = (o + 1) * 12 + pc;
              return (
                <button
                  key={pc}
                  type="button"
                  className={`pk black b${pc}`}
                  aria-pressed={lit.has(pitch)}
                  title={pitchName(pitch)}
                  onClick={() => press(pitch)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export const isBlackKey = (pitch: number) => BLACK.has(((pitch % 12) + 12) % 12);
