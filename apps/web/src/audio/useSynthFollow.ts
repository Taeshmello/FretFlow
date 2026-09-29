import type { AudioTrackPlayer, SyncMap } from '@fretflow/audio-engine';
import { useEffect, useMemo, useRef } from 'react';
import { synthCorrection, synthOffsetMs } from './synthSync';

const CHECK_EVERY_MS = 250;

/**
 * While the recording and the synth play together, nudges the synth back onto
 * the recording whenever it is more than ±20 ms off (both run on their own clocks).
 */
export function useSynthFollow(
  playerRef: React.RefObject<AudioTrackPlayer | null>,
  map: SyncMap,
  getSynthTick: () => number,
  onSynthSeek: (tick: number) => void,
  onSynthPause: () => void,
) {
  const together = useRef(false);
  const lastCheck = useRef(0);
  const latest = useRef({ map, getSynthTick, onSynthSeek, onSynthPause });
  latest.current = { map, getSynthTick, onSynthSeek, onSynthPause };

  // Dev-only probe for measuring the audio ↔ synth offset precisely.
  useEffect(() => {
    if (import.meta.env.DEV || window.location.search.includes('bench')) {
      (window as unknown as { __ffSync?: () => number | null }).__ffSync = () => {
        const p = playerRef.current;
        return p ? synthOffsetMs(latest.current.map, p.currentTime, latest.current.getSynthTick(), p.rate) : null;
      };
    }
  }, [playerRef]);

  return useMemo(
    () => ({
      start() {
        together.current = true;
        lastCheck.current = performance.now();
      },
      /** A seek or loop jump in the recording: re-align on the very next time update. */
      jumped() {
        lastCheck.current = 0;
      },
      /** The recording stopped (pause, end of file): the synth stops with it. */
      onPlaying(playing: boolean) {
        if (!playing && together.current) {
          together.current = false;
          latest.current.onSynthPause();
        }
      },
      onAudioTime(audioSeconds: number) {
        const p = playerRef.current;
        if (!together.current || !p || p.state !== 'playing' || performance.now() - lastCheck.current < CHECK_EVERY_MS) {
          return;
        }
        lastCheck.current = performance.now();
        const { map: m, getSynthTick: tick, onSynthSeek: seek } = latest.current;
        const target = synthCorrection(m, audioSeconds, tick(), p.rate);
        if (target !== null) {
          seek(target);
        }
      },
    }),
    [playerRef],
  );
}
