import { cursorBeat, type Command, type EditorState } from '@fretflow/editor-core';
import { DRUM_ORDER, DRUM_PIECES } from '@fretflow/score-model';
import { previewDrum } from '../audio/preview';

interface Props {
  editor: EditorState;
  dispatch: (c: Command) => void;
}

/** Kit pieces as pads. Number keys 1–9 and 0 hit the first ten. */
export function DrumPad({ editor, dispatch }: Props) {
  const beat = cursorBeat(editor.score, editor.cursor);
  const lit = new Set(beat?.hits?.map(h => h.piece) ?? []);
  return (
    <div className="drum-pad card" role="group" aria-label="Drum pads">
      <div className="piano-head">
        <b>Drums</b>
        <span className="muted small">Number keys 1–9 and 0 toggle the first ten pieces on the current beat.</span>
      </div>
      <div className="pads">
        {DRUM_ORDER.map((piece, i) => (
          <button
            key={piece}
            type="button"
            className="pad"
            aria-pressed={lit.has(piece)}
            onClick={() => {
              if (!lit.has(piece)) {
                previewDrum(piece);
              }
              dispatch({ type: 'toggleHit', piece });
            }}
          >
            {i < 10 && <kbd>{i === 9 ? 0 : i + 1}</kbd>}
            <span>{DRUM_PIECES[piece].label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
