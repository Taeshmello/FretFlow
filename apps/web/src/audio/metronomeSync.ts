import { tickToSeconds, type MeterProvider, type SyncMap, type TempoMap } from '@fretflow/audio-engine';
import { TICKS_PER_QUARTER } from '@fretflow/score-model';

/**
 * Meter that follows the recording: each bar's BPM is measured from the beat map
 * (so tap-tempo maps and dragged bar lines are honoured), scaled by the playback rate.
 */
export function beatMapMeter(map: SyncMap, tempo: TempoMap, rate: number): MeterProvider {
  return bar => {
    const b = tempo.bars[Math.min(Math.max(bar, 0), tempo.bars.length - 1)];
    const secs = tickToSeconds(map, b.startTick + b.ticks) - tickToSeconds(map, b.startTick);
    const bpm = secs > 0 ? ((b.ticks / TICKS_PER_QUARTER) * 60) / secs : b.bpm;
    return { bpm: bpm * rate, timeSig: b.timeSig };
  };
}

/** First bar line at or after `audioSeconds`, and how long until it at this rate (wall-clock seconds). */
export function nextBarLine(map: SyncMap, tempo: TempoMap, audioSeconds: number, rate: number): { bar: number; inSeconds: number } | null {
  const next = tempo.bars.find(b => tickToSeconds(map, b.startTick) >= audioSeconds - 0.001);
  if (!next) {
    return null;
  }
  return { bar: next.index, inSeconds: (tickToSeconds(map, next.startTick) - audioSeconds) / rate };
}
