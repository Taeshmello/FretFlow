import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PrintOptions } from '../app/files';

export function Modal({ title, onClose, children, wide, className = '' }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
    }
  }, []);
  return (
    <dialog ref={ref} className={`modal${wide ? ' wide' : ''} ${className}`} onClose={onClose} onCancel={onClose} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button type="button" className="icon" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

interface ExportProps {
  barCount: number;
  selection: [number, number] | null;
  onClose: () => void;
  onPdf: (o: PrintOptions) => void;
  onMidi: () => void;
  onGp: () => void;
  onJson: () => void;
}

export function ExportDialog(p: ExportProps) {
  const [paper, setPaper] = useState<PrintOptions['paper']>('a4');
  const [staves, setStaves] = useState<PrintOptions['staves']>('scoreTab');
  const [useSelection, setUseSelection] = useState(false);
  const [format, setFormat] = useState<'pdf' | 'midi' | 'gp' | 'json'>('pdf');
  const selections = [
    { id: 'pdf', title: 'PDF', detail: 'Print or read anywhere' },
    { id: 'midi', title: 'MIDI', detail: 'Open in a DAW' },
    { id: 'gp', title: 'Guitar Pro', detail: 'Keep editing in Guitar Pro' },
    { id: 'json', title: 'FretFlow file', detail: 'Full backup of this score' },
  ] as const;
  const exportFile = () => {
    if (format === 'pdf') {
      p.onPdf({ paper, staves, range: useSelection && p.selection ? p.selection : null });
    } else if (format === 'midi') {
      p.onMidi();
    } else if (format === 'gp') {
      p.onGp();
    } else {
      p.onJson();
    }
  };
  return (
    <Modal title="Export" onClose={p.onClose} wide className="export-modal">
      <div className="export-layout">
        <div className="export-options">
          <div className="export-formats" role="radiogroup" aria-label="File format">
            {selections.map(item => (
              <button key={item.id} type="button" className="export-format" role="radio" aria-checked={format === item.id} onClick={() => setFormat(item.id)}>
                <b>{item.title}</b><small>{item.detail}</small>
              </button>
            ))}
          </div>
          {format === 'pdf' && (
            <div className="export-pdf-options">
              <fieldset className="form-group">
                <legend>Show</legend>
                <div className="segmented"><button type="button" aria-pressed={staves === 'scoreTab'} onClick={() => setStaves('scoreTab')}>Staff + TAB</button><button type="button" aria-pressed={staves === 'tab'} onClick={() => setStaves('tab')}>TAB only</button><button type="button" aria-pressed={staves === 'score'} onClick={() => setStaves('score')}>Staff only</button></div>
              </fieldset>
              <fieldset className="form-group">
                <legend>Bars</legend>
                <div className="segmented"><button type="button" aria-pressed={!useSelection} onClick={() => setUseSelection(false)}>All (1–{p.barCount})</button><button type="button" aria-pressed={useSelection} disabled={!p.selection} onClick={() => setUseSelection(true)}>Selection {p.selection ? `${p.selection[0]}–${p.selection[1]}` : 'none'}</button></div>
              </fieldset>
              <fieldset className="form-group">
                <legend>Paper</legend>
                <div className="segmented"><button type="button" aria-pressed={paper === 'letter'} onClick={() => setPaper('letter')}>Letter</button><button type="button" aria-pressed={paper === 'a4'} onClick={() => setPaper('a4')}>A4</button></div>
              </fieldset>
            </div>
          )}
          <p className="muted small export-help">{format === 'pdf' ? 'Choose “Save as PDF” in the print window. Free exports have a small “Made with FretFlow” footer.' : 'Recordings and beat maps are never included in exported files.'}</p>
        </div>
        <div className="export-preview" aria-label="Page layout preview">
          <div className={`preview-page ${paper}`}>
            <div className="preview-title">Score export</div>
            <div className="preview-caption">{staves === 'scoreTab' ? 'Staff + TAB' : staves === 'score' ? 'Staff' : 'TAB'} · {paper.toUpperCase()}</div>
            <div className="preview-system" /><div className="preview-system" /><div className="preview-system" />
            <div className="preview-footer">Made with FretFlow</div>
          </div>
          <span className="muted small">Layout preview · the real pages appear in the print window</span>
        </div>
      </div>
      <footer className="export-actions"><button type="button" className="btn" onClick={p.onClose}>Cancel</button><button type="button" className="btn primary" onClick={exportFile}>{format === 'pdf' ? 'Print / Save as PDF' : 'Download file'}</button></footer>
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['0–9', 'Fret (two digits within 0.6 s = one two-digit fret)'],
  ['↑ ↓', 'String up / down'],
  ['← →', 'Beat (→ on the last beat adds a bar)'],
  ['Shift + arrows', 'Extend the selection'],
  ['⌘/Ctrl + ← →', 'Bar'],
  ['+ / -', 'Shorter / longer duration'],
  ['.', 'Dots 0 → 1 → 2'],
  ['⌘/Ctrl + 3', 'Triplet'],
  ['R', 'Rest'],
  ['Enter', 'Insert a beat with the same duration'],
  ['Delete / Backspace', 'Delete note / delete beat'],
  ['H P · S · B · V', 'Hammer-on/pull-off · slide · bend · vibrato'],
  ['M · X · L · T', 'Palm mute · dead note · let ring · tie'],
  ['Piano: A–G', 'Add or remove a note (Shift = sharp), Z / X octave, ↑ ↓ transpose'],
  ['Drums: 1–9, 0', 'Kick, snare, hi-hat, open hi-hat, crash, ride, toms, side stick'],
  ['⌘/Ctrl + Z / ⇧Z', 'Undo / redo'],
  ['⌘/Ctrl + C / X / V', 'Copy / cut / paste'],
  ['Space', 'Play / pause from the cursor'],
  ['? · ⌘/Ctrl + K', 'This list'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <dl className="shortcuts">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

const STEPS = [
  { title: 'Type straight into the tab', body: 'Press a number to put that fret on the cursor string. Press 1 then 2 quickly for fret 12.' },
  { title: 'Move around', body: '↑↓ change string, ←→ change beat. → on the last beat adds a bar. You can also click the score.' },
  { title: 'Rhythm and technique', body: '+ / − change duration, . adds a dot, R makes a rest. H hammer-on, S slide, B bend, M palm mute — or use the panel on the right.' },
  { title: 'Listen and practise', body: 'Space plays from the cursor. Add your own recording to slow it down and loop a passage.' },
  { title: 'Saved as you go', body: 'Your score saves in this browser a second after each edit. Press ? any time for shortcuts. Piano and drums: letters A–G or number keys.' },
];

export function Tutorial({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  return (
    <Modal title={`Getting started ${i + 1}/${STEPS.length}`} onClose={onClose}>
      <h3 className="tut-title">{step.title}</h3>
      <p className="tut-body">{step.body}</p>
      <div className="tut-nav">
        <button type="button" className="ghost" onClick={onClose}>
          Skip
        </button>
        <span className="dots" aria-hidden="true">
          {STEPS.map((_, k) => (
            <span key={k} className={k === i ? 'on' : ''} />
          ))}
        </span>
        {i < STEPS.length - 1 ? (
          <button type="button" className="primary" onClick={() => setI(i + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="primary" onClick={onClose}>
            Start
          </button>
        )}
      </div>
    </Modal>
  );
}

export function ImportReport({ items, onClose }: { items: Map<string, number>; onClose: () => void }) {
  return (
    <Modal title="Import result" onClose={onClose}>
      <p>The score was imported. These elements aren’t supported in FretFlow yet, so they were dropped or simplified.</p>
      <ul className="report">
        {[...items].map(([what, n]) => (
          <li key={what}>
            <span>{what}</span>
            <b>{n}</b>
          </li>
        ))}
      </ul>
      <button type="button" className="primary" onClick={onClose}>
        OK
      </button>
    </Modal>
  );
}

export function ConflictDialog({ title, onOverwrite, onTakeServer, onClose }: { title: string; onOverwrite: () => void; onTakeServer: () => void; onClose: () => void }) {
  return (
    <Modal title="Changed on another device" onClose={onClose}>
      <p>
        <b>{title}</b> was saved on another device first. Which version do you want to keep? Nothing is merged automatically.
      </p>
      <div className="tut-nav">
        <button type="button" className="ghost" onClick={onTakeServer}>
          Load the server version
        </button>
        <button type="button" className="primary" onClick={onOverwrite}>
          Keep this device’s version
        </button>
      </div>
    </Modal>
  );
}
