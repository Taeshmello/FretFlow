import type { Transaction } from '@fretflow/score-model';

export const HISTORY_LIMIT = 500;

/** Immutable undo/redo stacks of applied transactions (newest last). */
export interface History {
  undo: Transaction[];
  redo: Transaction[];
}

export const emptyHistory = (): History => ({ undo: [], redo: [] });

/** Records a transaction. With `merge`, it is folded into the previous one so one undo reverts both. */
export function record(history: History, tx: Transaction, merge = false, limit = HISTORY_LIMIT): History {
  const last = history.undo[history.undo.length - 1];
  if (merge && last) {
    const merged: Transaction = { ...last, ops: [...last.ops, ...tx.ops], at: tx.at };
    return { undo: [...history.undo.slice(0, -1), merged], redo: [] };
  }
  const undo = [...history.undo, tx];
  return { undo: undo.length > limit ? undo.slice(undo.length - limit) : undo, redo: [] };
}

export function popUndo(history: History): { tx: Transaction; history: History } | null {
  const tx = history.undo[history.undo.length - 1];
  if (!tx) {
    return null;
  }
  return { tx, history: { undo: history.undo.slice(0, -1), redo: [...history.redo, tx] } };
}

export function popRedo(history: History): { tx: Transaction; history: History } | null {
  const tx = history.redo[history.redo.length - 1];
  if (!tx) {
    return null;
  }
  return { tx, history: { undo: [...history.undo, tx], redo: history.redo.slice(0, -1) } };
}
