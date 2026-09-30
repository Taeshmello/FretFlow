import { applyOps, findBeat, invert, isFretted, newId, setOp, type Duration, type DrumPiece, type Id, type Op, type Instrument, type NoteEffects, type Score } from '@fretflow/score-model';
import { clampCursor, cursorNote, initialCursor, moveBar, moveString, type Cursor, type Selection } from './cursor';
import { DEFAULT_SETTINGS, type Change, type Settings } from './change';
import { emptyHistory, popRedo, popUndo, record, type History } from './history';
import * as bars from './commands/bars';
import { copy, cut, paste, type Clip } from './commands/clipboard';
import * as fx from './commands/effects';
import * as pitched from './commands/pitched';
import { deleteNote, enterFretDigit, placeFret, type PendingDigit } from './commands/input';
import { advanceRight } from './commands/navigation';
import * as rhythm from './commands/rhythm';
import { pushOverflowOps } from './commands/overflow';
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
  /** Last text/number field edited, so consecutive keystrokes become one undo step. */
  lastField: { key: string; at: number } | null;
}

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
  | { type: 'togglePitch'; pitch: number }
  | { type: 'transposeKeys'; delta: number }
  | { type: 'toggleHit'; piece: DrumPiece }
  | { type: 'cycleHitDynamic'; piece: DrumPiece }
  | { type: 'pedal' }
  | { type: 'toggleFingeringLock' }
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
  | { type: 'setChord'; beatId: Id; chord: string }
  | { type: 'setLyric'; beatId: Id; lyric: string }
  | { type: 'addTrack'; instrument: Instrument; tuning?: number[] }
  | { type: 'removeTrack' }
  | { type: 'copy' }
  | { type: 'cut' }
  | { type: 'paste' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'selectAll' }
  | { type: 'settings'; settings: Partial<Settings> };

function commitChange(state: EditorState, change: Change | null, now: number): EditorState {
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

function extendSelection(state: EditorState, to: Cursor, extend: boolean | undefined): Selection | null {
  if (!extend) {
    return null;
  }
  return { anchor: state.selection?.anchor ?? state.cursor, head: to };
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
  const commit = (s: EditorState, change: Change | null, at: number) =>
    commitChange(s, change && mergeField ? { ...change, merge: true } : change, at);
  const { score, cursor, selection } = base;
  const trackId = cursor.trackId;
  const activeTrack = score.tracks.find(t => t.id === trackId) ?? score.tracks[0];
  if ((activeTrack.instrument === 'piano' || activeTrack.instrument === 'drums')
    && (command.type === 'digit' || command.type === 'placeFret')) {
    return { ...base, notice: activeTrack.instrument === 'piano' ? 'Frets are for guitar and bass. Use the piano keys or letters A–G.' : 'Frets are for guitar and bass. Use the drum pads or number keys.' };
  }

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
      if (selection) {
        return commit(base, cut(score, selection, cursor).change, now);
      }
      return commit(base, isFretted(activeTrack.instrument) ? deleteNote(score, cursor) : pitched.clearBeat(score, cursor), now);
    case 'deleteBeat':
      return commit(base, rhythm.deleteBeats(score, cursor, selection), now);
    case 'tie':
      return commit(base, activeTrack.instrument === 'piano' ? pitched.toggleKeyTie(score, cursor) : fx.toggleTie(score, cursor), now);
    case 'togglePitch':
      return commit(base, pitched.togglePitch(score, cursor, command.pitch), now);
    case 'transposeKeys':
      return commit(base, pitched.transposeKeys(score, cursor, command.delta), now);
    case 'toggleHit':
      return commit(base, pitched.toggleHit(score, cursor, command.piece), now);
    case 'cycleHitDynamic':
      return commit(base, pitched.cycleHitDynamic(score, cursor, command.piece), now);
    case 'pedal':
      return commit(base, pitched.cyclePedal(score, cursor), now);
    case 'toggleFingeringLock': {
      const note = cursorNote(score, cursor);
      return note ? commit(base, { ops: [setOp(score, note.id, ['fingeringLocked'], !note.fingeringLocked)], label: 'fingering lock' }, now) : base;
    }
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
    case 'setChord': {
      const beat = findBeat(score, command.beatId);
      if (!beat) {
        return base;
      }
      const chord = command.chord.trim().slice(0, 32) || undefined;
      if (beat.chord === chord) {
        return base;
      }
      return commit(base, { ops: [setOp(score, beat.id, ['chord'], chord)], label: 'chord symbol' }, now);
    }
    case 'setLyric': {
      const beat = findBeat(score, command.beatId);
      if (!beat) return base;
      const lyric = command.lyric.slice(0, 160) || undefined;
      if (beat.lyric === lyric) return base;
      return commit(base, { ops: [setOp(score, beat.id, ['lyric'], lyric)], label: 'lyric' }, now);
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
