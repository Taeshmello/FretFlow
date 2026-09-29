import { Upload } from 'lucide-react';
import { BeatMapControls } from './BeatMapControls';
import type { Recording } from './useRecording';
import { Waveform } from './Waveform';
import type { Score } from '@fretflow/score-model';

interface Props {
  rec: Recording;
  score: Score;
  showBeatMap: boolean;
  onSetTempo: (bpm: number) => void;
}

/** The recording's waveform with bar lines and the loop (design page 1), or an upload prompt. */
export function WaveformCard({ rec, score, showBeatMap, onSetTempo }: Props) {
  if (!rec.loaded) {
    return (
      <label className="wave-card card empty">
        <span className="wave-empty-icon">
          <Upload size={20} />
        </span>
        <span>
          <b>음원을 추가해 함께 연습하세요</b>
          <span className="muted"> MP3, WAV, M4A · 최대 15분. 음원은 이 기기에만 저장되며 악보에 포함되지 않습니다.</span>
        </span>
        <span className="btn">파일 선택</span>
        <input type="file" accept="audio/*" hidden onChange={e => e.target.files?.[0] && void rec.open(e.target.files[0])} />
        {rec.error && <span className="error-text">{rec.error}</span>}
      </label>
    );
  }
  return (
    <div className="wave-card card">
      <input type="file" accept="audio/*" hidden aria-label="음원 교체" onChange={e => e.target.files?.[0] && void rec.open(e.target.files[0])} />
      <Waveform
        peaks={rec.peaks}
        duration={rec.duration}
        time={rec.time}
        loop={rec.loop}
        barLines={rec.barLines}
        onSeek={rec.seek}
        onLoop={rec.setLoop}
        onMoveBarLine={rec.moveBarLine}
      />
      {showBeatMap && <BeatMapControls score={score} time={rec.time} map={rec.map} onMap={rec.setMap} onSetTempo={onSetTempo} />}
      {rec.error && <p className="error-text">{rec.error}</p>}
    </div>
  );
}
