import { useState } from 'react';
import type { PrintOptions } from '../../app/files';
import { printsFooter } from '../../app/plan';
import { usePlan } from '../../app/session';
import { Modal } from '../Modal';
import { ProUpgradeButton } from '../ProUpgrade';

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
  const plan = usePlan();
  const selections = [
    { id: 'pdf', title: 'PDF', detail: 'Print or read anywhere' },
    { id: 'midi', title: 'MIDI', detail: 'Open in a DAW' },
    { id: 'gp', title: 'Guitar Pro', detail: 'Keep editing in Guitar Pro' },
    { id: 'json', title: 'FretFlow file', detail: 'Full backup of this score' },
  ] as const;
  const exportFile = () => {
    if (format === 'pdf') {
      p.onPdf({ paper, staves, range: useSelection && p.selection ? p.selection : null, footer: printsFooter(plan) });
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
          <p className="muted small export-help">{format === 'pdf' ? `Choose “Save as PDF” in the print window. ${printsFooter(plan) ? 'Free exports have a small “Made with FretFlow” footer; Pro removes it.' : 'Pro: no FretFlow footer.'}` : 'Recordings and beat maps are never included in exported files.'}</p>
          {format === 'pdf' && plan !== 'pro' && <ProUpgradeButton label="Remove footer with Pro" className="ghost small" />}
        </div>
        <div className="export-preview" aria-label="Page layout preview">
          <div className={`preview-page ${paper}`}>
            <div className="preview-title">Score export</div>
            <div className="preview-caption">{staves === 'scoreTab' ? 'Staff + TAB' : staves === 'score' ? 'Staff' : 'TAB'} · {paper.toUpperCase()}</div>
            <div className="preview-system" /><div className="preview-system" /><div className="preview-system" />
            {printsFooter(plan) && <div className="preview-footer">Made with FretFlow</div>}
          </div>
          <span className="muted small">Layout preview · the real pages appear in the print window</span>
        </div>
      </div>
      <footer className="export-actions"><button type="button" className="btn" onClick={p.onClose}>Cancel</button><button type="button" className="btn primary" onClick={exportFile}>{format === 'pdf' ? 'Print / Save as PDF' : 'Download file'}</button></footer>
    </Modal>
  );
}
