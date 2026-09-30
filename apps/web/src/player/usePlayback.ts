import * as alphaTab from '@coderline/alphatab';
import type { Converted } from '@fretflow/render';
import type { Beat } from '@fretflow/score-model';
import { useCallback, useEffect, useState } from 'react';
import { clearPlaybackLoop } from './clearPlaybackLoop';
import { crossedLoopBoundary } from './speedTrainer';

export interface PlaybackState {
  ready: boolean;
  playing: boolean;
  /** 0.5–1.0 in the MVP (SPEC §2). */
  speed: number;
  looping: boolean;
  metronome: boolean;
  countIn: boolean;
  /** 0..1, synth master volume (the audio crossfader drives it too). */
  volume: number;
  positionMs: number;
  endMs: number;
  loopCount: number;
}

const INITIAL: PlaybackState = {
  ready: false,
  playing: false,
  speed: 1,
  looping: false,
  metronome: false,
  countIn: false,
  volume: 1,
  positionMs: 0,
  endMs: 0,
  loopCount: 0,
};

/** alphaSynth transport (D-016). */
export function usePlayback(api: alphaTab.AlphaTabApi | null) {
  const [state, setState] = useState<PlaybackState>(INITIAL);

  useEffect(() => {
    if (!api) {
      return;
    }
    let previousTick: number | null = null;
    const offs = [
      api.playerReady.on(() => setState(s => ({ ...s, ready: true }))),
      api.playerStateChanged.on(e => setState(s => ({ ...s, playing: e.state === alphaTab.synth.PlayerState.Playing }))),
      api.playerPositionChanged.on(e => {
        const range = api.playbackRange;
        const wrapped = api.isLooping && range !== null
          && crossedLoopBoundary(previousTick, e.currentTick, range.startTick, range.endTick);
        previousTick = e.currentTick;
        setState(s => ({ ...s, positionMs: e.currentTime, endMs: e.endTime, loopCount: s.loopCount + (wrapped ? 1 : 0) }));
      }),
    ];
    return () => offs.forEach(off => off());
  }, [api]);

  const update = useCallback(
    (patch: Partial<PlaybackState>) => {
      setState(s => {
        const next = { ...s, ...patch };
        if (api) {
          api.playbackSpeed = next.speed;
          api.isLooping = next.looping;
          api.metronomeVolume = next.metronome ? 1 : 0;
          api.countInVolume = next.countIn ? 1 : 0;
          api.masterVolume = next.volume;
        }
        return next;
      });
    },
    [api],
  );

  /** Starts from the given beat when stopped, so Space plays from the cursor. */
  const playPause = useCallback(
    (fromBeat: alphaTab.model.Beat | null) => {
      if (!api || !api.isReadyForPlayback) {
        return;
      }
      if (api.playerState !== alphaTab.synth.PlayerState.Playing && fromBeat && !api.playbackRange) {
        api.tickPosition = fromBeat.absolutePlaybackStart;
      }
      api.playPause();
    },
    [api],
  );

  const stop = useCallback(() => api?.stop(), [api]);

  /** Start the synth at a score tick (alphaTab also uses 960 ticks per quarter), at a given speed. */
  const playFromTick = useCallback(
    (tick: number, speed: number) => {
      if (!api || !api.isReadyForPlayback) {
        return;
      }
      update({ speed });
      api.playbackSpeed = speed;
      api.tickPosition = Math.max(0, Math.round(tick));
      api.play();
    },
    [api, update],
  );
  const pause = useCallback(() => api?.pause(), [api]);

  const [muted, setMuted] = useState<ReadonlySet<number>>(new Set());
  const toggleMute = useCallback(
    (trackIndex: number) => {
      const track = api?.score?.tracks[trackIndex];
      if (!api || !track) {
        return;
      }
      setMuted(prev => {
        const next = new Set(prev);
        const mute = !next.has(trackIndex);
        if (mute) {
          next.add(trackIndex);
        } else {
          next.delete(trackIndex);
        }
        api.changeTrackMute([track], mute);
        return next;
      });
    },
    [api],
  );

  // A new alphaTab score (every edit) resets mute flags, so re-apply them after each load.
  useEffect(() => {
    if (!api) {
      return;
    }
    return api.scoreLoaded.on(score => {
      const tracks = score.tracks.filter((_, i) => muted.has(i));
      if (tracks.length) {
        api.changeTrackMute(tracks, true);
      }
    });
  }, [api, muted]);

  /** A-B loop over our beats; null clears it. */
  const setLoopRange = useCallback(
    (converted: Converted | null, from: Beat | null, to: Beat | null) => {
      if (!api) {
        return;
      }
      const a = from && converted?.beats.get(from.id);
      const b = to && converted?.beats.get(to.id);
      if (a && b) {
        api.highlightPlaybackRange(a, b);
        api.applyPlaybackRangeFromHighlight();
        update({ looping: true });
      } else {
        clearPlaybackLoop(api);
        update({ looping: false });
      }
    },
    [api, update],
  );

  return { state, update, playPause, stop, setLoopRange, muted, toggleMute, playFromTick, pause };
}
