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
import { useEffect, useMemo, useRef, useState } from 'react';
import { persistence } from '../app/persistence';
import { track } from '../app/telemetry';
import { beatMapMeter, nextBarLine } from './metronomeSync';
import { useSynthFollow } from './useSynthFollow';
import { loadErrorMessage, pullFromCloud, pushToCloud, saveLocalAudio } from './audioSource';
import { AudioTransport } from './AudioTransport';
import { BeatMapControls } from './BeatMapControls';
import { Waveform } from './Waveform';

interface Props {
  scoreId: string;
  score: Score;
  synthVolume: (v: number) => void;
  selectedBars: [number, number] | null;
  onSetTempo: (bpm: number) => void;
  /** Start / stop the score synth together with the recording. */
  onSynthPlay: (tick: number, rate: number) => void;
  onSynthPause: () => void;
  /** Current synth tick, for keeping it aligned with the recording. */
  getSynthTick: () => number;
  onSynthSeek: (tick: number) => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/**
 * The user's own recording (SPEC §7, D-009: kept outside the Score, never shared).
 * Slow-down uses the browser's pitch-preserving playback (see audio-engine).
 */
export function AudioPanel({ scoreId, score, synthVolume, selectedBars, onSetTempo, onSynthPlay, onSynthPause, getSynthTick, onSynthSeek }: Props) {
  const ctxRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<AudioTrackPlayer | null>(null);
  const faderRef = useRef<Crossfader | null>(null);
  const metroRef = useRef<Metronome | null>(null);
  const lastTimeRef = useRef(0);
  const [metroOn, setMetroOn] = useState(false);
  const [audioId, setAudioId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [peaks, setPeaks] = useState<PeakLevels | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState<LoopRegion | null>(null);
  const [mix, setMix] = useState(0);
  const [map, setMap] = useState<SyncMap>(emptySyncMap());
  const follow = useSynthFollow(playerRef, map, getSynthTick, onSynthSeek, onSynthPause);
  // The player's time listener is created once, so it reaches the hook through a ref.
  const followRef = useRef(follow);
  followRef.current = follow;
  const [error, setError] = useState<string | null>(null);

  function ensurePlayer(): AudioTrackPlayer {
    if (!playerRef.current) {
      const ctx = new AudioContext();
      const fader = new Crossfader(ctx);
      fader.onSynthGain(g => synthVolume(g));
      const player = new AudioTrackPlayer(ctx, { destination: fader.input });
      player.onTime(t => {
        // A jump (seek or loop wrap) means the click grid has to be re-aligned.
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
      const maps = await p.media.syncMapsFor(scoreId);
      const saved = maps.find(m => m.audioId === id);
      setMap(saved ? { anchors: saved.anchors, offsetMs: saved.offsetMs } : syncMapFromScore(score, 0));
    } catch (err) {
      setError(loadErrorMessage(err));
    }
  }

  // Reopen the audio this score used last time (stored locally only).
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

  async function onFile(file: File) {
    const id = await saveLocalAudio(await persistence(() => {}), scoreId, file);
    track('audio_connected', {});
    await loadBlob(file, id, file.name);
  }

  const tempo = useMemo(() => buildTempoMap(score), [score]);
  const barLines = useMemo(() => {
    if (!map.anchors.length) {
      return [];
    }
    const anchored = new Set(map.anchors.map(a => a.tick));
    return tempo.bars.map(b => ({ bar: b.index, seconds: tickToSeconds(map, b.startTick), anchored: anchored.has(b.startTick) }));
  }, [map, tempo]);
  const currentBar = useMemo(() => {
    const tick = secondsToTick(map, time);
    let bar = 1;
    for (const b of tempo.bars) {
      if (b.startTick <= tick) {
        bar = b.index + 1;
      }
    }
    return bar;
  }, [map, time, tempo]);

  /**
   * Clicks follow the beat map, not the score tempo: each bar's BPM is measured from the
   * sync map, scaled by the playback rate, and started on the next bar line of the audio.
   */
  const resyncRef = useRef<() => void>(() => {});
  resyncRef.current = () => {
    const metro = metroRef.current;
    const ctx = ctxRef.current;
    const p = playerRef.current;
    if (!metro || !ctx || !p) {
      return;
    }
    metro.stop();
    if (!metroOn || p.state !== 'playing' || !map.anchors.length || !tempo.bars.length) {
      return;
    }
    metro.setProvider(beatMapMeter(map, tempo, p.rate));
    const next = nextBarLine(map, tempo, p.currentTime, p.rate);
    if (next) {
      metro.start(ctx.currentTime + Math.max(0.02, next.inSeconds), next.bar);
    }
  };
  useEffect(() => resyncRef.current(), [metroOn, playing, rate, map, tempo]);

  useEffect(() => follow.onPlaying(playing), [playing, follow]);

  const player = playerRef.current;
  const applyLoop = (l: LoopRegion | null) => {
    if (l && !loop) {
      track('loop_used', { source: 'audio' });
    }
    setLoop(l);
    player?.setLoop(l);
  };

  if (!audioId) {
    return (
      <div className="audio-panel">
        <label className="button primary">
          내 음원 올리기 (mp3, wav, m4a · 15분/100MB 이하)
          <input type="file" accept="audio/*" hidden onChange={e => e.target.files?.[0] && void onFile(e.target.files[0])} />
        </label>
        <p className="muted small">음원은 이 브라우저에만 저장되고 악보 파일·공유에는 포함되지 않습니다.</p>
        {error && <p className="error-text">{error}</p>}
      </div>
    );
  }

  return (
    <div className="audio-panel">
      <AudioTransport
        playing={playing}
        label={`${fmt(time)} / ${fmt(duration)} · 마디 ${currentBar}`}
        rate={rate}
        onRate={r => {
          setRate(r);
          if (player) {
            player.rate = r;
          }
        }}
        onPlayPause={() => (playing ? player?.pause() : void player?.play())}
        canLoopSelection={!!selectedBars}
        onLoopSelection={() => selectedBars && applyLoop(loopFromBars(map, tempo, selectedBars[0] - 1, selectedBars[1] - 1))}
        hasLoop={!!loop}
        onClearLoop={() => applyLoop(null)}
        onTogether={() => {
          if (playing) {
            // Pausing the recording also pauses the synth (useSynthFollow.onPlaying).
            player?.pause();
            return;
          }
          follow.start();
          onSynthPlay(secondsToTick(map, time), rate);
          void player?.play();
        }}
        metronome={metroOn}
        onMetronome={() => setMetroOn(v => !v)}
        mix={mix}
        onMix={m => {
          setMix(m);
          faderRef.current?.setMix(m);
        }}
        fileName={name}
        onFile={f => void onFile(f)}
      />
      <Waveform
        peaks={peaks}
        duration={duration}
        time={time}
        loop={loop}
        barLines={barLines}
        onSeek={s => player?.seek(s)}
        onLoop={applyLoop}
        onMoveBarLine={(bar, seconds) => {
          const b = tempo.bars[bar];
          if (b) {
            setMap(m => addAnchor(m, { tick: b.startTick, seconds }));
          }
        }}
      />
      <BeatMapControls score={score} time={time} map={map} onMap={setMap} onSetTempo={onSetTempo} />
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
