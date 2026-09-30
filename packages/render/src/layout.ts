import type * as alphaTab from '@coderline/alphatab';
import { barCapacity, type Duration, type Score } from '@fretflow/score-model';

/**
 * Custom bar widths (MasterBar.width). alphaTab's automatic page layout ignores
 * per-bar sizes, so a score with any custom width is drawn in its model layout:
 * we decide how many bars go on each line and how wide each bar is relative to the
 * others. Scores without custom widths keep alphaTab's automatic layout.
 */

/** Rough screen width of one weight unit; calibrated against the automatic layout. */
export const LAYOUT_UNIT_PX = 34;
/** Clef, key and time signature at the start of every line. */
export const LINE_START_PX = 70;

/** How much room a note of this length wants, relative to a sixteenth. */
function durationWeight(d: Duration): number {
  const base = { 1: 2.2, 2: 1.7, 4: 1.35, 8: 1.15, 16: 1, 32: 1 }[d.base];
  return d.dots ? base * 1.1 : base;
}

export function hasCustomWidths(score: Score): boolean {
  return score.masterBars.some(mb => mb.width !== undefined && mb.width !== 1);
}

/** A bar's natural size in weight units: its busiest track, or its length in quarters when empty. */
export function naturalBarWeight(score: Score, barIndex: number): number {
  const mb = score.masterBars[barIndex];
  let weight = mb ? (barCapacity(mb) / 960) * 1.35 : 4;
  for (const track of score.tracks) {
    const beats = track.bars[barIndex]?.beats ?? [];
    if (beats.length) {
      weight = Math.max(weight, beats.reduce((sum, b) => sum + durationWeight(b.duration), 0));
    }
  }
  return Math.max(weight, 2);
}

/** Natural weight times the user's width, per bar. */
export function barWeights(score: Score): number[] {
  return score.masterBars.map((mb, i) => naturalBarWeight(score, i) * (mb.width ?? 1));
}

/** Bars per line, filling each line up to the available width (at least one bar per line). */
export function lineBreaks(weights: number[], widthPx: number): number[] {
  const capacity = Math.max(0, widthPx - LINE_START_PX) / LAYOUT_UNIT_PX;
  const lines: number[] = [];
  let count = 0;
  let used = 0;
  for (const w of weights) {
    if (count > 0 && used + w > capacity) {
      lines.push(count);
      count = 0;
      used = 0;
    }
    count++;
    used += w;
  }
  if (count > 0) {
    lines.push(count);
  }
  return lines;
}

function setLines(s: alphaTab.model.Score, lines: number[]): void {
  s.systemsLayout = lines;
  for (const t of s.tracks) {
    t.systemsLayout = lines;
  }
}

/** Bar sizes and line breaks for alphaTab's model layout (single- and multi-track rendering). */
export function applyModelLayout(s: alphaTab.model.Score, weights: number[], widthPx: number): void {
  weights.forEach((w, i) => {
    s.masterBars[i].displayScale = w;
  });
  for (const t of s.tracks) {
    for (const staff of t.staves) {
      staff.bars.forEach((b, i) => {
        b.displayScale = weights[i];
      });
    }
  }
  setLines(s, lineBreaks(weights, widthPx));
}

/**
 * Re-breaks lines of a model-layout score for another width, e.g. a printed page,
 * counting from the first printed bar. Scores in the automatic layout are left alone.
 */
export function relayoutForWidth(s: alphaTab.model.Score, widthPx: number, firstBar = 0, barCount = s.masterBars.length): void {
  if (!s.systemsLayout.length) {
    return;
  }
  const weights = s.masterBars.slice(firstBar, firstBar + barCount).map(mb => mb.displayScale);
  setLines(s, lineBreaks(weights, widthPx));
}
