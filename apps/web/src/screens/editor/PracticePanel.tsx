import { Metronome, Repeat } from 'lucide-react';
import { canUseSpeedTrainer, speedPresets, speedRange } from '../../app/plan';
import { usePlan } from '../../app/session';
import type { SpeedTrainer } from '../../player/useSpeedTrainer';

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
  trainer: SpeedTrainer;
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
      <div className="practice-control-divider" />
      <div className="trainer-head"><h4>Speed trainer</h4><span className="plan-badge pro">Pro</span></div>
      {!canUseSpeedTrainer(plan) ? (
        <p className="muted small">Repeat a passage and automatically raise the speed after each loop. Available with Pro; checkout is not live yet.</p>
      ) : (
        <div className="trainer-controls">
          <div className="trainer-fields">
            <label>Start
              <select aria-label="Trainer start speed" value={p.trainer.config.startPercent} disabled={!!p.trainer.state?.active} onChange={e => {
                const startPercent = Number(e.target.value);
                p.trainer.setConfig(c => ({ ...c, startPercent, targetPercent: Math.max(c.targetPercent, startPercent + 5) }));
              }}>
                {Array.from({ length: 25 }, (_, i) => 25 + i * 5).map(v => <option key={v} value={v}>{v}%</option>)}
              </select>
            </label>
            <label>Target
              <select aria-label="Trainer target speed" value={p.trainer.config.targetPercent} disabled={!!p.trainer.state?.active} onChange={e => {
                const targetPercent = Number(e.target.value);
                p.trainer.setConfig(c => ({ ...c, targetPercent, startPercent: Math.min(c.startPercent, targetPercent - 5) }));
              }}>
                {Array.from({ length: 25 }, (_, i) => 30 + i * 5).map(v => <option key={v} value={v}>{v}%</option>)}
              </select>
            </label>
            <label>Per loop
              <select aria-label="Trainer increase per loop" value={p.trainer.config.stepPercent} disabled={!!p.trainer.state?.active} onChange={e => p.trainer.setConfig(c => ({ ...c, stepPercent: Number(e.target.value) }))}>
                {[5, 10, 15, 20, 25].map(v => <option key={v} value={v}>+{v}%</option>)}
              </select>
            </label>
          </div>
          {p.trainer.state && <p className="muted small" role="status">{p.trainer.state.completed ? 'Target reached' : `Loop ${p.trainer.state.loops} · now ${p.trainer.state.currentPercent}%`}</p>}
          <button type="button" className="btn primary" disabled={!p.looping && !p.trainer.state?.active} onClick={p.trainer.state?.active ? p.trainer.stop : p.trainer.start}>
            {p.trainer.state?.active ? 'Stop trainer' : p.trainer.state?.completed ? 'Restart trainer' : 'Start trainer'}
          </button>
          {!p.looping && <p className="muted small">Turn on a score or recording loop first.</p>}
        </div>
      )}
    </aside>
  );
}
