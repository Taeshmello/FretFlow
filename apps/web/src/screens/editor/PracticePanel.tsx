import { Metronome, Repeat } from 'lucide-react';

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
  const loopText = p.loopBars
    ? `${p.loopBars[0]}${p.loopBars[0] === p.loopBars[1] ? '' : `–${p.loopBars[1]}`}마디`
    : `현재 ${p.currentBar}마디`;

  return (
    <aside className="practice-rail card" aria-label="연습 도구">
      <h3>연습 도구</h3>
      <div className="practice-control-head">
        <span>재생 속도</span>
        <strong className="mono">{Math.round(p.speed * 100)}%</strong>
      </div>
      <input
        className="practice-speed"
        type="range"
        min={50}
        max={100}
        step={5}
        value={Math.round(p.speed * 100)}
        aria-label="재생 속도"
        onChange={e => p.onSpeed(Number(e.target.value) / 100)}
      />
      <div className="practice-speed-presets" role="group" aria-label="속도 빠른 선택">
        {[50, 60, 70, 80, 90, 100].map(value => (
          <button type="button" key={value} aria-pressed={Math.round(p.speed * 100) === value} onClick={() => p.onSpeed(value / 100)}>{value}%</button>
        ))}
      </div>
      <p className="muted small">속도를 낮춰도 음높이는 유지됩니다.</p>
      <div className="practice-control-divider" />
      <button type="button" className={`practice-loop-button${p.looping ? ' active' : ''}`} aria-pressed={p.looping} onClick={p.onLoop}>
        <Repeat size={17} />
        <span>{loopText} 반복</span>
        <b>{p.looping ? '켜짐' : '꺼짐'}</b>
      </button>
      <button type="button" className={`practice-loop-button${p.metronome ? ' active' : ''}`} aria-pressed={p.metronome} onClick={p.onMetronome}>
        <Metronome size={17} />
        <span>메트로놈</span>
        <b>{p.metronome ? '켜짐' : '꺼짐'}</b>
      </button>
      <p className="muted small practice-help">악보에서 마디를 선택하면 해당 구간을 반복합니다.{!p.hasRecording && ' 음원을 추가하면 파형을 보며 연습할 수 있습니다.'}</p>
    </aside>
  );
}
