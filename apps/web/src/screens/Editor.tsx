import { cursorBeat, cursorTrack, selectionRange, beatsInRange } from '@fretflow/editor-core';
import { loopFromBars } from '@fretflow/audio-engine';
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
import { ProUpgradeDialog } from '../ui/ProUpgrade';
import { usePlan } from '../app/session';
import { Fretboard, KeyboardHints } from '../ui/Fretboard';
import { NotePanel } from '../ui/NotePanel';
import { PianoKeyboard } from '../ui/PianoKeyboard';
import { DrumPad } from '../ui/DrumPad';
import { previewDrum, previewPitch } from '../audio/preview';
import { TempoSettings } from '../ui/Settings';
import { ScoreCard } from './editor/ScoreCard';
import { TopBar, type Mode } from './editor/TopBar';
import { useSpeed } from '../player/useSpeed';
import { useSpeedTrainer } from '../player/useSpeedTrainer';
import { usePracticeRoutine } from '../player/usePracticeRoutine';
import { TransportBar } from './editor/TransportBar';
import { TouchInput } from './editor/TouchInput';
import { PracticePanel } from './editor/PracticePanel';

interface Props {
  store: EditorStore;
  onBack: () => void;
  saveLabel: string;
  saveError: boolean;
  account?: React.ReactNode;
}

