import { createScore, pitchName, TUNING_PRESETS, type Instrument, type Score } from '@fretflow/score-model';
import { useState } from 'react';
import { Modal } from '../ui/Dialogs';

interface Props {
  onCreate: (score: Score) => void;
  onCancel: () => void;
  onImport: (file: File) => void;
}

const TIMES = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'];

export function NewScoreDialog({ onCreate, onCancel, onImport }: Props) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [instrument, setInstrument] = useState<Instrument>('guitar');
  const [tuningId, setTuningId] = useState('standard');
  const [customTuning, setCustomTuning] = useState<number[] | null>(null);
  const [capo, setCapo] = useState(0);
  const [timeSig, setTimeSig] = useState('4/4');
  const [tempo, setTempo] = useState(120);
  const presets = TUNING_PRESETS.filter(p => p.instrument === instrument);
  const stringInstrument = instrument === 'guitar' || instrument === 'bass';
  const tuning = stringInstrument ? (customTuning ?? presets.find(p => p.id === tuningId)?.tuning ?? presets[0]?.tuning ?? []) : [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onCreate(createScore({
      title: title.trim() || 'Untitled',
      artist: artist.trim() || undefined,
      instrument,
      tuning,
      capo,
      timeSig: timeSig.split('/').map(Number) as [number, number],
      tempo,
      bars: 4,
    }));
  }

  return (
    <Modal title="New score" onClose={onCancel} wide>
      <form className="new-score-form" onSubmit={submit}>
        <label className="field">
          Title
          <input autoFocus value={title} placeholder="Untitled" maxLength={80} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="field">
          Artist (optional)
          <input value={artist} placeholder="Artist" maxLength={80} onChange={e => setArtist(e.target.value)} />
        </label>

        <fieldset className="form-group">
          <legend>Instrument</legend>
          <div className="segmented instrument-choice">
            <button type="button" aria-pressed={instrument === 'guitar'} onClick={() => {
              setInstrument('guitar'); setTuningId('standard'); setCustomTuning(null);
            }}>Guitar 6</button>
            <button type="button" aria-pressed={instrument === 'bass'} onClick={() => {
              setInstrument('bass'); setTuningId('bassStandard'); setCustomTuning(null);
            }}>Bass 4</button>
            <button type="button" aria-pressed={instrument === 'piano'} onClick={() => setInstrument('piano')}>Piano</button>
            <button type="button" aria-pressed={instrument === 'drums'} onClick={() => setInstrument('drums')}>Drums</button>
          </div>
          {!stringInstrument && <p className="muted small">{instrument === 'piano' ? 'Grand staff. Type notes with A–G or click the on-screen keyboard.' : 'Percussion staff. Hit pieces with number keys 1–0 or the pads.'}</p>}
        </fieldset>

        {stringInstrument && <fieldset className="form-group">
          <legend>Tuning</legend>
          <div className="tuning-presets">
            {presets.map(p => (
              <button key={p.id} type="button" className="pill" aria-pressed={!customTuning && tuningId === p.id} onClick={() => {
                setTuningId(p.id); setCustomTuning(null);
              }}>{p.name}</button>
            ))}
            <button type="button" className="pill" aria-pressed={!!customTuning} onClick={() => setCustomTuning([...tuning])}>Custom</button>
          </div>
          <div className="tuning-notes">
            {[...tuning].reverse().map((pitch, i) => {
              const string = tuning.length - i;
              return (
                <label key={string}>
                  <span>String {string}</span>
                  {customTuning ? (
                    <select aria-label={`String ${string} tuning`} value={pitch} onChange={e => setCustomTuning(current => current?.map((value, index) => index === string - 1 ? Number(e.target.value) : value) ?? null)}>
                      {Array.from({ length: 49 }, (_, n) => n + 28).map(value => <option key={value} value={value}>{pitchName(value)}</option>)}
                    </select>
                  ) : <strong className="mono">{pitchName(pitch)}</strong>}
                </label>
              );
            })}
          </div>
        </fieldset>}

        <div className="new-score-metrics">
          {stringInstrument && <label className="field">Capo
            <input type="number" min={0} max={12} value={capo} onChange={e => setCapo(Number(e.target.value))} />
          </label>}
          <label className="field">Time
            <select value={timeSig} onChange={e => setTimeSig(e.target.value)}>{TIMES.map(t => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="field">Tempo (BPM)
            <input type="number" min={20} max={400} value={tempo} onChange={e => setTempo(Number(e.target.value))} />
          </label>
        </div>

        <fieldset className="form-group">
          <legend>Start from</legend>
          <div className="start-choice">
            <div className="start-card is-selected"><b>Blank</b><span>Empty 4 bars</span></div>
          </div>
        </fieldset>

        <label className="new-score-audio">
          <span className="new-score-upload-icon">↥</span>
          <span><b>Start from a file</b><small>Open a Guitar Pro or FretFlow JSON file.</small></span>
          <span className="btn">Choose file</span>
          <input type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.json" hidden onChange={e => {
            const file = e.target.files?.[0];
            if (file) { onCancel(); onImport(file); }
          }} />
        </label>

        <div className="form-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary">Create score</button>
        </div>
      </form>
    </Modal>
  );
}
