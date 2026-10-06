import { beatsInRange, cursorBeat, selectionRange, type EditorState } from '@fretflow/editor-core';
import { loopFromBars } from '@fretflow/audio-engine';
import type { Converted } from '@fretflow/render';
import { useCallback, useEffect } from 'react';
import { usePlan } from '../../app/session';
import type { EditorStore } from '../../app/store';
import { track as trackEvent } from '../../app/telemetry';
import { useRecording } from '../../audio/useRecording';
import { usePlayback } from '../../player/usePlayback';
import { usePracticeRoutine } from '../../player/usePracticeRoutine';
import { useSpeed } from '../../player/useSpeed';
import { useSpeedTrainer } from '../../player/useSpeedTrainer';
import type { useAlphaTab } from '../../score/useAlphaTab';
import type { Mode } from './TopBar';

type AlphaTabApi = ReturnType<typeof useAlphaTab>['api'];

interface Options {
  store: EditorStore;
  editor: EditorState;
  api: AlphaTabApi;
  mode: Mode;
  setMode: (mode: Mode) => void;
  /** Latest model → alphaTab conversion, for mapping our beats to playback ticks. */
  converted: React.RefObject<Converted | null>;
}

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Playback and practice wiring for the editor: picks the synth or the uploaded
 * recording, and drives loops, metronome, speed, the speed trainer and saved
 * routines on whichever one is playing. Practice tools need Pro (D-028).
 */
export function usePracticeControls({ store, editor, api, mode, setMode, converted }: Options) {
  const playback = usePlayback(api);
  const plan = usePlan();

  useEffect(() => {
    playback.update({ looping: false });
  }, [editor.score, playback.update]);

  const playPause = useCallback(() => {
    const beat = cursorBeat(store.state.score, store.state.cursor);
    playback.playPause(beat ? converted.current?.beats.get(beat.id) ?? null : null);
  }, [playback, store, converted]);

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
  const useRecordingPlayback = practiceEnabled && recording.loaded && playback.pitch === 0;
  useEffect(() => {
    if (!practiceEnabled) {
      setMode('write');
      recording.pause();
      recording.setLoop(null);
      recording.setMetronome(false);
      playback.setLoopRange(null, null, null);
      playback.update({ metronome: false, countIn: false, speed: 1 });
      playback.setPitch(0);
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
      playback.setLoopRange(converted.current, beats[0].beat, beats[beats.length - 1].beat);
    }
  }, [playback, store, practiceEnabled, converted]);

  const sel = editor.selection ? selectionRange(editor.selection) : null;
  const selectedBars: [number, number] | null = sel ? [sel.from.barIndex + 1, sel.to.barIndex + 1] : null;
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
      playback.setLoopRange(converted.current, first, last);
      const rendered = converted.current?.beats.get(first.id);
      if (api && rendered) api.tickPosition = rendered.absolutePlaybackStart;
    }
  };
  const routine = usePracticeRoutine({
    scoreId: editor.score.id,
    barCount: editor.score.masterBars.length,
    loopCount: useRecordingPlayback ? recording.loopCount : playback.state.loopCount,
    onLoopRange: applyPracticeLoop,
  });
  const position = useRecordingPlayback
    ? `${formatTime(recording.time * 1000)} / ${formatTime(recording.duration * 1000)}`
    : `Bar ${editor.cursor.barIndex + 1} · beat ${editor.cursor.beatIndex + 1}`;

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

  function setPitch(semitones: number) {
    if (!practiceEnabled) return;
    if (recording.playing) recording.pause();
    playback.setPitch(semitones);
  }

  return {
    playback,
    recording,
    practiceEnabled,
    useRecordingPlayback,
    selectedBars,
    loopLabel,
    looping,
    position,
    trainer,
    routine,
    playPause,
    playMain,
    toggleLoop,
    toggleMetronome,
    setPitch,
  };
}
