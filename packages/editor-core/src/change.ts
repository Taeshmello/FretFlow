import type { Beat, MasterBar, Op, Score, Track } from '@fretflow/score-model';
import { cursorTrack, trackIndexOf, type Cursor, type Selection } from './cursor';

/** What a command wants to do. The editor turns `ops` into one transaction. */
export interface Change {
  ops: Op[];
  label: string;
  cursor?: Cursor;
  selection?: Selection | null;
  /** Fold into the previous transaction (second digit of a two-digit fret). */
  merge?: boolean;
}

export interface Settings {
  /** Move to the next beat after entering a fret (SPEC §5.3 rule 6). */
  advanceAfterInput: boolean;
  /** Window for combining two digits into one fret. */
  digitWindowMs: number;
}

export const DEFAULT_SETTINGS: Settings = { advanceAfterInput: false, digitWindowMs: 600 };

/** Everything a command needs to know about the cursor position. */
export interface Here {
  score: Score;
  cursor: Cursor;
  track: Track;
  trackIndex: number;
  masterBar: MasterBar;
  beat: Beat | undefined;
}

export function here(score: Score, cursor: Cursor): Here {
  const track = cursorTrack(score, cursor);
  return {
    score,
    cursor,
    track,
    trackIndex: trackIndexOf(score, cursor.trackId),
    masterBar: score.masterBars[cursor.barIndex],
    beat: track.bars[cursor.barIndex]?.beats[cursor.beatIndex],
  };
}
