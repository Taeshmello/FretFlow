import { applyOps, invert, type Score } from '@fretflow/score-model';
import { isClipboardCommand, isDocumentCommand, isNavigation, isNoteCommand, type Command } from './command';
import { clampCursor, type Cursor } from './cursor';
import { popRedo, popUndo } from './history';
import { editClipboard } from './reducer/clipboard';
import { commitChange, type Ctx } from './reducer/context';
import { editDocument } from './reducer/document';
import { navigate } from './reducer/navigation';
import { editNotes } from './reducer/notes';
import { createEditor, type EditorState } from './state';

export type { ClipboardCommand, Command, DocumentCommand, EffectKey, NavigationCommand, NoteCommand } from './command';
export { createEditor, type EditorState } from './state';

/** Keystrokes into the same field closer together than this are one transaction. */
export const FIELD_MERGE_MS = 1500;

/** Inspector/title fields that are typed character by character. */
function fieldKey(command: Command, cursor: Cursor): string | null {
  switch (command.type) {
    case 'setMasterBar':
      return `bar:${command.barIndex ?? cursor.barIndex}:${command.prop}`;
    case 'setTitle':
      return command.artist === undefined ? 'title' : 'artist';
    case 'renameTrack':
      return `track:${cursor.trackId}:name`;
    case 'setCapo':
      return `track:${cursor.trackId}:capo`;
    case 'setChord':
      return `beat:${command.beatId}:chord`;
    case 'setLyric':
      return `beat:${command.beatId}:lyric`;
    default:
      return null;
  }
}

/** Pure reducer: every UI action goes through here. `now` is injected so timing is testable. */
export function execute(state: EditorState, command: Command, now: number): EditorState {
  const key = fieldKey(command, state.cursor);
  const sameField = key !== null && state.lastField?.key === key && now - state.lastField.at <= FIELD_MERGE_MS;
  const next = run(state, command, now, sameField);
  if (next === state) {
    return state;
  }
  return { ...next, lastField: key ? { key, at: now } : null };
}

function run(state: EditorState, command: Command, now: number, mergeField: boolean): EditorState {
  const base: EditorState = { ...state, notice: null, pending: command.type === 'digit' ? state.pending : null };
  const activeTrack = base.score.tracks.find(t => t.id === base.cursor.trackId) ?? base.score.tracks[0];
  if ((activeTrack.instrument === 'piano' || activeTrack.instrument === 'drums') && (command.type === 'digit' || command.type === 'placeFret')) {
    return {
      ...base,
      notice: activeTrack.instrument === 'piano' ? 'Frets are for guitar and bass. Use the piano keys or letters A–G.' : 'Frets are for guitar and bass. Use the drum pads or number keys.',
    };
  }
  const ctx: Ctx = {
    state,
    base,
    now,
    activeTrack,
    commit: (s, change) => commitChange(s, change && mergeField ? { ...change, merge: true } : change, now),
  };

  if (isNavigation(command)) {
    return navigate(ctx, command);
  }
  if (isNoteCommand(command)) {
    return editNotes(ctx, command);
  }
  if (isDocumentCommand(command)) {
    return editDocument(ctx, command);
  }
  if (isClipboardCommand(command)) {
    return editClipboard(ctx, command);
  }
  const { score, cursor } = base;
  switch (command.type) {
    case 'undo': {
      const popped = popUndo(base.history);
      if (!popped) {
        return base;
      }
      const next = applyOps(score, invert(popped.tx).ops);
      return { ...base, score: next, history: popped.history, cursor: clampCursor(next, cursor), selection: null, revision: base.revision + 1 };
    }
    case 'redo': {
      const popped = popRedo(base.history);
      if (!popped) {
        return base;
      }
      const next = applyOps(score, popped.tx.ops);
      return { ...base, score: next, history: popped.history, cursor: clampCursor(next, cursor), selection: null, revision: base.revision + 1 };
    }
    case 'settings':
      return { ...base, settings: { ...base.settings, ...command.settings } };
  }
}

/** Replaces the document (open, import). History starts over. */
export function loadScore(state: EditorState, score: Score): EditorState {
  return { ...createEditor(score, state.settings), clipboard: state.clipboard, revision: state.revision + 1 };
}
