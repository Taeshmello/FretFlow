import { cursorBeat, type Command, type EditorState } from '@fretflow/editor-core';
import type { DurationBase } from '@fretflow/score-model';
import type { PlaybackState } from '../player/usePlayback';
import type { ViewMode } from '../score/useAlphaTab';

interface Props {
  editor: EditorState;
  dispatch: (c: Command) => void;
  playback: PlaybackState;
  onPlayPause: () => void;
  onStop: () => void;
  onPlayback: (patch: Partial<PlaybackState>) => void;
  onLoopSelection: () => void;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  onExport: () => void;
  onHelp: () => void;
}

// Plain labels: the SMP music symbols are missing from most system fonts.
const DURATIONS: { base: DurationBase; label: string; name: string }[] = [
  { base: 1, label: '1', name: '온음표' },
  { base: 2, label: '½', name: '2분음표' },
  { base: 4, label: '¼', name: '4분음표' },
  { base: 8, label: '⅛', name: '8분음표' },
  { base: 16, label: '16', name: '16분음표' },
  { base: 32, label: '32', name: '32분음표' },
];

function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Toolbar(p: Props) {
  const { editor, dispatch, playback } = p;
  const beat = cursorBeat(editor.score, editor.cursor);
  const d = beat?.duration;
  const canUndo = editor.history.undo.length > 0;
  const canRedo = editor.history.redo.length > 0;

  return (
    <div className="toolbar" role="toolbar" aria-label="Editing tools">
      <div className="tool-group" aria-label="Duration">
        {DURATIONS.map(x => (
          <button
            key={x.base}
            type="button"
            className="tool dur"
            aria-pressed={d?.base === x.base}
            title={`${x.name} (+/- 로 한 단계씩)`}
            onClick={() => dispatch({ type: 'setDuration', base: x.base })}
          >
            {x.label}
          </button>
        ))}
        <button type="button" className="tool" aria-pressed={!!d?.dots} title="점 (.)" onClick={() => dispatch({ type: 'dots' })}>
          {d?.dots === 2 ? '••' : '•'}
        </button>
        <button type="button" className="tool" aria-pressed={!!d?.tuplet} title="셋잇단 (Ctrl/⌘+3)" onClick={() => dispatch({ type: 'tuplet' })}>
          3
        </button>
        <button type="button" className="tool text" aria-pressed={!!beat?.rest} title="쉼표 (R)" onClick={() => dispatch({ type: 'rest' })}>
          쉼표
        </button>
      </div>

      <div className="tool-group">
        <button type="button" className="tool" disabled={!canUndo} title="실행 취소 (Ctrl/⌘+Z)" onClick={() => dispatch({ type: 'undo' })}>
          ↶
        </button>
        <button type="button" className="tool" disabled={!canRedo} title="다시 실행 (Ctrl/⌘+Shift+Z)" onClick={() => dispatch({ type: 'redo' })}>
          ↷
        </button>
      </div>

      <div className="tool-group transport" aria-label="Playback">
        <button type="button" className="tool play" disabled={!playback.ready} title="재생/정지 (Space)" onClick={p.onPlayPause}>
          {playback.playing ? '❚❚' : '▶'}
        </button>
        <button type="button" className="tool" disabled={!playback.ready} title="처음으로" onClick={p.onStop}>
          ■
        </button>
        <span className="time" aria-live="off">
          {playback.ready ? `${formatTime(playback.positionMs)} / ${formatTime(playback.endMs)}` : '사운드 로딩…'}
        </span>
        <label className="speed" title="재생 속도">
          <span>{Math.round(playback.speed * 100)}%</span>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={Math.round(playback.speed * 100)}
            onChange={e => p.onPlayback({ speed: Number(e.target.value) / 100 })}
          />
        </label>
        <button type="button" className="tool" aria-pressed={playback.looping} title="선택 구간 반복 (A-B 루프)" onClick={p.onLoopSelection}>
          ⟲
        </button>
        <button type="button" className="tool text" aria-pressed={playback.metronome} title="메트로놈" onClick={() => p.onPlayback({ metronome: !playback.metronome })}>
          메트로놈
        </button>
        <button type="button" className="tool text" aria-pressed={playback.countIn} title="카운트인 1마디" onClick={() => p.onPlayback({ countIn: !playback.countIn })}>
          1·2·3·4
        </button>
      </div>

      <div className="tool-group right">
        <div className="segmented" role="radiogroup" aria-label="View">
          <button type="button" role="radio" aria-checked={p.viewMode === 'scoreTab'} onClick={() => p.onViewMode('scoreTab')}>
            오선+TAB
          </button>
          <button type="button" role="radio" aria-checked={p.viewMode === 'tab'} onClick={() => p.onViewMode('tab')}>
            TAB
          </button>
        </div>
        <button type="button" className="tool text" onClick={p.onExport}>
          내보내기
        </button>
        <button type="button" className="tool" title="단축키 (?)" onClick={p.onHelp}>
          ?
        </button>
      </div>
    </div>
  );
}
