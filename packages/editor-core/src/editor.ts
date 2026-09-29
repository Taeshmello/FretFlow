import { applyOps, invert, newId, setOp, type Duration, type Op, type Instrument, type NoteEffects, type Score } from '@fretflow/score-model';
import { clampCursor, initialCursor, moveBar, moveString, type Cursor, type Selection } from './cursor';
import { DEFAULT_SETTINGS, type Change, type Settings } from './change';
import { emptyHistory, popRedo, popUndo, record, type History } from './history';
import * as bars from './commands/bars';
import { copy, cut, paste, type Clip } from './commands/clipboard';
import * as fx from './commands/effects';
import { deleteNote, enterFretDigit, placeFret, type PendingDigit } from './commands/input';
import { advanceRight } from './commands/navigation';
import * as rhythm from './commands/rhythm';
import * as tracks from './commands/tracks';
import { moveBeat } from './cursor';

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
  };
}

export type EffectKey = 'hammerPull' | 'palmMute' | 'dead' | 'letRing' | 'vibrato' | 'slide' | 'bend';

export type Command =
  | { type: 'digit'; digit: number }
  | { type: 'placeFret'; string: number; fret: number }
  | { type: 'moveString'; delta: number; extend?: boolean }
  | { type: 'moveBeat'; delta: 1 | -1; extend?: boolean }
  | { type: 'moveBar'; delta: 1 | -1 }
  | { type: 'setCursor'; cursor: Cursor; extend?: boolean }
  | { type: 'select'; selection: Selection | null }
  | { type: 'shorter' }
  | { type: 'longer' }
  | { type: 'dots' }
  | { type: 'rest' }
  | { type: 'tuplet' }
  | { type: 'setDuration'; base: Duration['base'] }
  | { type: 'insertBeat' }
  | { type: 'deleteNote' }
  | { type: 'deleteBeat' }
  | { type: 'tie' }
  | { type: 'hammer' }
  | { type: 'slide' }
  | { type: 'bend' }
  | { type: 'vibrato' }
  | { type: 'palmMute' }
  | { type: 'dead' }
  | { type: 'letRing' }
  | { type: 'setEffect'; key: EffectKey; value: NoteEffects[EffectKey] }
  | { type: 'insertBar'; after: boolean }
  | { type: 'deleteBar' }
  | { type: 'duplicateBar' }
  | { type: 'repeatStart' }
  | { type: 'repeatEnd' }
  | { type: 'setMasterBar'; prop: bars.MasterBarProp; value: unknown; barIndex?: number }
  | { type: 'setTuning'; tuning: number[] }
  | { type: 'setCapo'; capo: number }
  | { type: 'renameTrack'; name: string }
  | { type: 'setTitle'; title: string; artist?: string }
  | { type: 'addTrack'; instrument: Instrument; tuning?: number[] }
  | { type: 'removeTrack' }
  | { type: 'copy' }
  | { type: 'cut' }
  | { type: 'paste' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'selectAll' }
  | { type: 'settings'; settings: Partial<Settings> };

function commit(state: EditorState, change: Change | null, now: number): EditorState {
  if (!change) {
    return state;
  }
  let next = state;
  if (change.ops.length) {
    const score = applyOps(state.score, change.ops);
    const tx = { id: newId(), ops: change.ops, label: change.label, at: now };
    next = { ...state, score, history: record(state.history, tx, change.merge), revision: state.revision + 1 };
  }
  const cursor = clampCursor(next.score, change.cursor ?? next.cursor);
  const selection = change.selection === undefined ? next.selection : change.selection;
  return { ...next, cursor, selection };
}

function extendSelection(state: EditorState, to: Cursor, extend: boolean | undefined): Selection | null {
  if (!extend) {
    return null;
  }
  return { anchor: state.selection?.anchor ?? state.cursor, head: to };
}

