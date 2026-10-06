import { useState } from 'react';
import { Modal } from '../Modal';
import { LicensesDialog } from './LicensesDialog';

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
