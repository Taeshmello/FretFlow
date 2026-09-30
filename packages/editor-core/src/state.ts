import type { Score } from '@fretflow/score-model';
import { DEFAULT_SETTINGS, type Settings } from './change';
import type { Clip } from './commands/clipboard';
import type { PendingDigit } from './commands/input';
import { initialCursor, type Cursor, type Selection } from './cursor';
import { emptyHistory, type History } from './history';

export interface EditorState {
  score: Score;
  cursor: Cursor;
  selection: Selection | null;
  history: History;
  pending: PendingDigit | null;
  clipboard: Clip | null;
  settings: Settings;
  /** Bumped on every score change; lets the shell debounce saves and re-renders. */
  revision: number;
  /** Short user-facing message from the last command (e.g. dropped notes on paste). */
  notice: string | null;
  /** Last text/number field edited, so consecutive keystrokes become one undo step. */
  lastField: { key: string; at: number } | null;
}

export function createEditor(score: Score, settings: Partial<Settings> = {}): EditorState {
  return {
    score,
    cursor: initialCursor(score),
    selection: null,
    history: emptyHistory(),
    pending: null,
    clipboard: null,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    revision: 0,
    notice: null,
    lastField: null,
  };
}
