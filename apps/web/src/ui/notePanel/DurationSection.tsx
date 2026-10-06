import { cursorBeat, cursorNote, cursorTrack, type Command, type EditorState } from '@fretflow/editor-core';
import { isFretted } from '@fretflow/score-model';
import { DURATIONS } from './options';

interface Props {
  editor: EditorState;
  dispatch: (c: Command) => void;
}

export function DurationSection({ editor, dispatch }: Props) {
  const { score, cursor } = editor;
  const track = cursorTrack(score, cursor);
  const beat = cursorBeat(score, cursor);
  const note = cursorNote(score, cursor);
  const d = beat?.duration;
  const fretted = isFretted(track.instrument);

  return (
    <section>
      <h3>Duration</h3>
      <div className="dur-grid">
        {DURATIONS.map(x => (
          <button key={x.base} type="button" className="key mono" aria-pressed={d?.base === x.base} title={x.name} onClick={() => dispatch({ type: 'setDuration', base: x.base })}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={!!d?.dots} onClick={() => dispatch({ type: 'dots' })}>
          {d?.dots === 2 ? 'Double dotted' : 'Dotted'}
        </button>
        <button type="button" className="chip" aria-pressed={!!d?.tuplet} onClick={() => dispatch({ type: 'tuplet' })}>
          Triplet
        </button>
        <button type="button" className="chip" aria-pressed={!!beat?.rest} onClick={() => dispatch({ type: 'rest' })}>
          Rest
        </button>
        <button type="button" className="chip" aria-pressed={!!note?.tieFromPrev || !!beat?.keys?.some(k => k.tieFromPrev)} disabled={track.instrument === 'drums' || (fretted && !note) || (!fretted && !beat?.keys?.length)} onClick={() => dispatch({ type: 'tie' })}>
          Tie
        </button>
        {track.instrument === 'piano' && (
          <button type="button" className="chip" aria-pressed={beat?.pedal !== undefined} disabled={!beat} title="Sustain pedal at this beat: down → up → none (P)" onClick={() => dispatch({ type: 'pedal' })}>
            {beat?.pedal === 'down' ? 'Pedal down' : beat?.pedal === 'up' ? 'Pedal up' : 'Pedal'}
          </button>
        )}
      </div>
    </section>
  );
}
