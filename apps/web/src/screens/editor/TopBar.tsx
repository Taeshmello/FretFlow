import { ArrowLeft, Download, Redo2, Share2, Undo2 } from 'lucide-react';

export type Mode = 'write' | 'practice';

interface Props {
  title: string;
  artist: string;
  onTitle: (title: string) => void;
  saveLabel: string;
  saveError: boolean;
  mode: Mode;
  practiceLocked: boolean;
  onMode: (m: Mode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onBack: () => void;
  /** Sign-in / account button (absent in local-only builds). */
  account?: React.ReactNode;
}

/** Title, breadcrumb and save state; Write/Practice; undo, export, share (design page 1). */
export function TopBar(p: Props) {
  return (
    <header className="topbar">
      <button type="button" className="app-icon" aria-label="My scores" onClick={p.onBack}>
        <ArrowLeft size={20} />
      </button>
      <div className="title-block">
        <input className="title-input" aria-label="Title" value={p.title} onChange={e => p.onTitle(e.target.value)} />
        <span className={`crumb${p.saveError ? ' is-error' : ''}`}>
          My scores{p.artist ? ` / ${p.artist}` : ''} · {p.saveLabel || 'Saved'}
        </span>
      </div>
      <div className="segmented mode" role="radiogroup" aria-label="Mode">
        <button type="button" role="radio" aria-checked={p.mode === 'write'} onClick={() => p.onMode('write')}>
          Write
        </button>
        <button type="button" role="radio" aria-checked={p.mode === 'practice'} onClick={() => p.onMode('practice')}>
          Practice {p.practiceLocked && <span className="plan-badge pro">Pro</span>}
        </button>
      </div>
      <div className="topbar-actions">
        <button type="button" className="icon-btn" aria-label="Undo" title="Undo (⌘Z)" disabled={!p.canUndo} onClick={p.onUndo}>
          <Undo2 size={20} />
        </button>
        <button type="button" className="icon-btn" aria-label="Redo" title="Redo (⌘⇧Z)" disabled={!p.canRedo} onClick={p.onRedo}>
          <Redo2 size={20} />
        </button>
        <button type="button" className="btn export-trigger" onClick={p.onExport} aria-label="Export">
          <Download size={17} /><span>Export</span>
        </button>
        {p.account}
        <button type="button" className="btn primary share-trigger" disabled title="Sharing is coming in a later version">
          <Share2 size={18} /> Share
        </button>
      </div>
    </header>
  );
}
