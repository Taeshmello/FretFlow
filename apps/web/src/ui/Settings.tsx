import { cursorTrack, MAX_TRACKS, tempoAt, type Command, type EditorState } from '@fretflow/editor-core';
import { pitchName, TUNING_PRESETS } from '@fretflow/score-model';

interface Props {
  editor: EditorState;
  dispatch: (c: Command) => void;
}

const KEY_NAMES = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
const TIME_SIGS = ['2/4', '3/4', '4/4', '5/4', '6/4', '7/4', '3/8', '6/8', '7/8', '9/8', '12/8'];

/** Time signature, key, tempo, section and repeats of the cursor bar, plus bar editing. */
export function BarSettings({ editor, dispatch }: Props) {
  const { score, cursor } = editor;
  const mb = score.masterBars[cursor.barIndex];
  return (
    <div className="settings">
      <h4>Bar {cursor.barIndex + 1}</h4>
      <div className="field-row">
        <label className="field">
          Time
          <select value={mb.timeSig.join('/')} onChange={e => dispatch({ type: 'setMasterBar', prop: 'timeSig', value: e.target.value.split('/').map(Number) })}>
            {TIME_SIGS.map(t => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Key
          <select value={mb.keySig} onChange={e => dispatch({ type: 'setMasterBar', prop: 'keySig', value: Number(e.target.value) })}>
            {KEY_NAMES.map((k, i) => (
              <option key={k} value={i - 7}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Section
        <input value={mb.section ?? ''} placeholder="e.g. Verse" onChange={e => dispatch({ type: 'setMasterBar', prop: 'section', value: e.target.value || undefined })} />
      </label>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={!!mb.repeatStart} onClick={() => dispatch({ type: 'repeatStart' })}>
          Repeat start
        </button>
        <button type="button" className="chip" aria-pressed={!!mb.repeatEnd} onClick={() => dispatch({ type: 'repeatEnd' })}>
          Repeat end{mb.repeatEnd ? ` ×${mb.repeatEnd}` : ''}
        </button>
      </div>
      <div className="chips">
        <button type="button" className="chip" onClick={() => dispatch({ type: 'insertBar', after: false })}>
          Insert before
        </button>
        <button type="button" className="chip" onClick={() => dispatch({ type: 'insertBar', after: true })}>
          Insert after
        </button>
        <button type="button" className="chip" onClick={() => dispatch({ type: 'duplicateBar' })}>
          Duplicate
        </button>
        <button type="button" className="chip danger" disabled={score.masterBars.length <= 1} onClick={() => dispatch({ type: 'deleteBar' })}>
          Delete
        </button>
      </div>
    </div>
  );
}

/** Tempo at the cursor bar; an empty value removes a tempo change (bar 1 always keeps one). */
export function TempoSettings({ editor, dispatch }: Props) {
  const { score, cursor } = editor;
  const mb = score.masterBars[cursor.barIndex];
  return (
    <div className="settings">
      <h4>Tempo from bar {cursor.barIndex + 1}</h4>
      <label className="field">
        BPM
        <input
          type="number"
          min={20}
          max={400}
          value={mb.tempo ?? ''}
          placeholder={String(tempoAt(score, cursor.barIndex))}
          onChange={e => dispatch({ type: 'setMasterBar', prop: 'tempo', value: e.target.value === '' ? undefined : Number(e.target.value) })}
        />
      </label>
    </div>
  );
}

/** Tuning, capo, name and tracks. Changing tuning keeps frets and moves pitches. */
export function TrackSettings({ editor, dispatch, muted, onToggleMute }: Props & { muted: ReadonlySet<number>; onToggleMute: (i: number) => void }) {
  const { score, cursor } = editor;
  const track = cursorTrack(score, cursor);
  const preset = TUNING_PRESETS.find(p => p.tuning.join() === track.tuning.join());
  const stringInstrument = track.instrument === 'guitar' || track.instrument === 'bass';
  return (
    <div className="settings">
      <h4>Track</h4>
      <label className="field">
        Name
        <input value={track.name} onChange={e => dispatch({ type: 'renameTrack', name: e.target.value })} />
      </label>
      {stringInstrument && <><div className="chips">
        {TUNING_PRESETS.filter(p => p.tuning.length === track.tuning.length).map(p => (
          <button key={p.id} type="button" className="chip" aria-pressed={preset?.id === p.id} onClick={() => dispatch({ type: 'setTuning', tuning: p.tuning })}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="strings">
        {track.tuning.map((p, i) => (
          <label key={i} className="string-tune" title={`String ${i + 1}`}>
            <span>{i + 1}</span>
            <select value={p} onChange={e => dispatch({ type: 'setTuning', tuning: track.tuning.map((x, j) => (j === i ? Number(e.target.value) : x)) })}>
              {Array.from({ length: 36 }, (_, k) => p - 12 + k).map(v => (
                <option key={v} value={v}>
                  {pitchName(v)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="field">
        Capo
        <input type="number" min={0} max={12} value={track.capo} onChange={e => dispatch({ type: 'setCapo', capo: Number(e.target.value) })} />
      </label>
      <p className="muted small">Changing tuning or capo keeps the frets and moves the pitches.</p></>}
      {!stringInstrument && <p className="muted small">{track.instrument === 'piano' ? 'Piano uses a grand staff; enter notes with A–G or the keyboard.' : 'Drums use a percussion staff; enter hits with 1–0 or the pads.'}</p>}
      <div className="chips">
        {score.tracks.map((t, i) => (
          <button key={t.id} type="button" className="chip" aria-pressed={muted.has(i)} onClick={() => onToggleMute(i)}>
            {muted.has(i) ? 'Muted' : 'Mute'} · {t.name}
          </button>
        ))}
      </div>
      <div className="chips">
        {score.tracks.length < MAX_TRACKS && (
          <>
            <button type="button" className="chip" onClick={() => dispatch({ type: 'addTrack', instrument: 'guitar' })}>
              + Guitar track
            </button>
            <button type="button" className="chip" onClick={() => dispatch({ type: 'addTrack', instrument: 'bass' })}>
              + Bass track
            </button>
            <button type="button" className="chip" onClick={() => dispatch({ type: 'addTrack', instrument: 'piano' })}>+ Piano track</button>
            <button type="button" className="chip" onClick={() => dispatch({ type: 'addTrack', instrument: 'drums' })}>+ Drums track</button>
          </>
        )}
        {score.tracks.length > 1 && (
          <button type="button" className="chip danger" onClick={() => dispatch({ type: 'removeTrack' })}>
            Remove track
          </button>
        )}
      </div>
    </div>
  );
}
