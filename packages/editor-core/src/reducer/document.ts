import { findBeat, setOp, type Op } from '@fretflow/score-model';
import type { DocumentCommand } from '../command';
import * as bars from '../commands/bars';
import * as tracks from '../commands/tracks';
import type { EditorState } from '../state';
import type { Ctx } from './context';

export function editDocument({ base, commit }: Ctx, command: DocumentCommand): EditorState {
  const { score, cursor } = base;
  const trackId = cursor.trackId;
  switch (command.type) {
    case 'insertBar':
      return commit(base, bars.insertBar(score, cursor, command.after));
    case 'deleteBar':
      return commit(base, bars.deleteBar(score, cursor));
    case 'duplicateBar':
      return commit(base, bars.duplicateBar(score, cursor));
    case 'repeatStart':
      return commit(base, bars.toggleRepeatStart(score, cursor));
    case 'repeatEnd':
      return commit(base, bars.cycleRepeatEnd(score, cursor));
    case 'setMasterBar':
      return commit(base, bars.setMasterBarProp(score, command.barIndex ?? cursor.barIndex, command.prop, command.value));
    case 'setTuning':
      return commit(base, tracks.setTuning(score, trackId, command.tuning));
    case 'setCapo':
      return commit(base, tracks.setCapo(score, trackId, command.capo));
    case 'renameTrack':
      return commit(base, tracks.renameTrack(score, trackId, command.name));
    case 'setTitle': {
      const ops: Op[] = [setOp(score, score.id, ['meta', 'title'], command.title)];
      if (command.artist !== undefined) {
        ops.push(setOp(score, score.id, ['meta', 'artist'], command.artist || undefined));
      }
      return commit(base, { ops, label: 'title' });
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
      return commit(base, { ops: [setOp(score, beat.id, ['chord'], chord)], label: 'chord symbol' });
    }
    case 'setLyric': {
      const beat = findBeat(score, command.beatId);
      if (!beat) {
        return base;
      }
      const lyric = command.lyric.slice(0, 160) || undefined;
      if (beat.lyric === lyric) {
        return base;
      }
      return commit(base, { ops: [setOp(score, beat.id, ['lyric'], lyric)], label: 'lyric' });
    }
    case 'addTrack':
      return commit(base, tracks.addTrack(score, cursor, command.instrument, command.tuning));
    case 'removeTrack':
      return commit(base, tracks.removeTrack(score, trackId, cursor));
  }
}
