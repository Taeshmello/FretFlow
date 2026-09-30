import type { NavigationCommand } from '../command';
import { extendByBar } from '../commands/barClip';
import { advanceRight } from '../commands/navigation';
import { clampCursor, moveBar, moveBeat, moveString } from '../cursor';
import type { EditorState } from '../state';
import { extendSelection, type Ctx } from './context';

export function navigate({ base, commit, activeTrack }: Ctx, command: NavigationCommand): EditorState {
  const { score, cursor, selection } = base;
  switch (command.type) {
    case 'moveString': {
      const to = moveString(score, cursor, command.delta);
      return { ...base, cursor: to, selection: extendSelection(base, to, command.extend) };
    }
    case 'moveBeat': {
      if (command.delta > 0 && !command.extend) {
        const moved = advanceRight(score, cursor);
        return moved.change ? commit({ ...base, selection: null }, moved.change) : { ...base, cursor: moved.cursor, selection: null };
      }
      const to = moveBeat(score, cursor, command.delta).cursor;
      return { ...base, cursor: to, selection: extendSelection(base, to, command.extend) };
    }
    case 'moveBar': {
      if (command.extend) {
        const sel = extendByBar(score, cursor, selection, command.delta);
        return { ...base, cursor: sel.head, selection: sel };
      }
      return { ...base, cursor: moveBar(score, cursor, command.delta), selection: null };
    }
    case 'setCursor': {
      const to = clampCursor(score, command.cursor);
      return { ...base, cursor: to, selection: extendSelection(base, to, command.extend) };
    }
    case 'select':
      return { ...base, selection: command.selection };
    case 'selectAll': {
      const lastBar = activeTrack.bars.length - 1;
      return {
        ...base,
        selection: {
          anchor: { trackId: activeTrack.id, barIndex: 0, beatIndex: 0, string: 1 },
          head: { trackId: activeTrack.id, barIndex: lastBar, beatIndex: activeTrack.bars[lastBar].beats.length - 1, string: activeTrack.tuning.length },
        },
      };
    }
  }
}