/** Pure reducer: every UI action goes through here. `now` is injected so timing is testable. */
export function execute(state: EditorState, command: Command, now: number): EditorState {
  const base: EditorState = { ...state, notice: null, pending: command.type === 'digit' ? state.pending : null };
  const { score, cursor, selection } = base;
  const trackId = cursor.trackId;

  switch (command.type) {
    case 'digit': {
      const { change, pending } = enterFretDigit(score, cursor, command.digit, now, state.pending, base.settings);
      return { ...commit(base, change, now), pending, selection: null };
    }
    case 'placeFret':
      return commit(base, placeFret(score, cursor, command.string, command.fret), now);
    case 'moveString': {
      const to = moveString(score, cursor, command.delta);
      return { ...base, cursor: to, selection: extendSelection(base, to, command.extend) };
    }
    case 'moveBeat': {
      if (command.delta > 0 && !command.extend) {
        const moved = advanceRight(score, cursor);
        return moved.change ? commit({ ...base, selection: null }, moved.change, now) : { ...base, cursor: moved.cursor, selection: null };
      }
      const to = moveBeat(score, cursor, command.delta).cursor;
      return { ...base, cursor: to, selection: extendSelection(base, to, command.extend) };
    }
    case 'moveBar':
      return { ...base, cursor: moveBar(score, cursor, command.delta), selection: null };
    case 'setCursor': {
      const to = clampCursor(score, command.cursor);
      return { ...base, cursor: to, selection: extendSelection(base, to, command.extend) };
    }
    case 'select':
      return { ...base, selection: command.selection };
    case 'selectAll': {
      const track = score.tracks.find(t => t.id === trackId) ?? score.tracks[0];
      const lastBar = track.bars.length - 1;
      return {
        ...base,
        selection: {
          anchor: { trackId: track.id, barIndex: 0, beatIndex: 0, string: 1 },
          head: { trackId: track.id, barIndex: lastBar, beatIndex: track.bars[lastBar].beats.length - 1, string: track.tuning.length },
        },
      };
    }
    case 'shorter':
      return commit(base, rhythm.shorter(score, cursor, selection), now);
    case 'longer':
      return commit(base, rhythm.longer(score, cursor, selection), now);
    case 'dots':
      return commit(base, rhythm.cycleDots(score, cursor, selection), now);
    case 'rest':
      return commit(base, rhythm.toggleRest(score, cursor, selection), now);
    case 'tuplet':
      return commit(base, rhythm.toggleTuplet(score, cursor, selection), now);
    case 'setDuration':
      return commit(base, rhythm.setDuration(score, cursor, selection, command.base), now);
    case 'insertBeat':
      return commit(base, rhythm.insertBeatAfter(score, cursor), now);
    case 'deleteNote':
      return selection ? commit(base, cut(score, selection, cursor).change, now) : commit(base, deleteNote(score, cursor), now);
    case 'deleteBeat':
      return commit(base, rhythm.deleteBeats(score, cursor, selection), now);
    case 'tie':
      return commit(base, fx.toggleTie(score, cursor), now);
    case 'hammer':
      return commit(base, fx.toggleHammer(score, cursor, selection), now);
    case 'slide':
      return commit(base, fx.cycleSlide(score, cursor, selection), now);
    case 'bend':
      return commit(base, fx.cycleBend(score, cursor, selection), now);
    case 'vibrato':
      return commit(base, fx.toggleVibrato(score, cursor, selection), now);
    case 'palmMute':
      return commit(base, fx.togglePalmMute(score, cursor, selection), now);
    case 'dead':
      return commit(base, fx.toggleDead(score, cursor, selection), now);
    case 'letRing':
      return commit(base, fx.toggleLetRing(score, cursor, selection), now);
    case 'setEffect':
      return commit(base, fx.setEffect(score, cursor, selection, command.key, command.value), now);
    case 'insertBar':
      return commit(base, bars.insertBar(score, cursor, command.after), now);
    case 'deleteBar':
      return commit(base, bars.deleteBar(score, cursor), now);
    case 'duplicateBar':
      return commit(base, bars.duplicateBar(score, cursor), now);
    case 'repeatStart':
      return commit(base, bars.toggleRepeatStart(score, cursor), now);
    case 'repeatEnd':
      return commit(base, bars.cycleRepeatEnd(score, cursor), now);
    case 'setMasterBar':
      return commit(base, bars.setMasterBarProp(score, command.barIndex ?? cursor.barIndex, command.prop, command.value), now);
    case 'setTuning':
      return commit(base, tracks.setTuning(score, trackId, command.tuning), now);
    case 'setCapo':
      return commit(base, tracks.setCapo(score, trackId, command.capo), now);
    case 'renameTrack':
      return commit(base, tracks.renameTrack(score, trackId, command.name), now);
    case 'setTitle': {
      const ops: Op[] = [setOp(score, score.id, ['meta', 'title'], command.title)];
      if (command.artist !== undefined) {
        ops.push(setOp(score, score.id, ['meta', 'artist'], command.artist || undefined));
      }
      return commit(base, { ops, label: 'title' }, now);
    }
    case 'addTrack':
      return commit(base, tracks.addTrack(score, cursor, command.instrument, command.tuning), now);
    case 'removeTrack':
      return commit(base, tracks.removeTrack(score, trackId, cursor), now);
    case 'copy': {
      const clip = copy(score, selection, cursor);
      return clip ? { ...base, clipboard: clip } : base;
    }
    case 'cut': {
      const { clip, change } = cut(score, selection, cursor);
      return clip ? { ...commit(base, change, now), clipboard: clip } : base;
    }
    case 'paste': {
      if (!base.clipboard) {
        return base;
      }
      const { change, dropped } = paste(score, cursor, base.clipboard);
      const next = commit(base, change, now);
      return dropped ? { ...next, notice: `${dropped} note(s) did not fit this tuning and were skipped` } : next;
    }
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
