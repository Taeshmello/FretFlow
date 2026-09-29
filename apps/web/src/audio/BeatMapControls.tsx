import { setOffsetMs, syncMapFromScore, syncMapFromTapTempo, type SyncMap } from '@fretflow/audio-engine';
import type { Score } from '@fretflow/score-model';
import { useState } from 'react';

interface Props {
  score: Score;
  /** Current audio position in seconds. */
  time: number;
  map: SyncMap;
  onMap: (update: SyncMap | ((m: SyncMap) => SyncMap)) => void;
  onSetTempo: (bpm: number) => void;
}

/** Beat map (SPEC §7): first downbeat, tap tempo, latency offset. Bar lines are dragged on the waveform. */
export function BeatMapControls({ score, time, map, onMap, onSetTempo }: Props) {
  const [taps, setTaps] = useState<number[]>([]);
  const estimate = taps.length >= 4 ? syncMapFromTapTempo(taps[0], taps) : null;
  return (
    <div className="beatmap">
      <b>비트 맵</b>
      <button type="button" className="chip" onClick={() => onMap(syncMapFromScore(score, time))} title="지금 재생 위치를 1마디 첫 박으로">
        여기가 첫 박
      </button>
      <button
        type="button"
        className="chip"
        onClick={() => {
          const next = [...taps, time].slice(-12);
          setTaps(next);
          const est = syncMapFromTapTempo(next[0], next);
          if (est && next.length >= 4) {
            onMap(est.map);
          }
        }}
        title="재생하면서 박자마다 누르세요"
      >
        탭 템포 {taps.length ? `(${taps.length})` : ''}
      </button>
      {taps.length >= 4 && (
        <button
          type="button"
          className="chip"
          onClick={() => {
            const est = syncMapFromTapTempo(taps[0], taps);
            if (est) {
              onSetTempo(Math.round(est.bpm));
              setTaps([]);
            }
          }}
        >
          악보 템포 = {Math.round(estimate?.bpm ?? 0)}
        </button>
      )}
      <label className="speed" title="출력 지연 보정">
        보정
        <input type="number" step={5} value={map.offsetMs} onChange={e => onMap(m => setOffsetMs(m, Number(e.target.value)))} />
        ms
      </label>
      <span className="muted small">Shift+드래그로 마디선을 음원에 맞추세요.</span>
    </div>
  );
}
