import { Modal } from '../Modal';

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
