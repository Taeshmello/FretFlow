import type { Duration, DrumPiece, Id, Instrument, NoteEffects, TremoloSpeed } from '@fretflow/score-model';
import type { Settings } from './change';
import type { MasterBarProp } from './commands/bars';
import type { Cursor, Selection } from './cursor';

export type EffectKey = 'hammerPull' | 'palmMute' | 'dead' | 'letRing' | 'tap' | 'harmonic' | 'vibrato' | 'slide' | 'bend';

/** Cursor and selection only; the document does not change. */
export type NavigationCommand =
  | { type: 'moveString'; delta: number; extend?: boolean }
  | { type: 'moveBeat'; delta: 1 | -1; extend?: boolean }
  | { type: 'moveBar'; delta: 1 | -1; extend?: boolean }
  | { type: 'setCursor'; cursor: Cursor; extend?: boolean }
  | { type: 'select'; selection: Selection | null }
  | { type: 'selectAll' };

/** Notes, rhythm and techniques at the cursor or in the selection. */
export type NoteCommand =
  | { type: 'digit'; digit: number }
  | { type: 'placeFret'; string: number; fret: number }
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
  | { type: 'tap' }
  | { type: 'harmonic' }
  | { type: 'tremolo'; speed?: TremoloSpeed | null }
  | { type: 'setEffect'; key: EffectKey; value: NoteEffects[EffectKey] };

/** Bars, tracks and score-level text. */
export type DocumentCommand =
  | { type: 'insertBar'; after: boolean }
  | { type: 'deleteBar' }
  | { type: 'duplicateBar' }
  | { type: 'repeatStart' }
  | { type: 'repeatEnd' }
  | { type: 'setMasterBar'; prop: MasterBarProp; value: unknown; barIndex?: number }
  | { type: 'setTuning'; tuning: number[] }
  | { type: 'setCapo'; capo: number }
  | { type: 'renameTrack'; name: string }
  | { type: 'setTitle'; title: string; artist?: string }
  | { type: 'setChord'; beatId: Id; chord: string }
  | { type: 'setLyric'; beatId: Id; lyric: string }
  | { type: 'addTrack'; instrument: Instrument; tuning?: number[] }
  | { type: 'removeTrack' };

export type ClipboardCommand = { type: 'copy' } | { type: 'copyBars' } | { type: 'cut' } | { type: 'paste'; insert?: boolean };

export type Command =
  | NavigationCommand
  | NoteCommand
  | DocumentCommand
  | ClipboardCommand
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'settings'; settings: Partial<Settings> };

/** Every type of the group must be listed (a Record), so a new command cannot be left unrouted. */
function guard<C extends Command>(types: Record<C['type'], true>): (c: Command) => c is C {
  const set = new Set<string>(Object.keys(types));
  return (c: Command): c is C => set.has(c.type);
}

const all = <K extends string>(...keys: K[]): Record<K, true> => Object.fromEntries(keys.map(k => [k, true])) as Record<K, true>;

export const isNavigation = guard<NavigationCommand>(all('moveString', 'moveBeat', 'moveBar', 'setCursor', 'select', 'selectAll'));

export const isNoteCommand = guard<NoteCommand>(
  all(
    'digit', 'placeFret', 'shorter', 'longer', 'dots', 'rest', 'tuplet', 'setDuration', 'insertBeat', 'deleteNote', 'deleteBeat',
    'tie', 'togglePitch', 'transposeKeys', 'toggleHit', 'cycleHitDynamic', 'pedal', 'toggleFingeringLock', 'hammer', 'slide',
    'bend', 'vibrato', 'palmMute', 'dead', 'letRing', 'tap', 'harmonic', 'tremolo', 'setEffect',
  ),
);

export const isDocumentCommand = guard<DocumentCommand>(
  all(
    'insertBar', 'deleteBar', 'duplicateBar', 'repeatStart', 'repeatEnd', 'setMasterBar', 'setTuning', 'setCapo',
    'renameTrack', 'setTitle', 'setChord', 'setLyric', 'addTrack', 'removeTrack',
  ),
);

export const isClipboardCommand = guard<ClipboardCommand>(all('copy', 'copyBars', 'cut', 'paste'));
