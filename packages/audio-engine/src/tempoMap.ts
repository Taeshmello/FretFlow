import { barCapacity, TICKS_PER_QUARTER } from '@fretflow/score-model';
import type { MasterBar, Score, Tick } from '@fretflow/score-model';

/** Timing of one master bar in score order (repeats not expanded). */
export interface BarTiming {
  index: number;
  startTick: Tick;
  /** Capacity from the time signature, not the notes actually written. */
  ticks: Tick;
  timeSig: [number, number];
  /** Quarter-note BPM in effect for the whole bar. */
  bpm: number;
  startSeconds: number;
}

/**
 * The score's own clock, used by the synth side and the metronome.
 * Tick positions follow the written bar order: repeats are ignored here, so tick T means
 * "the first time bar N is reached". Use `expandRepeats` for the play order.
 */
export interface TempoMap {
  bars: BarTiming[];
  totalTicks: Tick;
  totalSeconds: number;
}

export const DEFAULT_BPM = 120;

function secondsPerTick(bpm: number): number {
  return 60 / (bpm * TICKS_PER_QUARTER);
}

export function buildTempoMap(score: Pick<Score, 'masterBars'>, defaultBpm = DEFAULT_BPM): TempoMap {
  const bars: BarTiming[] = [];
  let tick = 0;
  let seconds = 0;
  let bpm = defaultBpm;
  score.masterBars.forEach((mb, index) => {
    if (mb.tempo !== undefined && mb.tempo > 0) {
      bpm = mb.tempo;
    }
    const ticks = barCapacity(mb);
    bars.push({ index, startTick: tick, ticks, timeSig: [mb.timeSig[0], mb.timeSig[1]], bpm, startSeconds: seconds });
    tick += ticks;
    seconds += ticks * secondsPerTick(bpm);
  });
  return { bars, totalTicks: tick, totalSeconds: seconds };
}

/** Index of the bar containing `tick`, clamped to the first/last bar. -1 for an empty score. */
export function barAtTick(map: TempoMap, tick: number): number {
  const { bars } = map;
  if (bars.length === 0) {
    return -1;
  }
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].startTick <= tick) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** Bar index whose time span contains `seconds`, clamped. -1 for an empty score. */
function barAtSeconds(map: TempoMap, seconds: number): number {
  const { bars } = map;
  if (bars.length === 0) {
    return -1;
  }
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].startSeconds <= seconds) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** Outside the score the first/last bar's tempo is extended. */
export function scoreTickToSeconds(map: TempoMap, tick: number): number {
  const i = barAtTick(map, tick);
  if (i === -1) {
    return tick * secondsPerTick(DEFAULT_BPM);
  }
  const bar = map.bars[i];
  return bar.startSeconds + (tick - bar.startTick) * secondsPerTick(bar.bpm);
}

/** Inverse of `scoreTickToSeconds`, rounded to an integer tick. */
export function secondsToScoreTick(map: TempoMap, seconds: number): Tick {
  const i = barAtSeconds(map, seconds);
  if (i === -1) {
    return Math.round(seconds / secondsPerTick(DEFAULT_BPM));
  }
  const bar = map.bars[i];
  return Math.round(bar.startTick + (seconds - bar.startSeconds) / secondsPerTick(bar.bpm));
}

/** Upper bound on expanded bars so a malformed repeat count cannot hang the player. */
export const MAX_EXPANDED_BARS = 10_000;

/**
 * Play order of master bar indexes. `repeatEnd = n` plays the section n times, jumping back
 * to the latest `repeatStart` (or the bar after the previous repeat end, or bar 0).
 * Nested repeats and volta brackets are out of MVP scope and are not handled.
 */
export function expandRepeats(score: Pick<Score, 'masterBars'>): number[] {
  const bars: readonly MasterBar[] = score.masterBars;
  const order: number[] = [];
  let start = 0;
  let pass = 1;
  let jumped = false;
  let i = 0;
  while (i < bars.length && order.length < MAX_EXPANDED_BARS) {
    const mb = bars[i];
    if (mb.repeatStart && !jumped) {
      start = i;
      pass = 1;
    }
    jumped = false;
    order.push(i);
    const plays = mb.repeatEnd ?? 0;
    if (plays > 1 && pass < plays) {
      pass++;
      jumped = true;
      i = start;
      continue;
    }
    if (plays > 0) {
      start = i + 1;
      pass = 1;
    }
    i++;
  }
  return order;
}
