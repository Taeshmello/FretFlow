import { cursorTrack } from '@fretflow/editor-core';
import type { Converted } from '@fretflow/render';
import { useCallback, useEffect, useRef, useState } from 'react';
import { exportAsGp, exportAsJson, exportAsMidi, printScore } from '../app/files';
import { useEditor, type EditorStore } from '../app/store';
import { useAlphaTab, type ViewMode } from '../score/useAlphaTab';
import { WaveformCard } from '../audio/WaveformCard';
import { ExportDialog, HelpDialog } from '../ui/Dialogs';
import { ProUpgradeDialog } from '../ui/ProUpgrade';
import { ShareDialog } from '../ui/ShareDialog';
import { Fretboard, KeyboardHints } from '../ui/Fretboard';
import { NotePanel } from '../ui/NotePanel';
import { PianoKeyboard } from '../ui/PianoKeyboard';
import { DrumPad } from '../ui/DrumPad';
import { TempoSettings } from '../ui/Settings';
import { ScoreCard } from './editor/ScoreCard';
import { TopBar, type Mode } from './editor/TopBar';
import { TransportBar } from './editor/TransportBar';
import { TouchInput } from './editor/TouchInput';
import { PracticePanel } from './editor/PracticePanel';
import { useEditorKeys } from './editor/useEditorKeys';
import { usePracticeControls } from './editor/usePracticeControls';

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
  const [viewMode, setViewMode] = useState<ViewMode>('scoreTab');
  const [mode, setMode] = useState<Mode>('write');
  const [dialog, setDialog] = useState<'export' | 'help' | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const convertedRef = useRef<Converted | null>(null);
  const onConverted = useCallback((c: Converted) => {
    convertedRef.current = c;
  }, []);
  const dispatch = store.dispatch;

  const practice = usePracticeControls({ store, editor, api, mode, setMode, converted: convertedRef });
  const { playback, recording, practiceEnabled, useRecordingPlayback, trainer } = practice;
  const openHelp = useCallback(() => setDialog('help'), []);
  const { octave, setOctave } = useEditorKeys({ store, dialogOpen: dialog !== null, onPlayPause: practice.playPause, onHelp: openHelp });

  // Dev-only handle for latency benchmarks (CLAUDE.md performance budget).
  useEffect(() => {
    if ((import.meta.env.DEV || window.location.search.includes('bench')) && api) {
      (window as unknown as { __ff?: unknown }).__ff = { store, api };
    }
  }, [api, store]);

  const tempo = editor.score.masterBars[editor.cursor.barIndex]?.tempo ?? editor.score.masterBars[0]?.tempo ?? 120;
  const activeTrack = cursorTrack(editor.score, editor.cursor);
  const stringInstrument = activeTrack.instrument === 'guitar' || activeTrack.instrument === 'bass';

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
        onShare={() => setShareOpen(true)}
        onBack={onBack}
        account={account}
      />
      {saveError && <div className="banner error">Saving failed. Check your browser storage; your edits will be retried on the next save.</div>}
      {error && <div className="banner error">Score display error: {error}</div>}
      {editor.notice && <div className="banner">{editor.notice}</div>}
      <TransportBar
        playing={useRecordingPlayback ? recording.playing : playback.state.playing}
        ready={useRecordingPlayback || playback.state.ready}
        position={practice.position}
        onPlayPause={practice.playMain}
        loopLabel={practice.loopLabel}
        looping={practice.looping}
        canLoop={mode === 'practice' || !!practice.selectedBars}
        onLoop={practice.toggleLoop}
        speed={useRecordingPlayback ? recording.rate : playback.state.speed}
        onSpeed={trainer.onUserSpeed}
        pitch={playback.pitch}
        onPitch={practice.setPitch}
        tempo={tempo}
        tempoEditor={<TempoSettings editor={editor} dispatch={dispatch} />}
        click={useRecordingPlayback ? recording.metronome : playback.state.metronome}
        onClick={practice.toggleMetronome}
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
            routine={practice.routine}
            looping={practice.looping}
            loopBars={practice.selectedBars}
            currentBar={editor.cursor.barIndex + 1}
            onLoop={practice.toggleLoop}
            metronome={recording.loaded ? recording.metronome : playback.state.metronome}
            onMetronome={practice.toggleMetronome}
            hasRecording={recording.loaded}
          />
        ) : <NotePanel editor={editor} dispatch={dispatch} />}
      </div>
      {mode === 'write' && <TouchInput editor={editor} dispatch={dispatch} octave={octave} onOctave={setOctave} />}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {upgradeOpen && <ProUpgradeDialog onClose={() => setUpgradeOpen(false)} />}
      {shareOpen && <ShareDialog scoreId={editor.score.id} isCover={editor.score.meta.composerType === 'cover'} onClose={() => setShareOpen(false)} />}
      {dialog === 'export' && (
        <ExportDialog
          barCount={editor.score.masterBars.length}
          selection={practice.selectedBars}
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
