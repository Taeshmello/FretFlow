import type { TempoMap } from './tempoMap';

/** Tempo and meter in effect for one bar. `bpm` is in quarter notes. */
export interface MeterInfo {
  bpm: number;
  timeSig: [number, number];
}

/** Asked at every bar start, so tempo and time signature changes are followed. */
export type MeterProvider = (barIndex: number) => MeterInfo;

/** Position and audio-clock time of the next click to schedule. */
export interface ClickCursor {
  bar: number;
  beat: number;
  time: number;
}

export interface Click {
  time: number;
  bar: number;
  beat: number;
  /** Beat 1 of the bar. */
  accent: boolean;
}

/** One click per time-signature beat: a quarter in 4/4, an eighth in 6/8. */
export function beatSeconds(meter: MeterInfo): number {
  return (60 / meter.bpm) * (4 / meter.timeSig[1]);
}

/** All clicks from `cursor` up to (not including) `until`, and the cursor after them. */
export function scheduleClicks(
  cursor: ClickCursor,
  until: number,
  provider: MeterProvider,
): { clicks: Click[]; cursor: ClickCursor } {
  const clicks: Click[] = [];
  let { bar, beat, time } = cursor;
  while (time < until) {
    const meter = provider(bar);
    clicks.push({ time, bar, beat, accent: beat === 0 });
    time += beatSeconds(meter);
    beat++;
    if (beat >= meter.timeSig[0]) {
      beat = 0;
      bar++;
    }
  }
  return { clicks, cursor: { bar, beat, time } };
}

/** Clicks for `bars` whole bars starting at `startBar`, and the time right after them. */
export function countInClicks(
  startTime: number,
  bars: number,
  provider: MeterProvider,
  startBar = 0,
): { clicks: Click[]; endTime: number } {
  const clicks: Click[] = [];
  let time = startTime;
  for (let b = 0; b < bars; b++) {
    // Every count-in bar uses the meter of the bar the music starts on.
    const meter = provider(startBar);
    for (let beat = 0; beat < meter.timeSig[0]; beat++) {
      clicks.push({ time, bar: b, beat, accent: beat === 0 });
      time += beatSeconds(meter);
    }
  }
  return { clicks, endTime: time };
}

/** Provider that follows the score's tempo map; bars past the end keep the last meter. */
export function meterFromTempoMap(map: TempoMap, fallback: MeterInfo = { bpm: 120, timeSig: [4, 4] }): MeterProvider {
  return barIndex => {
    if (map.bars.length === 0) {
      return fallback;
    }
    const bar = map.bars[Math.min(Math.max(0, barIndex), map.bars.length - 1)];
    return { bpm: bar.bpm, timeSig: bar.timeSig };
  };
}
