import type * as alphaTab from '@coderline/alphatab';
import type { Converted } from './toAlphaTab';
import { toOurString } from './strings';

/** A box in alphaTab surface coordinates. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CellRef {
  trackIndex: number;
  barIndex: number;
  beatIndex: number;
  string: number;
}

/** With a score + tab stave, alphaTab reports one bounds per stave; the tab is the lower one. */
function tabBounds(candidates: readonly alphaTab.rendering.BeatBounds[] | null): alphaTab.rendering.BeatBounds | null {
  if (!candidates?.length) {
    return null;
  }
  return candidates.reduce((low, b) => (b.visualBounds.y > low.visualBounds.y ? b : low));
}

function spacing(height: number, strings: number): number {
  return strings > 1 ? height / (strings - 1) : height;
}

/** Box around one string of one beat. Null while that beat is not laid out yet. */
export function cellBox(
  lookup: alphaTab.rendering.BoundsLookup | null,
  converted: Converted,
  beatId: string,
  string: number,
  stringCount: number,
): Box | null {
  const beat = converted.beats.get(beatId);
  const bounds = beat && lookup ? tabBounds(lookup.findBeats(beat)) : null;
  if (!bounds) {
    return null;
  }
  const v = bounds.visualBounds;
  const gap = spacing(v.h, stringCount);
  return { x: v.x - 3, y: v.y + (string - 1) * gap - gap / 2, w: Math.max(v.w, 10) + 6, h: gap };
}

/** Box spanning the whole tab stave of a beat (for selections and the play cursor). */
export function beatBox(lookup: alphaTab.rendering.BoundsLookup | null, converted: Converted, beatId: string): Box | null {
  const beat = converted.beats.get(beatId);
  const bounds = beat && lookup ? tabBounds(lookup.findBeats(beat)) : null;
  if (!bounds) {
    return null;
  }
  const v = bounds.visualBounds;
  return { x: v.x - 3, y: v.y - 6, w: Math.max(v.w, 10) + 6, h: v.h + 12 };
}

/** Click → cell. Falls back to the nearest string line so empty strings are clickable. */
export function cellAt(
  lookup: alphaTab.rendering.BoundsLookup | null,
  converted: Converted,
  x: number,
  y: number,
  stringCountOf: (trackIndex: number) => number,
): CellRef | null {
  const beat = lookup?.getBeatAtPos(x, y);
  const ref = beat ? converted.refs.get(beat) : undefined;
  if (!lookup || !beat || !ref) {
    return null;
  }
  const strings = stringCountOf(ref.trackIndex);
  const note = lookup.getNoteAtPos(beat, x, y);
  if (note) {
    return { ...ref, string: toOurString(note.string, strings) };
  }
  const bounds = tabBounds(lookup.findBeats(beat));
  if (!bounds) {
    return null;
  }
  const gap = spacing(bounds.visualBounds.h, strings);
  const offset = Math.round((y - bounds.visualBounds.y) / gap);
  return { ...ref, string: Math.min(Math.max(offset + 1, 1), strings) };
}
