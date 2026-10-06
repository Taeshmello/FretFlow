import { cursorTrack, type Command, type EditorState } from '@fretflow/editor-core';
import { isFretted } from '@fretflow/score-model';
import { DurationSection } from './notePanel/DurationSection';
import { SelectionSection } from './notePanel/SelectionSection';
import { TechniqueSection } from './notePanel/TechniqueSection';

interface Props {
  editor: EditorState;
  dispatch: (c: Command) => void;
}

export function NotePanel({ editor, dispatch }: Props) {
  const track = cursorTrack(editor.score, editor.cursor);
  return (
    <aside className="note-panel card" aria-label="Selected note">
      <SelectionSection editor={editor} dispatch={dispatch} />
      <DurationSection editor={editor} dispatch={dispatch} />
      {isFretted(track.instrument) && <TechniqueSection editor={editor} dispatch={dispatch} />}
    </aside>
  );
}
