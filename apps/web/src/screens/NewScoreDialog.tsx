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
      title: title.trim() || '제목 없음',
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
    <Modal title="새 악보" onClose={onCancel} wide>
      <form className="new-score-form" onSubmit={submit}>
        <label className="field">
          제목
          <input autoFocus value={title} placeholder="제목 없음" maxLength={80} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="field">
          아티스트 (선택)
          <input value={artist} placeholder="아티스트" maxLength={80} onChange={e => setArtist(e.target.value)} />
        </label>

        <fieldset className="form-group">
          <legend>악기</legend>
          <div className="segmented instrument-choice">
            <button type="button" aria-pressed={instrument === 'guitar'} onClick={() => {
              setInstrument('guitar'); setTuningId('standard'); setCustomTuning(null);
            }}>기타 6현</button>
            <button type="button" aria-pressed={instrument === 'bass'} onClick={() => {
              setInstrument('bass'); setTuningId('bassStandard'); setCustomTuning(null);
            }}>베이스 4현</button>
            <button type="button" aria-pressed={instrument === 'piano'} onClick={() => setInstrument('piano')}>피아노</button>
            <button type="button" aria-pressed={instrument === 'drums'} onClick={() => setInstrument('drums')}>드럼</button>
          </div>
          {!stringInstrument && <p className="muted small">현재는 악기 선택과 오선보 표시만 지원합니다. 피아노·드럼 전용 음표 입력은 후속 단계입니다.</p>}
        </fieldset>

        {stringInstrument && <fieldset className="form-group">
          <legend>튜닝</legend>
          <div className="tuning-presets">
            {presets.map(p => (
              <button key={p.id} type="button" className="pill" aria-pressed={!customTuning && tuningId === p.id} onClick={() => {
                setTuningId(p.id); setCustomTuning(null);
              }}>{p.name}</button>
            ))}
            <button type="button" className="pill" aria-pressed={!!customTuning} onClick={() => setCustomTuning([...tuning])}>직접 설정</button>
          </div>
          <div className="tuning-notes">
            {[...tuning].reverse().map((pitch, i) => {
              const string = tuning.length - i;
              return (
                <label key={string}>
                  <span>{string}번 현</span>
                  {customTuning ? (
                    <select aria-label={`${string}번 현 튜닝`} value={pitch} onChange={e => setCustomTuning(current => current?.map((value, index) => index === string - 1 ? Number(e.target.value) : value) ?? null)}>
                      {Array.from({ length: 49 }, (_, n) => n + 28).map(value => <option key={value} value={value}>{pitchName(value)}</option>)}
                    </select>
                  ) : <strong className="mono">{pitchName(pitch)}</strong>}
                </label>
              );
            })}
          </div>
        </fieldset>}

        <div className="new-score-metrics">
          {stringInstrument && <label className="field">카포
            <input type="number" min={0} max={12} value={capo} onChange={e => setCapo(Number(e.target.value))} />
          </label>}
          <label className="field">박자
            <select value={timeSig} onChange={e => setTimeSig(e.target.value)}>{TIMES.map(t => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="field">템포 (BPM)
            <input type="number" min={20} max={400} value={tempo} onChange={e => setTempo(Number(e.target.value))} />
          </label>
        </div>

        <fieldset className="form-group">
          <legend>시작</legend>
          <div className="start-choice">
            <div className="start-card is-selected"><b>빈 악보</b><span>4마디부터 직접 작성</span></div>
          </div>
        </fieldset>

        <label className="new-score-audio">
          <span className="new-score-upload-icon">↥</span>
          <span><b>기존 파일에서 시작</b><small>Guitar Pro 또는 FretFlow JSON 파일을 열 수 있습니다.</small></span>
          <span className="btn">파일 선택</span>
          <input type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.json" hidden onChange={e => {
            const file = e.target.files?.[0];
            if (file) { onCancel(); onImport(file); }
          }} />
        </label>

        <div className="form-actions">
          <button type="button" className="btn" onClick={onCancel}>취소</button>
          <button type="submit" className="btn primary">악보 만들기</button>
        </div>
      </form>
    </Modal>
  );
}
