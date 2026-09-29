import type { Score } from '@fretflow/score-model';
import type { ScoreSummary } from '@fretflow/storage';
import { useState } from 'react';
import { LicensesDialog } from '../ui/Dialogs';
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
  const [showLicenses, setShowLicenses] = useState(false);

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
          + New score
        </button>
        <label className="button ghost">
          Open file (.gp, .gp3–5, .gpx, .json)
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
        <p className="muted">Loading…</p>
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
          <h2>Write your first score</h2>
          <p>Type tab with your keyboard and standard notation follows. You can also drop a Guitar Pro file here.</p>
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            Create a score
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
                    Delete
                  </button>
                  <button type="button" className="chip" onClick={() => setConfirmDelete(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" className="icon" aria-label={`Delete ${s.title}`} onClick={() => setConfirmDelete(s.id)}>
                  🗑
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <footer className="lib-foot muted small">
        Scores save automatically in this browser. Your recordings are never included in score files or shares.{' '}
        <button type="button" className="link" onClick={() => setShowLicenses(true)}>
          Open-source licenses
        </button>
      </footer>
      {showLicenses && <LicensesDialog onClose={() => setShowLicenses(false)} />}
    </div>
  );
}
