import {
  addAnchor,
  AudioTrackPlayer,
  buildTempoMap,
  Crossfader,
  emptySyncMap,
  loopFromBars,
  Metronome,
  requestPeaks,
  secondsToTick,
  syncMapFromScore,
  tickToSeconds,
  type LoopRegion,
  type PeakLevels,
  type SyncMap,
} from '@fretflow/audio-engine';
import type { Score } from '@fretflow/score-model';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { persistence } from '../app/persistence';
import { track } from '../app/telemetry';
import { loadErrorMessage, pullFromCloud, pushToCloud, saveLocalAudio } from './audioSource';
import { beatMapMeter, nextBarLine } from './metronomeSync';
import { useSynthFollow } from './useSynthFollow';

export interface SynthLink {
  /** Master volume for alphaSynth (the crossfader's synth side). */
  setVolume: (v: number) => void;
  play: (tick: number, rate: number) => void;
  pause: () => void;
  getTick: () => number;
  seek: (tick: number) => void;
}

/**
 * The user's own recording (SPEC §7, D-009: kept outside the Score, never shared):
 * player, waveform, beat map, loop, metronome and keeping the synth in step.
 */
export function useRecording(scoreId: string, score: Score, synth: SynthLink) {
  const ctxRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<AudioTrackPlayer | null>(null);
  const faderRef = useRef<Crossfader | null>(null);
  const metroRef = useRef<Metronome | null>(null);
  const lastTimeRef = useRef(0);
  const [metronome, setMetronome] = useState(false);
  const [audioId, setAudioId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [peaks, setPeaks] = useState<PeakLevels | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  /** Allowed speeds for the plan; kept for a player created later. */
  const rateRangeRef = useRef<[number, number]>([0.5, 1]);
  const [loop, setLoopState] = useState<LoopRegion | null>(null);
  const [mix, setMixState] = useState(0);
  const [map, setMap] = useState<SyncMap>(emptySyncMap());
  const [error, setError] = useState<string | null>(null);
  const synthRef = useRef(synth);
  synthRef.current = synth;

  const follow = useSynthFollow(
    playerRef,
    map,
    useCallback(() => synthRef.current.getTick(), []),
    useCallback((t: number) => synthRef.current.seek(t), []),
    useCallback(() => synthRef.current.pause(), []),
  );
  // The player's time listener is created once, so it reaches these through refs.
  const followRef = useRef(follow);
  followRef.current = follow;
  const resyncRef = useRef<() => void>(() => {});

  function ensurePlayer(): AudioTrackPlayer {
    if (!playerRef.current) {
      const ctx = new AudioContext();
      const fader = new Crossfader(ctx);
      fader.onSynthGain(g => synthRef.current.setVolume(g));
      const player = new AudioTrackPlayer(ctx, { destination: fader.input, rateRange: rateRangeRef.current });
      player.onTime(t => {
        // A jump (seek or loop wrap) means the click grid and the synth must be re-aligned.
        const expected = lastTimeRef.current;
        lastTimeRef.current = t;
        if (Math.abs(t - expected) > 0.25) {
          resyncRef.current();
          followRef.current.jumped();
        }
        setTime(t);
        followRef.current.onAudioTime(t);
      });
      player.onState(s => setPlaying(s === 'playing'));
      metroRef.current = new Metronome(ctx, { volume: 0.7 });
      ctxRef.current = ctx;
      faderRef.current = fader;
      playerRef.current = player;
    }
    return playerRef.current;
  }

  async function loadBlob(blob: Blob, id: string, fileName: string, cachedPeaks?: PeakLevels) {
    setError(null);
    try {
      const loaded = await ensurePlayer().load(blob);
      setDuration(loaded.duration);
      setAudioId(id);
      setName(fileName);
      const p = await persistence(() => {});
      if (cachedPeaks) {
        setPeaks(cachedPeaks);
      } else {
        const levels = await requestPeaks(loaded.channels, loaded.sampleRate, { transfer: true });
        setPeaks(levels);
        await p.media.putPeaks(id, levels);
      }
      const saved = (await p.media.syncMapsFor(scoreId)).find(m => m.audioId === id);
      setMap(saved ? { anchors: saved.anchors, offsetMs: saved.offsetMs } : syncMapFromScore(score, 0));
    } catch (err) {
      setError(loadErrorMessage(err));
    }
  }

  // Reopen the audio this score used last time (local first, then the account's copy).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const p = await persistence(() => {});
      const id = await p.media.getPref<string>(`audio:${scoreId}`);
      let stored = id ? await p.media.getAudio(id) : undefined;
      if (!stored && p.remote) {
        stored = await pullFromCloud(p, scoreId).catch(() => undefined);
      }
      if (alive && stored) {
        const cached = (await p.media.getPeaks(stored.id)) as PeakLevels | undefined;
        await loadBlob(stored.blob, stored.id, stored.name, cached);
      }
    })();
    return () => {
      alive = false;
      metroRef.current?.dispose();
      metroRef.current = null;
      playerRef.current?.dispose();
      faderRef.current?.dispose();
      void ctxRef.current?.close();
      playerRef.current = null;
    };
    // Load once per score.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreId]);

  // Persist the beat map whenever it changes.
  useEffect(() => {
    if (!audioId || map.anchors.length === 0) {
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        const p = await persistence(() => {});
        await p.media.putSyncMap({ scoreId, audioId, anchors: map.anchors, offsetMs: map.offsetMs, updatedAt: Date.now() });
        await pushToCloud(p, scoreId, audioId, map, duration);
      })();
    }, 800);
    return () => clearTimeout(t);
  }, [map, audioId, scoreId, duration]);

  const tempo = useMemo(() => buildTempoMap(score), [score]);
  const barLines = useMemo(() => {
    if (!map.anchors.length) {
      return [];
    }
    const anchored = new Set(map.anchors.map(a => a.tick));
    return tempo.bars.map(b => ({ bar: b.index, seconds: tickToSeconds(map, b.startTick), anchored: anchored.has(b.startTick) }));
  }, [map, tempo]);

  // Clicks follow the beat map (not the score tempo), scaled by the playback rate.
  resyncRef.current = () => {
    const metro = metroRef.current;
    const ctx = ctxRef.current;
    const p = playerRef.current;
    if (!metro || !ctx || !p) {
      return;
    }
    metro.stop();
    if (!metronome || p.state !== 'playing' || !map.anchors.length || !tempo.bars.length) {
      return;
    }
    metro.setProvider(beatMapMeter(map, tempo, p.rate));
    const next = nextBarLine(map, tempo, p.currentTime, p.rate);
    if (next) {
      metro.start(ctx.currentTime + Math.max(0.02, next.inSeconds), next.bar);
    }
  };
  useEffect(() => resyncRef.current(), [metronome, playing, rate, map, tempo]);
  useEffect(() => follow.onPlaying(playing), [playing, follow]);

  const player = playerRef.current;
  const setLoop = (l: LoopRegion | null) => {
    if (l && !loop) {
      track('loop_used', { source: 'audio' });
    }
    setLoopState(l);
    player?.setLoop(l);
  };

  return {
    loaded: audioId !== null,
    name,
    peaks,
    duration,
    time,
    playing,
    rate,
    loop,
    mix,
    map,
    metronome,
    error,
    tempo,
    barLines,
    async open(file: File) {
      const id = await saveLocalAudio(await persistence(() => {}), scoreId, file);
      track('audio_connected', {});
      await loadBlob(file, id, file.name);
    },
    setRate(r: number) {
      setRateState(r);
      if (player) {
        player.rate = r;
      }
    },
    setRateRange(range: [number, number]) {
      rateRangeRef.current = range;
      playerRef.current?.setRateRange(range);
    },
    setMix(m: number) {
      setMixState(m);
      faderRef.current?.setMix(m);
    },
    setMetronome,
    setMap,
    setLoop,
    loopBars(first: number, last: number) {
      setLoop(loopFromBars(map, tempo, first, last));
    },
    seek(seconds: number) {
      player?.seek(seconds);
    },
    moveBarLine(bar: number, seconds: number) {
      const b = tempo.bars[bar];
      if (b) {
        setMap(m => addAnchor(m, { tick: b.startTick, seconds }));
      }
    },
    /** Recording and synth start together; the synth follows the recording. */
    playTogether() {
      follow.start();
      synthRef.current.play(secondsToTick(map, time), rate);
      void player?.play();
    },
    /** Pausing the recording also pauses the synth (useSynthFollow.onPlaying). */
    pause() {
      player?.pause();
    },
  };
}

export type Recording = ReturnType<typeof useRecording>;
