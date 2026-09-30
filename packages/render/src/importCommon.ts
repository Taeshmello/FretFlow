import * as alphaTab from '@coderline/alphatab';
import { newId, type Beat, type Duration } from '@fretflow/score-model';

/** Collects what an import dropped or simplified. */
export class Report {
  readonly items = new Map<string, number>();
  add(what: string, n = 1): void {
    this.items.set(what, (this.items.get(what) ?? 0) + n);
  }
}


const BASES: readonly Duration['base'][] = [1, 2, 4, 8, 16, 32];

export function convertDuration(beat: alphaTab.model.Beat, report: Report): Duration {
  let base = beat.duration as number;
  if (base < 1) {
    report.add('double/quadruple whole notes (shortened to whole)');
    base = 1;
  }
  if (base > 32) {
    report.add('64th and shorter notes (lengthened to 32nd)');
    base = 32;
  }
  const d: Duration = { base: (BASES.includes(base as Duration['base']) ? base : 4) as Duration['base'], dots: Math.min(beat.dots, 2) as Duration['dots'] };
  if (beat.hasTuplet) {
    if (beat.tupletNumerator === 3 && beat.tupletDenominator === 2) {
      d.tuplet = [3, 2];
    } else {
      report.add(`tuplets other than triplets (${beat.tupletNumerator}:${beat.tupletDenominator})`);
    }
  }
  return d;
}


/** Beats of one bar with just the duration and text fields (no notes yet). */
export function bareBeat(b: alphaTab.model.Beat, report: Report): Beat {
  const out: Beat = { id: newId(), duration: convertDuration(b, report), rest: true, notes: [] };
  if (b.lyrics?.[0]) {
    out.lyric = b.lyrics[0];
  }
  if (b.chord?.name) {
    out.chord = b.chord.name;
  }
  if (b.text) {
    out.text = b.text;
  }
  return out;
}

export const sameRhythm = (a: alphaTab.model.Beat[], b: alphaTab.model.Beat[]) =>
  a.length === b.length && a.every((x, i) => x.duration === b[i].duration && x.dots === b[i].dots && x.tupletNumerator === b[i].tupletNumerator);

export const liveBeats = (bar: alphaTab.model.Bar | undefined) => (bar?.voices[0]?.beats ?? []).filter(b => !b.isEmpty);
