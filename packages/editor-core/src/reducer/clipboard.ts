import type { ClipboardCommand } from '../command';
import { copyBars, pasteBars, wholeBarRange } from '../commands/barClip';
import { copy, cut, paste } from '../commands/clipboard';
import type { EditorState } from '../state';
import type { Ctx } from './context';

export function editClipboard({ base, commit, activeTrack }: Ctx, command: ClipboardCommand): EditorState {
  const { score, cursor, selection } = base;
  switch (command.type) {
    case 'copy': {
      const clip = copy(score, selection, cursor);
      const range = wholeBarRange(score, selection);
      return clip ? { ...base, clipboard: range ? { ...clip, bars: copyBars(score, ...range) } : clip } : base;
    }
    case 'copyBars': {
      // The bars the selection touches, or the cursor bar.
      const [from, to] = selection
        ? [Math.min(selection.anchor.barIndex, selection.head.barIndex), Math.max(selection.anchor.barIndex, selection.head.barIndex)]
        : [cursor.barIndex, cursor.barIndex];
      const barSelection = {
        anchor: { ...cursor, barIndex: from, beatIndex: 0, string: 1 },
        head: { ...cursor, barIndex: to, beatIndex: Math.max(0, activeTrack.bars[to].beats.length - 1), string: Math.max(1, activeTrack.tuning.length) },
      };
      const clip = copy(score, barSelection, cursor);
      return clip ? { ...base, clipboard: { ...clip, bars: copyBars(score, from, to) } } : base;
    }
    case 'cut': {
      const { clip, change } = cut(score, selection, cursor);
      const range = wholeBarRange(score, selection);
      return clip ? { ...commit(base, change), clipboard: range ? { ...clip, bars: copyBars(score, ...range) } : clip } : base;
    }
    case 'paste': {
      if (!base.clipboard) {
        return base;
      }
      const { change, dropped } = base.clipboard.bars
        ? pasteBars(score, cursor, base.clipboard.bars, command.insert === true)
        : paste(score, cursor, base.clipboard);
      const next = commit(base, change);
      return dropped ? { ...next, notice: `${dropped} note(s) did not fit this tuning and were skipped` } : next;
    }
  }
}
