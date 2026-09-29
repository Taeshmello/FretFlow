import { createScore, TUNING_PRESETS, type Instrument, type Score } from '@fretflow/score-model';
import type { ScoreSummary } from '@fretflow/storage';
import { useState } from 'react';

interface Props {
  scores: ScoreSummary[];
  loading: boolean;
  onOpen: (id: string) => void;
  onCreate: (score: Score) => void;
  onImport: (file: File) => void;
  onDelete: (id: string) => void;
  importError: string | null;
  account: React.ReactNode;
}

function NewScoreForm({ onCreate, onCancel }: { onCreate: (s: Score) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [instrument, setInstrument] = useState<Instrument>('guitar');
  const [tuningId, setTuningId] = useState('standard');
  const [capo, setCapo] = useState(0);
  const [timeSig, setTimeSig] = useState('4/4');
  const [tempo, setTempo] = useState(120);
  const presets = TUNING_PRESETS.filter(p => p.instrument === instrument);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const preset = presets.find(p => p.id === tuningId) ?? presets[0];
    onCreate(
      createScore({
        title: title.trim() || '제목 없음',
        artist: artist.trim() || undefined,
        instrument,
        tuning: preset.tuning,
        capo,
        timeSig: timeSig.split('/').map(Number) as [number, number],
        tempo,
        bars: 8,
      }),
    );
  }

  return (
    <form className="new-score" onSubmit={submit}>
      <h2>새 악보</h2>
      <div className="field-row">
        <label className="field grow">
          제목
          <input autoFocus value={title} placeholder="제목 없음" onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="field grow">
          아티스트
          <input value={artist} onChange={e => setArtist(e.target.value)} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          악기
          <select
            value={instrument}
            onChange={e => {
              const next = e.target.value as Instrument;
              setInstrument(next);
              setTuningId(next === 'bass' ? 'bassStandard' : 'standard');
            }}
          >
            <option value="guitar">기타 (6현)</option>
            <option value="bass">베이스 (4현)</option>
          </select>
        </label>
        <label className="field">
          튜닝
          <select value={tuningId} onChange={e => setTuningId(e.target.value)}>
            {presets.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          카포
          <input type="number" min={0} max={12} value={capo} onChange={e => setCapo(Number(e.target.value))} />
        </label>
        <label className="field">
          박자
          <select value={timeSig} onChange={e => setTimeSig(e.target.value)}>
            {['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'].map(t => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field">
          템포
          <input type="number" min={20} max={400} value={tempo} onChange={e => setTempo(Number(e.target.value))} />
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="primary">
          만들기
        </button>
      </div>
    </form>
  );
}

export function Library(p: Props) {
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`library${dragging ? ' is-dragging' : ''}`}
      onDragOver={e => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) {
          p.onImport(file);
        }
      }}
    >
      <header className="lib-head">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          FretFlow
        </div>
        {p.account}
      </header>
      <div className="lib-actions">
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          + 새 악보
        </button>
        <label className="button ghost">
          파일 열기 (.gp, .gp3–5, .gpx, .json)
          <input
            type="file"
            accept=".gp,.gp3,.gp4,.gp5,.gpx,.json"
            hidden
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) {
                p.onImport(f);
              }
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {p.importError && <div className="banner error">{p.importError}</div>}
      {creating && <NewScoreForm onCreate={p.onCreate} onCancel={() => setCreating(false)} />}
      {p.loading ? (
        <p className="muted">불러오는 중…</p>
      ) : p.scores.length === 0 && !creating ? (
        <div className="empty">
          <div className="empty-art" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <h2>첫 악보를 만들어 보세요</h2>
          <p>키보드로 TAB을 쓰면 오선보가 자동으로 따라옵니다. Guitar Pro 파일을 여기로 끌어다 놓아도 됩니다.</p>
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            새 악보 만들기
          </button>
        </div>
      ) : (
        <ul className="score-list">
          {p.scores.map(s => (
            <li key={s.id}>
              <button type="button" className="score-item" onClick={() => p.onOpen(s.id)}>
                <span className="t">{s.title}</span>
                <span className="a">{s.artist ?? ''}</span>
                <span className="d">{new Date(s.updatedAt).toLocaleString()}</span>
              </button>
              {confirmDelete === s.id ? (
                <span className="confirm">
                  <button type="button" className="chip danger" onClick={() => p.onDelete(s.id)}>
                    삭제
                  </button>
                  <button type="button" className="chip" onClick={() => setConfirmDelete(null)}>
                    취소
                  </button>
                </span>
              ) : (
                <button type="button" className="icon" aria-label={`${s.title} 삭제`} onClick={() => setConfirmDelete(s.id)}>
                  🗑
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <footer className="lib-foot muted small">
        악보는 이 브라우저에 자동 저장됩니다. 음원은 악보 파일·공유에 포함되지 않습니다. Rendering by alphaTab (MPL-2.0) · Bravura (OFL) · Sonivox (Apache-2.0).
      </footer>
    </div>
  );
}
