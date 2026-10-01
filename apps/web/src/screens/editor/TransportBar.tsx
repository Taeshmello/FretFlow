import { Metronome, Pause, Play, Repeat } from 'lucide-react';
import type { ReactNode } from 'react';
import { Popover } from '../../ui/Popover';
import { speedPresets, speedRange } from '../../app/plan';
import { usePlan } from '../../app/session';
import { ProUpgradeButton } from '../../ui/ProUpgrade';

interface Props {
  playing: boolean;
  ready: boolean;
  position: string;
  onPlayPause: () => void;
  loopLabel: string | null;
  looping: boolean;
  canLoop: boolean;
  onLoop: () => void;
  speed: number;
  onSpeed: (s: number) => void;
  tempo: number;
  tempoEditor: ReactNode;
  click: boolean;
  onClick: () => void;
  countIn: boolean;
  onCountIn: () => void;
  hasRecording: boolean;
  onRecording: () => void;
  /** Slider position: 0 = synth only … 1 = the song recording only. */
  mix: number;
  onMix: (m: number) => void;
}

/** Play button, position and practice pills (design page 1). */
export function TransportBar(p: Props) {
  const plan = usePlan();
  const range = speedRange(plan);
  return (
    <div className="transport" role="toolbar" aria-label="Playback">
      <button type="button" className="play-btn" aria-label={p.playing ? 'Pause' : 'Play'} disabled={!p.ready} title="Play / pause (Space)" onClick={p.onPlayPause}>
        {p.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>
      <span className="position mono">{p.ready ? p.position : 'Loading sound…'}</span>
      <button type="button" className={`pill${p.looping ? ' is-loop' : ''}`} aria-pressed={p.looping} disabled={!p.canLoop && !p.looping} onClick={p.onLoop} title="Loop the selected bars">
        <Repeat size={16} /> {p.loopLabel ?? 'Loop'}
      </button>
      <Popover
        label="Speed"
        trigger={() => (
          <button type="button" className="pill">
            Speed <b className="mono">{Math.round(p.speed * 100)}%</b>
          </button>
        )}
      >
        <div className="settings">
          <h4>Speed · pitch stays the same</h4>
          <input type="range" min={range[0] * 100} max={range[1] * 100} step={5} value={Math.round(p.speed * 100)} onChange={e => p.onSpeed(Number(e.target.value) / 100)} />
          <div className="chips">
            {speedPresets(plan).map(v => (
              <button key={v} type="button" className="chip mono" aria-pressed={Math.round(p.speed * 100) === v} onClick={() => p.onSpeed(v / 100)}>
                {v}%
              </button>
            ))}
          </div>
          <p className="muted small">{plan === 'pro' ? 'Pro: 25–150%.' : '25–150% comes with Pro.'}</p>
          {plan !== 'pro' && <ProUpgradeButton label="Explore Pro speeds" className="chip" />}
        </div>
      </Popover>
      <button type="button" className="pill" disabled title="Pitch control is planned for Pro">
        Pitch <b className="mono">0</b>
      </button>
      <Popover
        label="Tempo"
        trigger={() => (
          <button type="button" className="pill">
            ♩= <b className="mono">{p.tempo}</b>
          </button>
        )}
      >
        {p.tempoEditor}
      </Popover>
      <button type="button" className="pill" aria-pressed={p.click} onClick={p.onClick}>
        <Metronome size={16} /> Click
      </button>
      <button type="button" className="pill" aria-pressed={p.countIn} onClick={p.onCountIn}>
        Count-in 1 bar
      </button>
      <div className="mixer">
        <button type="button" className="link-quiet" onClick={p.onRecording} title={p.hasRecording ? 'Replace the recording' : 'Add a recording'}>
          Recording
        </button>
        <span className="muted">Synth</span>
        <input type="range" min={0} max={100} value={Math.round(p.mix * 100)} aria-label="Synth to song balance" disabled={!p.hasRecording} onChange={e => p.onMix(Number(e.target.value) / 100)} />
        <span className="muted">Song</span>
      </div>
    </div>
  );
}
