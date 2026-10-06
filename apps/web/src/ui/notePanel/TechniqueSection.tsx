import { cursorBeat, cursorNote, type Command, type EditorState } from '@fretflow/editor-core';
import type { NoteEffects } from '@fretflow/score-model';
import { BEND_AMOUNTS, BEND_TYPES, HARMONIC_KINDS, TECHNIQUES, TREMOLOS } from './options';

interface Props {
  editor: EditorState;
  dispatch: (c: Command) => void;
}

/** Guitar and bass techniques of the note under the cursor, plus beat tremolo. */
export function TechniqueSection({ editor, dispatch }: Props) {
  const { score, cursor } = editor;
  const beat = cursorBeat(score, cursor);
  const note = cursorNote(score, cursor);
  const fx: NoteEffects = note?.effects ?? {};
  const setFx = (key: 'bend' | 'slide' | 'vibrato' | 'harmonic', value: NoteEffects[typeof key]) => dispatch({ type: 'setEffect', key, value });

  return (
    <section>
      <h3>Technique</h3>
      <div className="tech-grid">
        {TECHNIQUES.map(t => (
          <button key={t.label} type="button" className="tech" aria-pressed={t.on(fx)} disabled={!note} onClick={() => dispatch(t.command)}>
            <kbd>{t.key}</kbd>
            {t.label}
          </button>
        ))}
      </div>
      {note && (
        <div className="bend-row" role="group" aria-label="Bend amount">
          <span className="muted small">Bend</span>
          <button type="button" className="chip" aria-pressed={!fx.bend} onClick={() => setFx('bend', undefined)}>
            Off
          </button>
          {BEND_AMOUNTS.map(({ amount, label }) => (
            <button
              key={amount}
              type="button"
              className="chip"
              aria-pressed={fx.bend?.amount === amount}
              title={`Bend ${label} = ${amount * 2} semitone${amount === 0.5 ? '' : 's'}`}
              onClick={() => setFx('bend', { type: fx.bend?.type ?? 'bend', amount })}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {note && (
        <div className="bend-row" role="group" aria-label="Harmonic">
          <span className="muted small">Harm.</span>
          <button type="button" className="chip" aria-pressed={!fx.harmonic} onClick={() => setFx('harmonic', undefined)}>
            Off
          </button>
          {HARMONIC_KINDS.map(({ kind, label, name }) => (
            <button key={kind} type="button" className="chip" aria-pressed={fx.harmonic === kind} title={name} onClick={() => setFx('harmonic', kind)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {beat && !beat.rest && (
        <div className="bend-row" role="group" aria-label="Tremolo picking">
          <span className="muted small" title="Tremolo picking (Shift+R)">Trem.</span>
          {TREMOLOS.map(({ speed, label }) => (
            <button
              key={label}
              type="button"
              className="chip"
              aria-pressed={beat.tremolo === speed}
              onClick={() => dispatch({ type: 'tremolo', speed: speed ?? null })}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {note && fx.bend && (
        <div className="bend-row" role="group" aria-label="Bend type">
          {BEND_TYPES.map(({ type, label }) => (
            <button key={type} type="button" className="chip" aria-pressed={fx.bend?.type === type} onClick={() => fx.bend && setFx('bend', { ...fx.bend, type })}>
              {label}
            </button>
          ))}
        </div>
      )}
      {note && (fx.slide || fx.vibrato) && (
        <div className="tech-detail">
          {fx.slide && (
            <select aria-label="Slide type" value={fx.slide} onChange={e => setFx('slide', e.target.value as NoteEffects['slide'])}>
              <option value="legato">Legato slide</option>
              <option value="shift">Shift slide</option>
              <option value="in">Slide in</option>
              <option value="out">Slide out</option>
            </select>
          )}
          {fx.vibrato && (
            <select aria-label="Vibrato" value={fx.vibrato} onChange={e => setFx('vibrato', e.target.value as NoteEffects['vibrato'])}>
              <option value="slight">Slight vibrato</option>
              <option value="wide">Wide vibrato</option>
            </select>
          )}
        </div>
      )}
    </section>
  );
}
