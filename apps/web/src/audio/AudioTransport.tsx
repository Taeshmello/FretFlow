interface Props {
  playing: boolean;
  /** "0:01.2 / 0:20.0 · 마디 2" */
  label: string;
  rate: number;
  onRate: (rate: number) => void;
  onPlayPause: () => void;
  canLoopSelection: boolean;
  onLoopSelection: () => void;
  hasLoop: boolean;
  onClearLoop: () => void;
  onTogether: () => void;
  metronome: boolean;
  onMetronome: () => void;
  /** 0 = original audio only, 1 = synth only. */
  mix: number;
  onMix: (mix: number) => void;
  fileName: string;
  onFile: (file: File) => void;
}

/** Transport row of the practice-audio panel. Stateless; the panel owns the player. */
export function AudioTransport(p: Props) {
  return (
    <div className="audio-controls">
      <button type="button" className="tool play" onClick={p.onPlayPause}>
        {p.playing ? '❚❚' : '▶'}
      </button>
      <span className="time">{p.label}</span>
      <label className="speed" title="속도 (음높이 유지)">
        <span>{Math.round(p.rate * 100)}%</span>
        <input type="range" min={50} max={100} step={5} value={Math.round(p.rate * 100)} onChange={e => p.onRate(Number(e.target.value) / 100)} />
      </label>
      <button type="button" className="chip" disabled={!p.canLoopSelection} onClick={p.onLoopSelection}>
        선택 마디 반복
      </button>
      <button type="button" className="chip" disabled={!p.hasLoop} onClick={p.onClearLoop}>
        반복 해제
      </button>
      <button type="button" className="chip" title="원음과 신스를 같은 위치에서 함께 재생 (크로스페이더로 비율 조절)" onClick={p.onTogether}>
        {p.playing ? '함께 정지' : '악보와 함께'}
      </button>
      <button type="button" className="chip" aria-pressed={p.metronome} onClick={p.onMetronome} title="비트 맵을 따라가는 클릭">
        메트로놈
      </button>
      <label className="speed" title="원음 ↔ 신스">
        <span>원음</span>
        <input type="range" min={0} max={100} value={Math.round(p.mix * 100)} onChange={e => p.onMix(Number(e.target.value) / 100)} />
        <span>신스</span>
      </label>
      <span className="muted small file-name">{p.fileName}</span>
      <label className="chip">
        바꾸기
        <input type="file" accept="audio/*" hidden onChange={e => e.target.files?.[0] && p.onFile(e.target.files[0])} />
      </label>
    </div>
  );
}
