import { cursorBeat, cursorTrack, selectionRange, beatsInRange, type Command } from '@fretflow/editor-core';
import type { Converted } from '@fretflow/render';
import { useCallback, useEffect, useRef, useState } from 'react';
import { exportAsGp, exportAsJson, exportAsMidi, printScore } from '../app/files';
import { useEditor, type EditorStore } from '../app/store';
import { track as trackEvent } from '../app/telemetry';
import { isTextTarget, mapKey } from '../keymap';
import { usePlayback } from '../player/usePlayback';
import { useAlphaTab, type ViewMode } from '../score/useAlphaTab';
import { useRecording } from '../audio/useRecording';
import { WaveformCard } from '../audio/WaveformCard';
import { ExportDialog, HelpDialog } from '../ui/Dialogs';
import { Fretboard, KeyboardHints } from '../ui/Fretboard';
import { NotePanel } from '../ui/NotePanel';
import { TempoSettings } from '../ui/Settings';
import { ScoreCard } from './editor/ScoreCard';
import { TopBar, type Mode } from './editor/TopBar';
import { TransportBar } from './editor/TransportBar';
import { TouchInput } from './editor/TouchInput';
import { PracticePanel } from './editor/PracticePanel';

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
  const [mode, setMode] = useState<Mode>('write');
  const [dialog, setDialog] = useState<'export' | 'help' | null>(null);
  const convertedRef = useRef<Converted | null>(null);
  const onConverted = useCallback((c: Converted) => {
    convertedRef.current = c;
  }, []);
  const dispatch = store.dispatch;

  useEffect(() => {
    playback.update({ looping: false });
  }, [editor.score, playback.update]);

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
  const recording = useRecording(editor.score.id, editor.score, {
    setVolume: v => playback.update({ volume: v }),
    play: playback.playFromTick,
    pause: playback.pause,
    getTick: getSynthTick,
    seek: seekSynth,
  });

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
  const tempo = editor.score.masterBars[editor.cursor.barIndex]?.tempo ?? editor.score.masterBars[0]?.tempo ?? 120;
  const loopLabel = selectedBars
    ? `Loop bars ${selectedBars[0]}${selectedBars[1] === selectedBars[0] ? '' : `–${selectedBars[1]}`}`
    : playback.state.looping || recording.loop
      ? 'Loop active'
      : null;
  const looping = playback.state.looping || !!recording.loop;
  const fmt = (ms: number) => {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };
  const position = `Bar ${editor.cursor.barIndex + 1} · beat ${editor.cursor.beatIndex + 1}`;
  const activeTrack = cursorTrack(editor.score, editor.cursor);
  const stringInstrument = activeTrack.instrument === 'guitar' || activeTrack.instrument === 'bass';

  function toggleLoop() {
    if (recording.loaded) {
      if (recording.loop) {
        recording.setLoop(null);
      } else {
        const bars = selectedBars ?? [editor.cursor.barIndex + 1, editor.cursor.barIndex + 1];
        recording.loopBars(bars[0] - 1, bars[1] - 1);
      }
      return;
    }
    loopSelection();
  }

  function setSpeed(speed: number) {
    recording.setRate(speed);
    playback.update({ speed });
  }

  function toggleMetronome() {
    if (recording.loaded) {
      recording.setMetronome(!recording.metronome);
    } else {
      playback.update({ metronome: !playback.state.metronome });
    }
  }

  function playMain() {
    if (recording.loaded) {
      if (recording.playing) {
        recording.pause();
      } else {
        recording.playTogether();
      }
      return;
    }
    playPause();
  }

  return (
    <div className={`editor editor-v2 mode-${mode}`}>
      <TopBar
        title={editor.score.meta.title}
        artist={editor.score.meta.artist ?? ''}
        onTitle={title => dispatch({ type: 'setTitle', title, artist: editor.score.meta.artist })}
        saveLabel={saveLabel}
        saveError={saveError}
        mode={mode}
        onMode={setMode}
        canUndo={editor.history.undo.length > 0}
        canRedo={editor.history.redo.length > 0}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onExport={() => setDialog('export')}
        onBack={onBack}
      />
      {saveError && <div className="banner error">저장에 실패했습니다. 브라우저 저장 공간을 확인하세요. 편집 내용은 다음 저장 때 다시 시도합니다.</div>}
      {error && <div className="banner error">악보 표시 오류: {error}</div>}
      {editor.notice && <div className="banner">{editor.notice}</div>}
      <TransportBar
        playing={recording.loaded ? recording.playing : playback.state.playing}
        ready={recording.loaded || playback.state.ready}
        position={recording.loaded ? `${fmt(recording.time * 1000)} / ${fmt(recording.duration * 1000)}` : position}
        onPlayPause={playMain}
        loopLabel={loopLabel}
        looping={looping}
        canLoop={mode === 'practice' || !!selectedBars}
        onLoop={toggleLoop}
        speed={recording.loaded ? recording.rate : playback.state.speed}
        onSpeed={setSpeed}
        tempo={tempo}
        tempoEditor={<TempoSettings editor={editor} dispatch={dispatch} />}
        click={recording.loaded ? recording.metronome : playback.state.metronome}
        onClick={toggleMetronome}
        countIn={playback.state.countIn}
        onCountIn={() => playback.update({ countIn: !playback.state.countIn })}
        hasRecording={recording.loaded}
        onRecording={() => document.querySelector<HTMLInputElement>('.wave-card input[type="file"]')?.click()}
        mix={recording.mix}
        onMix={recording.setMix}
      />
      <div className="editor-body">
        <main className="editor-stack">
          <WaveformCard
            rec={recording}
            score={editor.score}
            showBeatMap={mode === 'practice'}
            onSetTempo={bpm => dispatch({ type: 'setMasterBar', prop: 'tempo', value: bpm, barIndex: 0 })}
          />
          <ScoreCard
            api={api}
            containerRef={containerRef}
            scrollRef={scrollRef}
            editor={editor}
            audition={audition}
            viewMode={viewMode}
            onViewMode={setViewMode}
            dispatch={dispatch}
            onConverted={onConverted}
            muted={playback.muted}
            onToggleMute={playback.toggleMute}
            editable={mode === 'write'}
          />
          {mode === 'write' && stringInstrument && (
            <div className="fret-row">
              <Fretboard editor={editor} dispatch={dispatch} />
              <KeyboardHints onAll={() => setDialog('help')} />
            </div>
          )}
        </main>
        {mode === 'write' ? (stringInstrument ? <NotePanel editor={editor} dispatch={dispatch} /> : <aside className="card practice-rail"><h3>전용 입력 준비 중</h3><p>피아노·드럼은 현재 오선보 표시와 기본 악보 설정을 지원합니다. 음표 입력은 후속 단계에서 추가됩니다.</p></aside>) : (
          <PracticePanel
            speed={recording.loaded ? recording.rate : playback.state.speed}
            onSpeed={setSpeed}
            looping={looping}
            loopBars={selectedBars}
            currentBar={editor.cursor.barIndex + 1}
            onLoop={toggleLoop}
            metronome={recording.loaded ? recording.metronome : playback.state.metronome}
            onMetronome={toggleMetronome}
            hasRecording={recording.loaded}
          />
        )}
      </div>
      {mode === 'write' && stringInstrument && <TouchInput editor={editor} dispatch={dispatch} />}
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
