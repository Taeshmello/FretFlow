import { secondsToTick, tickToSeconds, type SyncMap } from '@fretflow/audio-engine';

/** W6 target: score cursor and recording within ±20 ms. */
export const SYNC_TOLERANCE_MS = 20;

/**
 * How far the synth is ahead (+) or behind (−) the recording, in wall-clock ms.
 * The gap is measured in audio time through the beat map, then stretched by the
 * playback rate because both sides are slowed down together.
 */
export function synthOffsetMs(map: SyncMap, audioSeconds: number, synthTick: number, rate: number): number {
  return ((tickToSeconds(map, synthTick) - audioSeconds) * 1000) / rate;
}

/** The tick the synth should jump to, or null when it is within tolerance. */
export function synthCorrection(map: SyncMap, audioSeconds: number, synthTick: number, rate: number, toleranceMs = SYNC_TOLERANCE_MS): number | null {
  return Math.abs(synthOffsetMs(map, audioSeconds, synthTick, rate)) > toleranceMs ? secondsToTick(map, audioSeconds) : null;
}
