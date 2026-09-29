import { createEditor, execute, loadScore, type Command, type EditorState } from '@fretflow/editor-core';
import type { Id, Score, Transaction } from '@fretflow/score-model';
import { useSyncExternalStore } from 'react';

/** A note the shell should sound after input (audition, SPEC §5.3 rule 1). */
export interface Audition {
  beatId: Id;
  string: number;
  seq: number;
}

export interface Snapshot {
  editor: EditorState;
  audition: Audition | null;
}

type Listener = () => void;
type ChangeListener = (score: Score, tx: Transaction | null) => void;

/**
 * Holds the one EditorState of the open document. The reducer (execute) is
 * pure; this class only stores its result and notifies React and autosave.
 */
export class EditorStore {
  private snap: Snapshot;
  private readonly listeners = new Set<Listener>();
  private readonly changeListeners = new Set<ChangeListener>();
  private auditionSeq = 0;

  constructor(score: Score) {
    this.snap = { editor: createEditor(score), audition: null };
  }

  get state(): EditorState {
    return this.snap.editor;
  }

  getSnapshot = (): Snapshot => this.snap;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  onScoreChange(fn: ChangeListener): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  dispatch = (command: Command): void => {
    const before = this.snap.editor;
    const after = execute(before, command, performance.now());
    if (after === before) {
      return;
    }
    let audition = this.snap.audition;
    if ((command.type === 'digit' || command.type === 'placeFret') && after.score !== before.score) {
      const at = command.type === 'placeFret' ? { ...after.cursor, string: command.string } : before.cursor;
      const beat = after.score.tracks.find(t => t.id === at.trackId)?.bars[at.barIndex]?.beats[at.beatIndex];
      if (beat) {
        audition = { beatId: beat.id, string: at.string, seq: ++this.auditionSeq };
      }
    }
    this.snap = { editor: after, audition };
    this.emit();
    if (after.score !== before.score) {
      const tx = after.history.undo[after.history.undo.length - 1] ?? null;
      const isUndoRedo = command.type === 'undo' || command.type === 'redo';
      this.changeListeners.forEach(fn => fn(after.score, isUndoRedo ? null : tx));
    }
  };

  /** Open or import a document. */
  replace(score: Score): void {
    this.snap = { editor: loadScore(this.snap.editor, score), audition: null };
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach(fn => fn());
  }
}

export function useEditor(store: EditorStore): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
