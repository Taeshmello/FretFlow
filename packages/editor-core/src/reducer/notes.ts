import { isFretted, setOp } from '@fretflow/score-model';
import type { NoteCommand } from '../command';
import { cut } from '../commands/clipboard';
import * as fx from '../commands/effects';
import { deleteNote, enterFretDigit, placeFret } from '../commands/input';
import * as pitched from '../commands/pitched';
import * as rhythm from '../commands/rhythm';
import { cursorNote } from '../cursor';
import type { EditorState } from '../state';
import type { Ctx } from './context';

export function editNotes({ state, base, now, commit, activeTrack }: Ctx, command: NoteCommand): EditorState {
  const { score, cursor, selection } = base;
  switch (command.type) {
    case 'digit': {
      const { change, pending } = enterFretDigit(score, cursor, command.digit, now, state.pending, base.settings);
      return { ...commit(base, change), pending, selection: null };
    }
    case 'placeFret':
      return commit(base, placeFret(score, cursor, command.string, command.fret));
    case 'shorter':
      return commit(base, rhythm.shorter(score, cursor, selection));
    case 'longer':
      return commit(base, rhythm.longer(score, cursor, selection));
    case 'dots':
      return commit(base, rhythm.cycleDots(score, cursor, selection));
    case 'rest':
      return commit(base, rhythm.toggleRest(score, cursor, selection));
    case 'tuplet':
      return commit(base, rhythm.toggleTuplet(score, cursor, selection));
    case 'setDuration':
      return commit(base, rhythm.setDuration(score, cursor, selection, command.base));
    case 'insertBeat':
      return commit(base, rhythm.insertBeatAfter(score, cursor));
    case 'deleteNote':
      if (selection) {
        return commit(base, cut(score, selection, cursor).change);
      }
      return commit(base, isFretted(activeTrack.instrument) ? deleteNote(score, cursor) : pitched.clearBeat(score, cursor));
    case 'deleteBeat':
      return commit(base, rhythm.deleteBeats(score, cursor, selection));
    case 'tie':
      return commit(base, activeTrack.instrument === 'piano' ? pitched.toggleKeyTie(score, cursor) : fx.toggleTie(score, cursor));
    case 'togglePitch':
      return commit(base, pitched.togglePitch(score, cursor, command.pitch));
    case 'transposeKeys':
      return commit(base, pitched.transposeKeys(score, cursor, command.delta));
    case 'toggleHit':
      return commit(base, pitched.toggleHit(score, cursor, command.piece));
    case 'cycleHitDynamic':
      return commit(base, pitched.cycleHitDynamic(score, cursor, command.piece));
    case 'pedal':
      return commit(base, pitched.cyclePedal(score, cursor));
    case 'toggleFingeringLock': {
      const note = cursorNote(score, cursor);
      return note ? commit(base, { ops: [setOp(score, note.id, ['fingeringLocked'], !note.fingeringLocked)], label: 'fingering lock' }) : base;
    }
    case 'hammer':
      return commit(base, fx.toggleHammer(score, cursor, selection));
    case 'slide':
      return commit(base, fx.cycleSlide(score, cursor, selection));
    case 'bend':
      return commit(base, fx.cycleBend(score, cursor, selection));
    case 'vibrato':
      return commit(base, fx.toggleVibrato(score, cursor, selection));
    case 'palmMute':
      return commit(base, fx.togglePalmMute(score, cursor, selection));
    case 'dead':
      return commit(base, fx.toggleDead(score, cursor, selection));
    case 'letRing':
      return commit(base, fx.toggleLetRing(score, cursor, selection));
    case 'tap':
      return commit(base, fx.toggleTap(score, cursor, selection));
    case 'harmonic':
      return commit(base, fx.cycleHarmonic(score, cursor, selection));
    case 'tremolo':
      return commit(base, rhythm.cycleTremolo(score, cursor, selection, command.speed));
    case 'setEffect':
      return commit(base, fx.setEffect(score, cursor, selection, command.key, command.value));
  }
}