export function Editor({ store, onBack, saveLabel, saveError, account }: Props) {
  const { editor, audition } = useEditor(store);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { containerRef, api, error } = useAlphaTab(scrollRef);
  const playback = usePlayback(api);
  const plan = usePlan();
  const [viewMode, setViewMode] = useState<ViewMode>('scoreTab');
  const [mode, setMode] = useState<Mode>('write');
  /** Octave the piano letter keys type into (4 = middle C). */
  const [octave, setOctave] = useState(4);
  const [dialog, setDialog] = useState<'export' | 'help' | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
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
  const practiceEnabled = plan === 'pro';
  const useRecordingPlayback = practiceEnabled && recording.loaded;
  useEffect(() => {
    if (!practiceEnabled) {
      setMode('write');
      recording.pause();
      recording.setLoop(null);
      recording.setMetronome(false);
      playback.setLoopRange(null, null, null);
      playback.update({ metronome: false, countIn: false, speed: 1 });
    }
    // Only react to entitlement changes, not to each player state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceEnabled]);
  const setSpeed = useSpeed({
    speed: useRecordingPlayback ? recording.rate : playback.state.speed,
    setRecordingRate: recording.setRate,
    setRecordingRange: recording.setRateRange,
    setSynthSpeed: speed => playback.update({ speed }),
  });

  const loopSelection = useCallback(() => {
    if (!practiceEnabled) return;
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
  }, [playback, store, practiceEnabled]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialog || isTextTarget(e.target) || document.querySelector('dialog[open]')) {
        return;
      }
      const { score, cursor } = store.state;
      const track = cursorTrack(score, cursor);
      const result = mapKey(e, { instrument: track.instrument, octave });
      if (!result) {
        return;
      }
      e.preventDefault();
      if ('command' in result) {
        const c = result.command;
        // Hear a key or drum as it is added, like the guitar audition.
        const beat = cursorBeat(score, cursor);
        if (c.type === 'togglePitch' && !beat?.keys?.some(k => k.pitch === c.pitch)) {
          previewPitch(c.pitch);
        } else if (c.type === 'toggleHit' && !beat?.hits?.some(h => h.piece === c.piece)) {
          previewDrum(c.piece);
        }
        dispatch(c);
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
        case 'octaveUp':
          setOctave(o => Math.min(7, o + 1));
          break;
        case 'octaveDown':
          setOctave(o => Math.max(1, o - 1));
          break;
        case 'save':
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, dialog, playPause, octave, store]);

  const sel = editor.selection ? selectionRange(editor.selection) : null;
  const selectedBars: [number, number] | null = sel ? [sel.from.barIndex + 1, sel.to.barIndex + 1] : null;
  const tempo = editor.score.masterBars[editor.cursor.barIndex]?.tempo ?? editor.score.masterBars[0]?.tempo ?? 120;
  const loopLabel = selectedBars
    ? `Loop bars ${selectedBars[0]}${selectedBars[1] === selectedBars[0] ? '' : `–${selectedBars[1]}`}`
    : playback.state.looping || recording.loop
      ? 'Loop active'
      : null;
  const looping = useRecordingPlayback ? !!recording.loop : playback.state.looping;
  const playbackRange = api?.playbackRange;
  const loopKey = useRecordingPlayback
    ? recording.loop ? `audio:${recording.loop.start}:${recording.loop.end}` : ''
    : playbackRange ? `synth:${playbackRange.startTick}:${playbackRange.endTick}` : '';
  const trainer = useSpeedTrainer({
    enabled: practiceEnabled && mode === 'practice',
    looping,
    loopKey,
    loopCount: useRecordingPlayback ? recording.loopCount : playback.state.loopCount,
    setSpeed,
  });
  const applyPracticeLoop = (bars: [number, number] | null) => {
    if (!practiceEnabled) return;
    if (recording.loaded) {
      if (!bars) {
        recording.setLoop(null);
      } else {
        const region = loopFromBars(recording.map, recording.tempo, bars[0] - 1, bars[1] - 1);
        recording.setLoop(region);
        if (region) recording.seek(region.start);
      }
      return;
    }
    if (!bars) {
      playback.setLoopRange(null, null, null);
      return;
    }
    const track = editor.score.tracks.find(t => t.id === editor.cursor.trackId);
    const beats = track?.bars.slice(bars[0] - 1, bars[1]).flatMap(bar => bar.beats) ?? [];
    const first = beats[0];
    const last = beats[beats.length - 1];
    if (first && last) {
      playback.setLoopRange(convertedRef.current, first, last);
      const rendered = convertedRef.current?.beats.get(first.id);
      if (api && rendered) api.tickPosition = rendered.absolutePlaybackStart;
    }
  };
  const routine = usePracticeRoutine({
    scoreId: editor.score.id,
    barCount: editor.score.masterBars.length,
    loopCount: useRecordingPlayback ? recording.loopCount : playback.state.loopCount,
    onLoopRange: applyPracticeLoop,
  });
  const fmt = (ms: number) => {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };
  const position = `Bar ${editor.cursor.barIndex + 1} · beat ${editor.cursor.beatIndex + 1}`;
  const activeTrack = cursorTrack(editor.score, editor.cursor);
  const stringInstrument = activeTrack.instrument === 'guitar' || activeTrack.instrument === 'bass';

  function toggleLoop() {
    if (!practiceEnabled) return;
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


  function toggleMetronome() {
    if (!practiceEnabled) return;
    if (recording.loaded) {
      recording.setMetronome(!recording.metronome);
    } else {
      playback.update({ metronome: !playback.state.metronome });
    }
  }

  function playMain() {
    if (useRecordingPlayback) {
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
        practiceLocked={!practiceEnabled}
        onMode={next => next === 'practice' && !practiceEnabled ? setUpgradeOpen(true) : setMode(next)}
        canUndo={editor.history.undo.length > 0}
        canRedo={editor.history.redo.length > 0}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onExport={() => setDialog('export')}
        onBack={onBack}
        account={account}
      />
      {saveError && <div className="banner error">Saving failed. Check your browser storage; your edits will be retried on the next save.</div>}
      {error && <div className="banner error">Score display error: {error}</div>}
      {editor.notice && <div className="banner">{editor.notice}</div>}
      <TransportBar
        playing={useRecordingPlayback ? recording.playing : playback.state.playing}
        ready={useRecordingPlayback || playback.state.ready}
        position={useRecordingPlayback ? `${fmt(recording.time * 1000)} / ${fmt(recording.duration * 1000)}` : position}
        onPlayPause={playMain}
        loopLabel={loopLabel}
        looping={looping}
        canLoop={mode === 'practice' || !!selectedBars}
        onLoop={toggleLoop}
        speed={useRecordingPlayback ? recording.rate : playback.state.speed}
        onSpeed={trainer.onUserSpeed}
        tempo={tempo}
        tempoEditor={<TempoSettings editor={editor} dispatch={dispatch} />}
        click={useRecordingPlayback ? recording.metronome : playback.state.metronome}
        onClick={toggleMetronome}
        countIn={playback.state.countIn}
        onCountIn={() => playback.update({ countIn: !playback.state.countIn })}
        hasRecording={useRecordingPlayback}
        onRecording={() => document.querySelector<HTMLInputElement>('.wave-card input[type="file"]')?.click()}
        mix={recording.mix}
        onMix={recording.setMix}
      />
      <div className="editor-body">
        <main className="editor-stack">
          {practiceEnabled && <WaveformCard
            rec={recording}
            score={editor.score}
            showBeatMap={mode === 'practice'}
            onSetTempo={bpm => dispatch({ type: 'setMasterBar', prop: 'tempo', value: bpm, barIndex: 0 })}
          />}
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
          {mode === 'write' && activeTrack.instrument === 'piano' && (
            <PianoKeyboard editor={editor} dispatch={dispatch} octave={octave} onOctave={setOctave} />
          )}
          {mode === 'write' && activeTrack.instrument === 'drums' && <DrumPad editor={editor} dispatch={dispatch} />}
        </main>
        {mode === 'write' ? (
          <NotePanel editor={editor} dispatch={dispatch} />
        ) : practiceEnabled ? (
          <PracticePanel
            speed={recording.loaded ? recording.rate : playback.state.speed}
            onSpeed={trainer.onUserSpeed}
            trainer={trainer}
            routine={routine}
            looping={looping}
            loopBars={selectedBars}
            currentBar={editor.cursor.barIndex + 1}
            onLoop={toggleLoop}
            metronome={recording.loaded ? recording.metronome : playback.state.metronome}
            onMetronome={toggleMetronome}
            hasRecording={recording.loaded}
          />
        ) : <NotePanel editor={editor} dispatch={dispatch} />}
      </div>
      {mode === 'write' && <TouchInput editor={editor} dispatch={dispatch} octave={octave} onOctave={setOctave} />}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {upgradeOpen && <ProUpgradeDialog onClose={() => setUpgradeOpen(false)} />}
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
