import type { Score } from '@fretflow/score-model';
import type { ScoreSummary } from '@fretflow/storage';
import { useState } from 'react';
import { NewScoreDialog } from './NewScoreDialog';

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
      {creating && <NewScoreDialog onCreate={p.onCreate} onCancel={() => setCreating(false)} onImport={p.onImport} />}
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
