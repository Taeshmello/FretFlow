import type { Command, EditorState } from '@fretflow/editor-core';
import { cursorBeat, cursorTrack } from '@fretflow/editor-core';
import { pitchName } from '@fretflow/score-model';

const FRETS = 15;
const MARKERS = new Set([3, 5, 7, 9, 15]);

interface Props {
  editor: EditorState;
  dispatch: (c: Command) => void;
}

/**
 * Virtual fretboard (W4): click puts a fret on that string of the cursor beat.
 * Shows the notes of the current beat and every place the cursor note's pitch can be played.
 */
export function Fretboard({ editor, dispatch }: Props) {
  const { score, cursor } = editor;
  const track = cursorTrack(score, cursor);
  const beat = cursorBeat(score, cursor);
  const current = beat?.notes.find(n => n.string === cursor.string);
  const played = new Set(beat?.notes.map(n => `${n.string}:${n.fret}`) ?? []);

  return (
    <div className="fretboard" role="group" aria-label="Fretboard">
      <div className="fb-grid" style={{ gridTemplateColumns: `2.6rem repeat(${FRETS + 1}, 1fr)` }}>
        <span />
        {Array.from({ length: FRETS + 1 }, (_, f) => (
          <span key={f} className="fb-fretno">
            {f}
          </span>
        ))}
        {track.tuning.map((open, i) => {
          const string = i + 1;
          return [
            <span key={`n${string}`} className={`fb-open${string === cursor.string ? ' is-cursor' : ''}`}>
              {pitchName(open + track.capo).replace(/\d/, '')}
            </span>,
            ...Array.from({ length: FRETS + 1 }, (_, fret) => {
              const pitch = open + track.capo + fret;
              const isPlayed = played.has(`${string}:${fret}`);
              const same = current && !isPlayed && pitch === current.pitch;
              return (
                <button
                  key={`${string}:${fret}`}
                  type="button"
                  className={`fb-cell${isPlayed ? ' is-played' : ''}${same ? ' is-same' : ''}${fret === 0 ? ' is-open' : ''}`}
                  title={`${string}번 현 ${fret}프렛 · ${pitchName(pitch)}`}
                  onClick={() => dispatch({ type: 'placeFret', string, fret })}
                >
                  {isPlayed ? fret : same ? '•' : ''}
                </button>
              );
            }),
          ];
        })}
        <span />
        {Array.from({ length: FRETS + 1 }, (_, f) => (
          <span key={`m${f}`} className="fb-marker">
            {f === 12 ? '••' : MARKERS.has(f) ? '•' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
