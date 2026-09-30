import { applyOps, newId, type Track } from '@fretflow/score-model';
import type { Change } from '../change';
import { pushOverflowOps } from '../commands/overflow';
import { clampCursor, type Cursor, type Selection } from '../cursor';
import { record } from '../history';
import type { EditorState } from '../state';

/** What every command handler gets: the state before the command and how to commit a change. */
export interface Ctx {
  /** The state as the command found it (e.g. the pending first digit). */
  state: EditorState;
  /** `state` with the per-command fields reset (notice, pending digit). */
  base: EditorState;
  now: number;
  activeTrack: Track;
  commit: (s: EditorState, change: Change | null) => EditorState;
}

/** Applies a change as one transaction, plus the overflow push when that setting is on. */
export function commitChange(state: EditorState, change: Change | null, now: number): EditorState {
  if (!change) {
    return state;
  }
  let next = state;
  if (change.ops.length) {
    let ops = change.ops;
    let score = applyOps(state.score, ops);
    if (state.settings.overflow === 'pushToNextBar') {
      // Part of the same transaction, so one undo takes the edit and the push back.
      const cursor = change.cursor ?? state.cursor;
      const pushed = pushOverflowOps(score, cursor.trackId, Math.min(cursor.barIndex, state.cursor.barIndex));
      if (pushed.length) {
        ops = [...ops, ...pushed];
        score = applyOps(score, pushed);
      }
    }
    const tx = { id: newId(), ops, label: change.label, at: now };
    next = { ...state, score, history: record(state.history, tx, change.merge), revision: state.revision + 1 };
  }
  const cursor = clampCursor(next.score, change.cursor ?? next.cursor);
  const selection = change.selection === undefined ? next.selection : change.selection;
  return { ...next, cursor, selection };
}

export function extendSelection(state: EditorState, to: Cursor, extend: boolean | undefined): Selection | null {
  if (!extend) {
    return null;
  }
  return { anchor: state.selection?.anchor ?? state.cursor, head: to };
}
