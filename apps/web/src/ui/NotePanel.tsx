import { cursorBeat, cursorNote, cursorTrack, type Command, type EditorState } from '@fretflow/editor-core';
import { fretFor, pitchName, type BendAmount, type BendType, type DurationBase, type NoteEffects } from '@fretflow/score-model';
import { Lock, LockOpen } from 'lucide-react';

interface Props {
  editor: EditorState;
  dispatch: (c: Command) => void;
}

const DURATIONS: { base: DurationBase; label: string; name: string }[] = [
  { base: 1, label: '1', name: 'Whole' },
  { base: 2, label: '½', name: 'Half' },
  { base: 4, label: '¼', name: 'Quarter' },
  { base: 8, label: '⅛', name: 'Eighth' },
  { base: 16, label: '1/16', name: 'Sixteenth' },
  { base: 32, label: '1/32', name: 'Thirty-second' },
];

type Tech = { key: string; label: string; command: Command; on: (fx: NoteEffects) => boolean };
const TECHNIQUES: Tech[] = [
  // Our model has one hammer/pull flag; alphaTab draws h or p from the next note's pitch.
  { key: 'H', label: 'Hammer-on', command: { type: 'hammer' }, on: fx => !!fx.hammerPull },
  { key: 'P', label: 'Pull-off', command: { type: 'hammer' }, on: fx => !!fx.hammerPull },
  { key: 'S', label: 'Slide', command: { type: 'slide' }, on: fx => !!fx.slide },
  { key: 'B', label: 'Bend', command: { type: 'bend' }, on: fx => !!fx.bend },
  { key: 'V', label: 'Vibrato', command: { type: 'vibrato' }, on: fx => !!fx.vibrato },
  { key: 'M', label: 'Palm mute', command: { type: 'palmMute' }, on: fx => !!fx.palmMute },
  { key: 'X', label: 'Dead note', command: { type: 'dead' }, on: fx => !!fx.dead },
  { key: 'L', label: 'Let ring', command: { type: 'letRing' }, on: fx => !!fx.letRing },
];

export function NotePanel({ editor, dispatch }: Props) {
  const { score, cursor } = editor;
  const track = cursorTrack(score, cursor);
  const beat = cursorBeat(score, cursor);
  const note = cursorNote(score, cursor);
  const fx: NoteEffects = note?.effects ?? {};
  const d = beat?.duration;
  const elsewhere = note
    ? track.tuning
        .map((_, i) => i + 1)
        .filter(s => s !== note.string)
        .map(s => ({ string: s, fret: fretFor(track, s, note.pitch) }))
        .filter((x): x is { string: number; fret: number } => x.fret !== null)
    : [];
  const setFx = (key: 'bend' | 'slide' | 'vibrato', value: NoteEffects[typeof key]) => dispatch({ type: 'setEffect', key, value });

  return (
    <aside className="note-panel card" aria-label="Selected note">
      <section>
        <h3>Selected note</h3>
        {note ? (
          <>
            <p className="note-name">
              <b>{pitchName(note.pitch)}</b>
              <span className="mono">
                string {note.string} · fret {note.fret}
              </span>
            </p>
            <div className="lock-row">
              {note.fingeringLocked ? <Lock size={16} /> : <LockOpen size={16} />}
              <span>{note.fingeringLocked ? 'Fingering locked' : 'Fingering unlocked'}</span>
              <button type="button" className="link" onClick={() => dispatch({ type: 'toggleFingeringLock' })}>
                {note.fingeringLocked ? 'Unlock' : 'Lock'}
              </button>
            </div>
            {elsewhere.length > 0 && (
              <>
                <p className="muted small">Same pitch elsewhere</p>
                <div className="chips">
                  {elsewhere.map(x => (
                    <button key={x.string} type="button" className="chip mono" onClick={() => dispatch({ type: 'placeFret', string: x.string, fret: x.fret })}>
                      str {x.string} · fret {x.fret}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <p className="note-name empty">
            <b>{beat?.rest ? 'Rest' : 'Empty'}</b>
            <span className="mono">string {cursor.string}</span>
          </p>
        )}
      </section>

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
          <button type="button" className="chip" aria-pressed={!!note?.tieFromPrev} disabled={!note} onClick={() => dispatch({ type: 'tie' })}>
            Tie
          </button>
        </div>
      </section>

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
        {note && (fx.bend || fx.slide || fx.vibrato) && (
          <div className="tech-detail">
            {fx.bend && (
              <>
                <select aria-label="Bend type" value={fx.bend.type} onChange={e => setFx('bend', { type: e.target.value as BendType, amount: fx.bend?.amount ?? 1 })}>
                  <option value="bend">Bend</option>
                  <option value="release">Release</option>
                  <option value="bendRelease">Bend + release</option>
                  <option value="prebend">Pre-bend</option>
                </select>
                <select aria-label="Bend amount" value={fx.bend.amount} onChange={e => fx.bend && setFx('bend', { ...fx.bend, amount: Number(e.target.value) as BendAmount })}>
                  <option value={0.5}>½</option>
                  <option value={1}>Full</option>
                  <option value={1.5}>1½</option>
                  <option value={2}>2</option>
                </select>
              </>
            )}
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
    </aside>
  );
}
