import * as alphaTab from '@coderline/alphatab';
import type { Cursor, CursorScore } from '../cursor/cursor';

/** A cursor box in the coordinate space alphaTab reports, before the surface offset. */
export interface CursorBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * alphaTab numbers strings from the lowest pitch upwards: Note.string === 1 is the
 * low E, whose stringTuning is tuning[tuning.length - 1]. CLAUDE.md numbers them the
 * other way round, 1 being the highest string and tuning[0]. Everything outside this
 * file uses our numbering; the conversion happens only here.
 */
export function toAlphaTabString(ourString: number, stringCount: number): number {
  return stringCount + 1 - ourString;
}

export function toOurString(alphaTabString: number, stringCount: number): number {
  return stringCount + 1 - alphaTabString;
}

/**
 * Picks the tablature stave out of the bounds alphaTab reports for one beat.
 * With StaveProfile.ScoreTab there are two, and the tablature one is drawn below.
 */
export function tablatureBounds(
  candidates: readonly alphaTab.rendering.BeatBounds[] | null,
): alphaTab.rendering.BeatBounds | null {
  if (!candidates || candidates.length === 0) {
    return null;
  }
  return candidates.reduce((lowest, b) => (b.visualBounds.y > lowest.visualBounds.y ? b : lowest));
}

/**
 * Distance between two neighbouring string lines. The tablature visual bounds span
 * exactly from the first to the last line, which was verified against the note head
 * positions alphaTab reports (65px tall for 6 strings, note heads 13px apart).
 */
function stringSpacing(height: number, stringCount: number): number {
  return stringCount > 1 ? height / (stringCount - 1) : height;
}

/** Centre line of a string, our numbering: string 1 sits on the top line. */
function stringLineY(bounds: alphaTab.rendering.Bounds, ourString: number, stringCount: number): number {
  return bounds.y + (ourString - 1) * stringSpacing(bounds.h, stringCount);
}

function beatOf(
  score: alphaTab.model.Score,
  cursor: Cursor,
): alphaTab.model.Beat | null {
  const staff = score.tracks[cursor.trackIndex]?.staves[0];
  return staff?.bars[cursor.barIndex]?.voices[0]?.beats[cursor.beatIndex] ?? null;
}

/** The box to draw for a cursor, or null when that beat has not been laid out. */
export function cursorBox(
  api: alphaTab.AlphaTabApi,
  score: alphaTab.model.Score,
  cursor: Cursor,
  stringCount: number,
): CursorBox | null {
  const beat = beatOf(score, cursor);
  const lookup = api.boundsLookup;
  if (!beat || !lookup) {
    return null;
  }
  const bounds = tablatureBounds(lookup.findBeats(beat));
  if (!bounds) {
    return null;
  }

  const spacing = stringSpacing(bounds.visualBounds.h, stringCount);
  const centreY = stringLineY(bounds.visualBounds, cursor.string, stringCount);
  const width = Math.max(bounds.visualBounds.w, 10) + 6;

  return {
    x: bounds.visualBounds.x - 3,
    y: centreY - spacing / 2,
    w: width,
    h: spacing,
  };
}

/**
 * Reverse mapping for clicks. x and y are in alphaTab surface coordinates.
 * Falls back to the nearest string line when the click did not land on a note,
 * so empty strings are reachable by clicking too.
 */
export function cursorFromPoint(
  api: alphaTab.AlphaTabApi,
  x: number,
  y: number,
  stringCount: number,
): Cursor | null {
  const lookup = api.boundsLookup;
  const beat = lookup?.getBeatAtPos(x, y);
  if (!lookup || !beat) {
    return null;
  }

  const bar = beat.voice.bar;
  const base = {
    trackIndex: bar.staff.track.index,
    barIndex: bar.index,
    beatIndex: beat.index,
  };

  const note = lookup.getNoteAtPos(beat, x, y);
  if (note) {
    return { ...base, string: toOurString(note.string, stringCount) };
  }

  const bounds = tablatureBounds(lookup.findBeats(beat));
  if (!bounds) {
    return null;
  }
  const spacing = stringSpacing(bounds.visualBounds.h, stringCount);
  const offset = Math.round((y - bounds.visualBounds.y) / spacing);
  return { ...base, string: Math.min(Math.max(offset + 1, 1), stringCount) };
}

/** A note in our string numbering, keeping a handle on the alphaTab one to edit. */
export interface ViewNote {
  string: number;
  note: alphaTab.model.Note;
}

/**
 * Builds the structural view cursor.ts moves over, translating string numbers once
 * so everything above this file works in our numbering. Built per score load, not
 * per keystroke.
 */
export function buildCursorView(
  score: alphaTab.model.Score,
  trackIndex: number,
): CursorScore<ViewNote> {
  const staff = score.tracks[trackIndex].staves[0];
  const stringCount = staff.tuning.length;
  return {
    stringCount,
    bars: staff.bars.map(bar => ({
      beats: (bar.voices[0]?.beats ?? []).map(beat => ({
        notes: beat.notes.map(note => ({
          string: toOurString(note.string, stringCount),
          note,
        })),
      })),
    })),
  };
}
