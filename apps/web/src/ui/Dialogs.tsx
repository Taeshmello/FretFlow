import { useState } from 'react';
import type { PrintOptions } from '../app/files';
import { printsFooter } from '../app/plan';
import { usePlan } from '../app/session';
import { Modal } from './Modal';
import { ProUpgradeButton } from './ProUpgrade';
export { Modal } from './Modal';

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

const SHORTCUTS: [string, string][] = [
  ['0–9', 'Fret (two digits within 0.6 s = one two-digit fret)'],
  ['↑ ↓', 'String up / down'],
  ['← →', 'Beat (→ on the last beat adds a beat while the bar has room, then a bar)'],
  ['Shift + arrows', 'Extend the selection'],
  ['⌘/Ctrl + ← →', 'Bar'],
  ['+ / -', 'Shorter / longer duration'],
  ['.', 'Dots 0 → 1 → 2'],
  ['⌘/Ctrl + 3', 'Triplet'],
  ['R', 'Rest'],
  ['Enter', 'Insert a beat with the same duration'],
  ['Delete / Backspace', 'Delete note / delete beat'],
  ['H P · S · B · V', 'Hammer-on/pull-off · slide · bend (½ / full / 1½ / 2 in the panel) · vibrato'],
  ['M · X · L · T', 'Palm mute · dead note · let ring · tie'],
  ['Shift + T', 'Tapping'],
  ['Shift + R', 'Tremolo picking: eighths → sixteenths → thirty-seconds → none'],
  ['N', 'Harmonic: natural → artificial → pinch → none (tapped, semi, feedback in the panel)'],
  ['Piano: A–G', 'Add or remove a note (Shift = sharp), Z / X octave, ↑ ↓ transpose'],
  ['Piano: P', 'Sustain pedal on this beat: down → up → none'],
  ['Drums: 1–9, 0', 'Kick, snare, hi-hat, open hi-hat, crash, ride, toms, side stick'],
  ['⌘/Ctrl + Z / ⇧Z', 'Undo / redo'],
  ['⌘/Ctrl + C / X / V', 'Copy / cut / paste (whole bars paste over the bars from the cursor)'],
  ['⇧⌘/Ctrl + ← →', 'Select whole bars'],
  ['⇧⌘/Ctrl + V', 'Paste copied bars as new bars before the cursor bar'],
  ['Space', 'Play / pause from the cursor'],
  ['? · ⌘/Ctrl + K', 'This list'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const [licenses, setLicenses] = useState(false);
  if (licenses) {
    return <LicensesDialog onClose={onClose} />;
  }
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
      <p className="muted small">
        <button type="button" className="link" onClick={() => setLicenses(true)}>
          Open-source licenses
        </button>
      </p>
    </Modal>
  );
}

/** Third-party code and assets shipped in the client bundle (MPL-2.0 asks us to point to alphaTab's source). */
const LICENSES: { name: string; use: string; license: string; url: string }[] = [
  { name: 'alphaTab', use: 'Score rendering, synthesizer, Guitar Pro import/export', license: 'MPL-2.0', url: 'https://github.com/CoderLine/alphaTab' },
  { name: 'Bravura', use: 'Music notation font', license: 'SIL OFL 1.1', url: 'https://github.com/steinbergmedia/bravura' },
  { name: 'Sonivox soundfont', use: 'Instrument sounds for playback · based on Sonivox EAS, © 2004–2006 Sonic Network Inc. (AOSP)', license: 'Apache-2.0', url: 'https://musical-artifacts.com/artifacts/1517' },
  { name: 'FluidR3Mono GM soundfont', use: 'Default instrument sounds · Frank Wen, Michael Cowgill and contributors', license: 'MIT', url: 'https://github.com/musescore/MuseScore/blob/2.1/share/sound/FluidR3Mono_License.md' },
  { name: 'Inter', use: 'Interface font', license: 'SIL OFL 1.1', url: 'https://github.com/rsms/inter' },
  { name: 'JetBrains Mono', use: 'Numbers and frets font', license: 'SIL OFL 1.1', url: 'https://github.com/JetBrains/JetBrainsMono' },
  { name: 'Lucide', use: 'Icons', license: 'ISC', url: 'https://github.com/lucide-icons/lucide' },
  { name: 'React', use: 'User interface', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'idb', use: 'Browser storage', license: 'ISC', url: 'https://github.com/jakearchibald/idb' },
  { name: 'ulid', use: 'Identifiers', license: 'MIT', url: 'https://github.com/ulid/javascript' },
];

export function LicensesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Open-source licenses" onClose={onClose} wide>
      <p className="muted small">FretFlow is built with these open-source projects. alphaTab is used unmodified; its source code is available at the link below.</p>
      <ul className="report licenses">
        {LICENSES.map(l => (
          <li key={l.name}>
            <span>
              <b>{l.name}</b> <span className="muted">— {l.use}</span>
            </span>
            <a href={l.url} target="_blank" rel="noreferrer">
              {l.license}
            </a>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

const STEPS = [
  { title: 'Type straight into the tab', body: 'Press a number to put that fret on the cursor string. Press 1 then 2 quickly for fret 12.' },
  { title: 'Move around', body: '↑↓ change string, ←→ change beat. → on the last beat fills the bar with beats of the same length, then adds a bar. You can also click the score.' },
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
