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
      <b>Beat map</b>
      <button type="button" className="chip" onClick={() => onMap(syncMapFromScore(score, time))} title="Make the current position the first beat of bar 1">
        First beat here
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
        title="Tap on every beat while it plays"
      >
        Tap tempo {taps.length ? `(${taps.length})` : ''}
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
          Set score tempo = {Math.round(estimate?.bpm ?? 0)}
        </button>
      )}
      <label className="speed" title="Output latency offset">
        Offset
        <input type="number" step={5} value={map.offsetMs} onChange={e => onMap(m => setOffsetMs(m, Number(e.target.value)))} />
        ms
      </label>
      <span className="muted small">Shift+drag a bar line to align it with the recording.</span>
    </div>
  );
}
