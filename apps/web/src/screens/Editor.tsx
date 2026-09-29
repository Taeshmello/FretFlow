import { cursorBeat, selectionRange, beatsInRange, type Command } from '@fretflow/editor-core';
import type { Converted } from '@fretflow/render';
import { useCallback, useEffect, useRef, useState } from 'react';
import { exportAsGp, exportAsJson, exportAsMidi, printScore } from '../app/files';
import { useEditor, type EditorStore } from '../app/store';
import { track as trackEvent } from '../app/telemetry';
import { isTextTarget, mapKey } from '../keymap';
import { usePlayback } from '../player/usePlayback';
import { ScoreView } from '../score/ScoreView';
import { useAlphaTab, type ViewMode } from '../score/useAlphaTab';
import { AudioPanel } from '../audio/AudioPanel';
import { ExportDialog, HelpDialog } from '../ui/Dialogs';
import { Fretboard } from '../ui/Fretboard';
import { Inspector } from '../ui/Inspector';
import { Toolbar } from '../ui/Toolbar';

interface Props {
  store: EditorStore;
  onBack: () => void;
  saveLabel: string;
  saveError: boolean;
}

export function Editor({ store, onBack, saveLabel, saveError }: Props) {
  const { editor, audition } = useEditor(store);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { containerRef, api, error } = useAlphaTab(scrollRef);
  const playback = usePlayback(api);
  const [viewMode, setViewMode] = useState<ViewMode>('scoreTab');
  const [dialog, setDialog] = useState<'export' | 'help' | null>(null);
  const [showFretboard, setShowFretboard] = useState(true);
  const [showAudio, setShowAudio] = useState(false);
  const convertedRef = useRef<Converted | null>(null);
  const onConverted = useCallback((c: Converted) => {
    convertedRef.current = c;
  }, []);
  const dispatch = store.dispatch;

  // Dev-only handle for latency benchmarks (CLAUDE.md performance budget).
  useEffect(() => {
    if ((import.meta.env.DEV || window.location.search.includes('bench')) && api) {
      (window as unknown as { __ff?: unknown }).__ff = { store, api };
    }
  }, [api, store]);

  const playPause = useCallback(() => {
    const beat = cursorBeat(store.state.score, store.state.cursor);
    playback.playPause(beat ? convertedRef.current?.beats.get(beat.id) ?? null : null);
  }, [playback, store]);

  const getSynthTick = useCallback(() => api?.tickPosition ?? 0, [api]);
  const seekSynth = useCallback(
    (tick: number) => {
      if (api) {
        api.tickPosition = tick;
      }
    },
    [api],
  );

  const loopSelection = useCallback(() => {
    const { selection, score, cursor } = store.state;
    if (playback.state.looping) {
      playback.setLoopRange(null, null, null);
      return;
    }
    const range = selectionRange(selection ?? { anchor: { ...cursor, beatIndex: 0 }, head: { ...cursor, beatIndex: 1e9 } });
    const beats = beatsInRange(score, range);
    if (beats.length) {
      trackEvent('loop_used', { source: 'synth' });
      playback.setLoopRange(convertedRef.current, beats[0].beat, beats[beats.length - 1].beat);
    }
  }, [playback, store]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialog || isTextTarget(e.target) || document.querySelector('dialog[open]')) {
        return;
      }
      const result = mapKey(e);
      if (!result) {
        return;
      }
      e.preventDefault();
      if ('command' in result) {
        dispatch(result.command as Command);
        return;
      }
      switch (result.shell) {
        case 'playPause':
          playPause();
          break;
        case 'help':
          setDialog('help');
          break;
        case 'escape':
          dispatch({ type: 'select', selection: null });
          break;
        case 'save':
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, dialog, playPause]);

  const sel = editor.selection ? selectionRange(editor.selection) : null;
  const selectedBars: [number, number] | null = sel ? [sel.from.barIndex + 1, sel.to.barIndex + 1] : null;
  const track = editor.score.tracks.find(t => t.id === editor.cursor.trackId);

  return (
    <div className="editor">
      <header className="topbar">
        <button type="button" className="ghost back" onClick={onBack} aria-label="악보 목록">
          ←
        </button>
        <div className="title-edit">
          <input
            aria-label="제목"
            value={editor.score.meta.title}
            onChange={e => dispatch({ type: 'setTitle', title: e.target.value })}
          />
          <input
            aria-label="아티스트"
            className="artist"
            placeholder="아티스트"
            value={editor.score.meta.artist ?? ''}
            onChange={e => dispatch({ type: 'setTitle', title: editor.score.meta.title, artist: e.target.value })}
          />
        </div>
        <span className={`save-status${saveError ? ' is-error' : ''}`} role="status">
          {saveLabel}
        </span>
        <span className="where">
          {track?.name} · 마디 {editor.cursor.barIndex + 1}/{editor.score.masterBars.length} · 박 {editor.cursor.beatIndex + 1} · {editor.cursor.string}번 현
        </span>
      </header>
      {saveError && <div className="banner error">저장에 실패했습니다. 브라우저 저장 공간을 확인하세요. 편집 내용은 다음 저장 때 다시 시도합니다.</div>}
      {error && <div className="banner error">악보 표시 오류: {error}</div>}
      {editor.notice && <div className="banner">{editor.notice}</div>}
      <Toolbar
        editor={editor}
        dispatch={dispatch}
        playback={playback.state}
        onPlayPause={playPause}
        onStop={playback.stop}
        onPlayback={playback.update}
        onLoopSelection={loopSelection}
        viewMode={viewMode}
        onViewMode={setViewMode}
        onExport={() => setDialog('export')}
        onHelp={() => setDialog('help')}
      />
      <div className="workspace">
        <main className="score-scroll" ref={scrollRef} aria-label="Score">
          <ScoreView
            api={api}
            containerRef={containerRef}
            editor={editor}
            audition={audition}
            viewMode={viewMode}
            dispatch={dispatch}
            onConverted={onConverted}
          />
        </main>
        <Inspector editor={editor} dispatch={dispatch} muted={playback.muted} onToggleMute={playback.toggleMute} />
      </div>
      <div className="dock">
        <div className="dock-tabs">
          <button type="button" aria-pressed={showFretboard} onClick={() => setShowFretboard(v => !v)}>
            지판
          </button>
          <button type="button" aria-pressed={showAudio} onClick={() => setShowAudio(v => !v)}>
            음원
          </button>
        </div>
        {showFretboard && <Fretboard editor={editor} dispatch={dispatch} />}
        <div hidden={!showAudio}>
          <AudioPanel
            scoreId={editor.score.id}
            score={editor.score}
            synthVolume={v => playback.update({ volume: v })}
            selectedBars={selectedBars}
            onSetTempo={bpm => dispatch({ type: 'setMasterBar', prop: 'tempo', value: bpm, barIndex: 0 })}
            onSynthPlay={playback.playFromTick}
            onSynthPause={playback.pause}
            getSynthTick={getSynthTick}
            onSynthSeek={seekSynth}
          />
        </div>
      </div>
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog === 'export' && (
        <ExportDialog
          barCount={editor.score.masterBars.length}
          selection={selectedBars}
          onClose={() => setDialog(null)}
          onPdf={o => api && printScore(api, o)}
          onMidi={() => exportAsMidi(editor.score)}
          onGp={() => exportAsGp(editor.score)}
          onJson={() => exportAsJson(editor.score)}
        />
      )}
    </div>
  );
}
