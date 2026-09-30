import { Metronome, Repeat } from 'lucide-react';
import { speedPresets, speedRange } from '../../app/plan';
import { usePlan } from '../../app/session';

interface Props {
  speed: number;
  onSpeed: (speed: number) => void;
  looping: boolean;
  loopBars: [number, number] | null;
  currentBar: number;
  onLoop: () => void;
  metronome: boolean;
  onMetronome: () => void;
  hasRecording: boolean;
}

/** Controls kept beside the score on desktop and below it on touch screens. */
export function PracticePanel(p: Props) {
  const plan = usePlan();
  const [min, max] = speedRange(plan);
  const loopText = p.loopBars
    ? `Bars ${p.loopBars[0]}${p.loopBars[0] === p.loopBars[1] ? '' : `–${p.loopBars[1]}`}`
    : `Current bar ${p.currentBar}`;

  return (
    <aside className="practice-rail card" aria-label="Practice tools">
      <h3>Practice</h3>
      <div className="practice-control-head">
        <span>Speed</span>
        <strong className="mono">{Math.round(p.speed * 100)}%</strong>
      </div>
      <input
        className="practice-speed"
        type="range"
        min={min * 100}
        max={max * 100}
        step={5}
        value={Math.round(p.speed * 100)}
        aria-label="Speed"
        onChange={e => p.onSpeed(Number(e.target.value) / 100)}
      />
      <div className="practice-speed-presets" role="group" aria-label="Speed presets">
        {speedPresets(plan).map(value => (
          <button type="button" key={value} aria-pressed={Math.round(p.speed * 100) === value} onClick={() => p.onSpeed(value / 100)}>{value}%</button>
        ))}
      </div>
      <p className="muted small">Pitch stays the same when you slow down.{plan === 'pro' ? '' : ' 25–150% comes with Pro.'}</p>
      <div className="practice-control-divider" />
      <button type="button" className={`practice-loop-button${p.looping ? ' active' : ''}`} aria-pressed={p.looping} onClick={p.onLoop}>
        <Repeat size={17} />
        <span>Loop {loopText}</span>
        <b>{p.looping ? 'On' : 'Off'}</b>
      </button>
      <button type="button" className={`practice-loop-button${p.metronome ? ' active' : ''}`} aria-pressed={p.metronome} onClick={p.onMetronome}>
        <Metronome size={17} />
        <span>Metronome</span>
        <b>{p.metronome ? 'On' : 'Off'}</b>
      </button>
      <p className="muted small practice-help">Select bars in the score to loop them.{!p.hasRecording && ' Add a recording to practise with its waveform.'}</p>
    </aside>
  );
}
