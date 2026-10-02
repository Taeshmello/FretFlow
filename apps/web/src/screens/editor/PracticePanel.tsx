import { Metronome, Repeat } from 'lucide-react';
import { useState } from 'react';
import { canUseSpeedTrainer, speedPresets, speedRange } from '../../app/plan';
import { usePlan } from '../../app/session';
import type { SpeedTrainer } from '../../player/useSpeedTrainer';
import type { PracticeRoutine } from '../../player/usePracticeRoutine';
import { ProFeaturePreview, ProUpgradeButton } from '../../ui/ProUpgrade';

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
  routine: PracticeRoutine;
}

/** Controls kept beside the score on desktop and below it on touch screens. */
export function PracticePanel(p: Props) {
  const plan = usePlan();
  const [sectionName, setSectionName] = useState('');
  const [targetReps, setTargetReps] = useState(3);
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
      {plan !== 'pro' && <ProUpgradeButton label="See Pro speed range" className="ghost small" />}
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
      {!canUseSpeedTrainer(plan) ? (
        <ProFeaturePreview title="Speed trainer" description="Repeat a passage and raise the speed after each loop." preview="60% → 65% → 70% → target" />
      ) : (<>
        <div className="trainer-head"><h4>Speed trainer</h4><span className="plan-badge pro">Pro</span></div>
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
      </>)}
      <div className="practice-control-divider" />
      {plan !== 'pro' ? (
        <ProFeaturePreview title="Practice routine" description="Save passages, practise them in order, and track completed sessions with Pro." preview="Intro · 3 loops  →  Solo · 5 loops" />
      ) : (<>
        <div className="trainer-head"><h4>Practice routine</h4><span className="plan-badge pro">Pro</span></div>
        <div className="trainer-controls">
          <p className="muted small">Saved in this browser and synced across your devices when online. Select bars, save a passage, then start the routine and press Play.</p>
          <label>Passage name
            <input aria-label="Passage name" maxLength={60} value={sectionName} placeholder={loopText} onChange={e => setSectionName(e.target.value)} />
          </label>
          <label>Loops to complete
            <select aria-label="Loops to complete" value={targetReps} onChange={e => setTargetReps(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button type="button" className="btn" disabled={!p.routine.ready || p.routine.sections.length >= 30} onClick={() => {
            const bars = p.loopBars ?? [p.currentBar, p.currentBar];
            if (p.routine.add(sectionName, bars, targetReps)) setSectionName('');
          }}>Save passage</button>
          {p.routine.error && <p className="small banner error" role="alert">{p.routine.error}</p>}
          {p.routine.conflict && <div className="practice-section-actions">
            <button type="button" className="btn" onClick={() => void p.routine.resolveConflict('local')}>Keep this device</button>
            <button type="button" className="btn" onClick={() => void p.routine.resolveConflict('cloud')}>Use cloud version</button>
          </div>}
          {p.routine.sections.length > 0 && (
            <>
              <button type="button" className="btn primary" onClick={() => p.routine.activeId ? p.routine.stop() : p.routine.start()}>
                {p.routine.activeId ? 'Stop routine' : 'Start routine'}
              </button>
              <ol className="practice-sections">
                {p.routine.sections.map(section => (
                  <li key={section.id} className={p.routine.activeId === section.id ? 'active' : ''}>
                    <div><strong>{section.name}</strong><span className="muted small">Bars {section.startBar}–{section.endBar} · {p.routine.activeId === section.id ? `${p.routine.repetitions}/${section.targetReps} loops` : `${section.targetReps} loops`}</span></div>
                    <span className="muted small">Completed {section.completedSessions} {section.completedSessions === 1 ? 'time' : 'times'}{section.lastPracticedAt ? ` · Last ${new Date(section.lastPracticedAt).toLocaleDateString()}` : ''}</span>
                    <div className="practice-section-actions">
                      <button type="button" className="ghost small" onClick={() => p.routine.start(section.id)}>Practise</button>
                      <button type="button" className="ghost small" aria-label={`Remove ${section.name}`} onClick={() => p.routine.remove(section.id)}>Remove</button>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </>)}
    </aside>
  );
}
