import {
  addAnchor,
  AudioLoadError,
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
import { sha256Hex } from '@fretflow/storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { persistence } from '../app/persistence';
import { beatMapMeter, nextBarLine } from './metronomeSync';
import { BeatMapControls } from './BeatMapControls';
import { Waveform } from './Waveform';

interface Props {
  scoreId: string;
  score: Score;
  synthVolume: (v: number) => void;
  selectedBars: [number, number] | null;
  onSetTempo: (bpm: number) => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/**
 * The user's own recording (SPEC §7, D-009: kept outside the Score, never shared).
 * Slow-down uses the browser's pitch-preserving playback (see audio-engine).
 */
export function AudioPanel({ scoreId, score, synthVolume, selectedBars, onSetTempo }: Props) {
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
        }
        setTime(t);
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
      setError(err instanceof AudioLoadError ? { tooLarge: '100MB 이하 파일만 올릴 수 있습니다.', tooLong: '15분 이하 음원만 지원합니다.', decodeFailed: '이 파일을 재생할 수 없습니다.' }[err.code] : String(err));
    }
  }

  // Reopen the audio this score used last time (stored locally only).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const p = await persistence(() => {});
      const id = await p.media.getPref<string>(`audio:${scoreId}`);
      const stored = id ? await p.media.getAudio(id) : undefined;
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
        // Cloud copy only when signed in; the audio goes up once (sha256 dedupe on the server).
        if (!p.remote) {
          return;
        }
        try {
          const stored = await p.media.getAudio(audioId);
          if (!stored) {
            return;
          }
          let remoteId = stored.remoteId;
          if (!remoteId) {
            remoteId = await p.remote.uploadAudio(stored.blob, stored.id, duration * 1000, stored.name);
            await p.media.putAudio({ ...stored, remoteId });
          }
          await p.remote.putSyncMap(scoreId, remoteId, map.anchors, map.offsetMs);
        } catch {
          // Signed out, offline or score not uploaded yet: the local copy is enough for now.
        }
      })();
    }, 800);
    return () => clearTimeout(t);
  }, [map, audioId, scoreId, duration]);

  async function onFile(file: File) {
    const bytes = await file.arrayBuffer();
    const id = await sha256Hex(bytes);
    const p = await persistence(() => {});
    await p.media.putAudio({ id, blob: file, name: file.name, type: file.type, size: file.size, durationMs: 0 });
    await p.media.setPref(`audio:${scoreId}`, id);
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

  const player = playerRef.current;
  const applyLoop = (l: LoopRegion | null) => {
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
      <div className="audio-controls">
        <button type="button" className="tool play" onClick={() => (playing ? player?.pause() : void player?.play())}>
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="time">
          {fmt(time)} / {fmt(duration)} · 마디 {currentBar}
        </span>
        <label className="speed" title="속도 (음높이 유지)">
          <span>{Math.round(rate * 100)}%</span>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={Math.round(rate * 100)}
            onChange={e => {
              const r = Number(e.target.value) / 100;
              setRate(r);
              if (player) {
                player.rate = r;
              }
            }}
          />
        </label>
        <button type="button" className="chip" disabled={!selectedBars} onClick={() => selectedBars && applyLoop(loopFromBars(map, tempo, selectedBars[0] - 1, selectedBars[1] - 1))}>
          선택 마디 반복
        </button>
        <button type="button" className="chip" disabled={!loop} onClick={() => applyLoop(null)}>
          반복 해제
        </button>
        <button type="button" className="chip" aria-pressed={metroOn} onClick={() => setMetroOn(v => !v)} title="비트 맵을 따라가는 클릭">
          메트로놈
        </button>
        <label className="speed" title="원음 ↔ 신스">
          <span>원음</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(mix * 100)}
            onChange={e => {
              const m = Number(e.target.value) / 100;
              setMix(m);
              faderRef.current?.setMix(m);
            }}
          />
          <span>신스</span>
        </label>
        <span className="muted small file-name">{name}</span>
        <label className="chip">
          바꾸기
          <input type="file" accept="audio/*" hidden onChange={e => e.target.files?.[0] && void onFile(e.target.files[0])} />
        </label>
      </div>
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
