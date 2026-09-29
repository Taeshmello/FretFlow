import { TICKS_PER_QUARTER } from '@fretflow/score-model';
import type { Score, Tick } from '@fretflow/score-model';
import { buildTempoMap } from './tempoMap';

/** One point where a score tick is pinned to a time in the user's audio file. */
export interface SyncAnchor {
  tick: Tick;
  seconds: number;
}

/**
 * Maps score ticks to seconds of the user's audio (SPEC §7). Kept outside the Score JSON.
 * `anchors` are sorted and strictly increasing in both tick and seconds.
 * `offsetMs` is added to every audio time (output latency compensation): a positive value
 * means the audio is heard later than the anchors say.
 */
export interface SyncMap {
  anchors: SyncAnchor[];
  offsetMs: number;
}

export const DEFAULT_FALLBACK_BPM = 120;

/** Seconds per tick at a quarter-note BPM. */
export function secondsPerTick(bpm: number): number {
  return 60 / (bpm * TICKS_PER_QUARTER);
}

export function emptySyncMap(): SyncMap {
  return { anchors: [], offsetMs: 0 };
}

/** Index of the segment [i, i+1] used for `value`; the first/last segment when outside. */
function segmentIndex(anchors: readonly SyncAnchor[], value: number, key: 'tick' | 'seconds'): number {
  let lo = 0;
  let hi = anchors.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (anchors[mid][key] <= value) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/**
 * Piecewise-linear between anchors. Outside the anchors the nearest segment's slope is
 * extended. With fewer than two anchors the slope comes from `fallbackBpm`.
 */
export function tickToSeconds(map: SyncMap, tick: number, fallbackBpm = DEFAULT_FALLBACK_BPM): number {
  const { anchors } = map;
  const offset = map.offsetMs / 1000;
  if (anchors.length < 2) {
    const base = anchors[0] ?? { tick: 0, seconds: 0 };
    return base.seconds + (tick - base.tick) * secondsPerTick(fallbackBpm) + offset;
  }
  const i = segmentIndex(anchors, tick, 'tick');
  const a = anchors[i];
  const b = anchors[i + 1];
  return a.seconds + ((tick - a.tick) * (b.seconds - a.seconds)) / (b.tick - a.tick) + offset;
}

/** Inverse of `tickToSeconds`, rounded to an integer tick (ticks are never fractional). */
export function secondsToTick(map: SyncMap, seconds: number, fallbackBpm = DEFAULT_FALLBACK_BPM): Tick {
  const { anchors } = map;
  const s = seconds - map.offsetMs / 1000;
  if (anchors.length < 2) {
    const base = anchors[0] ?? { tick: 0, seconds: 0 };
    return Math.round(base.tick + (s - base.seconds) / secondsPerTick(fallbackBpm));
  }
  const i = segmentIndex(anchors, s, 'seconds');
  const a = anchors[i];
  const b = anchors[i + 1];
  return Math.round(a.tick + ((s - a.seconds) * (b.tick - a.tick)) / (b.seconds - a.seconds));
}

/** Smallest gap kept between neighbouring anchors when a drag is clamped. */
export const MIN_ANCHOR_GAP_SECONDS = 0.001;

/**
 * Inserts an anchor, replacing one at the same tick. Returns the map unchanged when the
 * anchor would break strict monotonicity in seconds (a drag should use `moveAnchor`).
 */
export function addAnchor(map: SyncMap, anchor: SyncAnchor): SyncMap {
  const rest = map.anchors.filter(a => a.tick !== anchor.tick);
  const index = rest.findIndex(a => a.tick > anchor.tick);
  const at = index === -1 ? rest.length : index;
  const prev = rest[at - 1];
  const next = rest[at];
  if ((prev && prev.seconds >= anchor.seconds) || (next && next.seconds <= anchor.seconds)) {
    return map;
  }
  const anchors = [...rest.slice(0, at), { tick: anchor.tick, seconds: anchor.seconds }, ...rest.slice(at)];
  return { ...map, anchors };
}

/** Moves the anchor at `tick` to `seconds`, clamped strictly between its neighbours. */
export function moveAnchor(map: SyncMap, tick: Tick, seconds: number): SyncMap {
  const i = map.anchors.findIndex(a => a.tick === tick);
  if (i === -1) {
    return map;
  }
  const prev = map.anchors[i - 1];
  const next = map.anchors[i + 1];
  let s = seconds;
  if (prev) {
    s = Math.max(s, prev.seconds + MIN_ANCHOR_GAP_SECONDS);
  }
  if (next) {
    s = Math.min(s, next.seconds - MIN_ANCHOR_GAP_SECONDS);
  }
  const anchors = map.anchors.map((a, j) => (j === i ? { tick: a.tick, seconds: s } : a));
  return { ...map, anchors };
}

export function removeAnchor(map: SyncMap, tick: Tick): SyncMap {
  const anchors = map.anchors.filter(a => a.tick !== tick);
  return anchors.length === map.anchors.length ? map : { ...map, anchors };
}

export function setOffsetMs(map: SyncMap, offsetMs: number): SyncMap {
  return { ...map, offsetMs: Math.round(offsetMs) };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Intervals further than this fraction from the median are treated as mis-taps. */
export const TAP_OUTLIER_TOLERANCE = 0.25;

/**
 * Estimates the tempo from Space taps (one per beat) and pins `firstBeatSeconds` to tick 0.
 * `ticksPerBeat` is the tapped beat length (960 for quarters, 1440 for dotted quarters in 6/8).
 * Returns null with fewer than two taps. `bpm` is always in quarter notes.
 */
export function syncMapFromTapTempo(
  firstBeatSeconds: number,
  tapTimesSeconds: readonly number[],
  ticksPerBeat: number = TICKS_PER_QUARTER,
): { bpm: number; map: SyncMap } | null {
  const taps = [...tapTimesSeconds].sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < taps.length; i++) {
    const d = taps[i] - taps[i - 1];
    if (d > 0) {
      intervals.push(d);
    }
  }
  if (intervals.length === 0) {
    return null;
  }
  const m = median(intervals);
  const kept = intervals.filter(d => Math.abs(d - m) <= m * TAP_OUTLIER_TOLERANCE);
  const beatSeconds = kept.reduce((sum, d) => sum + d, 0) / kept.length;
  const bpm = (60 / beatSeconds) * (ticksPerBeat / TICKS_PER_QUARTER);
  const map: SyncMap = {
    anchors: [
      { tick: 0, seconds: firstBeatSeconds },
      { tick: ticksPerBeat, seconds: firstBeatSeconds + beatSeconds },
    ],
    offsetMs: 0,
  };
  return { bpm, map };
}

/**
 * Anchors at every bar line (and the end of the last bar) from the score's own tempo map,
 * with bar 0 starting at `firstDownbeatSeconds`. Repeats are not expanded.
 */
export function syncMapFromScore(score: Pick<Score, 'masterBars'>, firstDownbeatSeconds: number): SyncMap {
  const tempo = buildTempoMap(score);
  const anchors: SyncAnchor[] = tempo.bars.map(b => ({
    tick: b.startTick,
    seconds: firstDownbeatSeconds + b.startSeconds,
  }));
  if (tempo.totalTicks > 0) {
    anchors.push({ tick: tempo.totalTicks, seconds: firstDownbeatSeconds + tempo.totalSeconds });
  }
  return { anchors, offsetMs: 0 };
}
