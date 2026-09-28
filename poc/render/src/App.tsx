import * as alphaTab from '@coderline/alphatab';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pushSample, type Sample } from './bench/latency';
import { useAlphaTab, type AlphaTabOptions } from './alphatab/useAlphaTab';
import { buildScore } from './score/benchScore';
import { loadSampleRiff, loadScoreFromBytes } from './score/sampleRiff';
import { FileDrop } from './ui/FileDrop';
import { Stats } from './ui/Stats';
import { Toolbar, type RenderMode, type ScoreSource } from './ui/Toolbar';

const STALE_MEASUREMENT_MS = 5000;

function firstNoteOf(score: alphaTab.model.Score): alphaTab.model.Note | null {
  for (const bar of score.tracks[0].staves[0].bars) {
    for (const voice of bar.voices) {
      for (const beat of voice.beats) {
        if (beat.notes.length > 0) {
          return beat.notes[0];
        }
      }
    }
  }
  return null;
}

function describeNote(note: alphaTab.model.Note): string {
  return `마디 ${note.beat.voice.bar.index + 1} · ${note.string}번 현 · ${note.fret}프렛`;
}

export function App() {
  const [options, setOptions] = useState<AlphaTabOptions>({
    engine: 'svg',
    enableLazyLoading: true,
    useWorkers: true,
  });
  const [source, setSource] = useState<ScoreSource>('sample');
  const [renderMode, setRenderMode] = useState<RenderMode>('partial');
  const [samples, setSamples] = useState<Sample[]>([]);
  const [buildMs, setBuildMs] = useState<number | null>(null);
  const [selectedLabel, setSelectedLabel] = useState('선택된 음 없음');
  const [loadError, setLoadError] = useState<string | null>(null);

  const { containerRef, api, error } = useAlphaTab(options);
  const scoreRef = useRef<alphaTab.model.Score | null>(null);
  const selectedRef = useRef<alphaTab.model.Note | null>(null);
  const pendingRef = useRef<{ t0: number } | null>(null);

  const showScore = useCallback(
    (score: alphaTab.model.Score, builtIn: number | null) => {
      scoreRef.current = score;
      const note = firstNoteOf(score);
      selectedRef.current = note;
      setSelectedLabel(note ? describeNote(note) : '선택된 음 없음');
      setBuildMs(builtIn);
      setSamples([]);
      pendingRef.current = null;
      api?.renderScore(score, [0]);
    },
    [api],
  );

  // Load the score for the chosen source, and reload it onto every rebuilt API.
  useEffect(() => {
    if (!api) {
      return;
    }
    if (source === 'sample') {
      showScore(loadSampleRiff(), null);
    } else {
      const built = buildScore(source);
      showScore(built.score, built.buildMs);
    }
  }, [api, source, showScore]);

  // postRenderFinished means the whole render and display pipeline is done.
  // The next animation frame approximates when the browser actually painted it.
  useEffect(() => {
    if (!api) {
      return;
    }
    const unsubscribe = api.postRenderFinished.on(() => {
      const pending = pendingRef.current;
      if (!pending) {
        return;
      }
      pendingRef.current = null;
      const render = performance.now() - pending.t0;
      requestAnimationFrame(() => {
        setSamples(prev => pushSample(prev, { total: performance.now() - pending.t0, render }));
      });
    });
    return unsubscribe;
  }, [api]);

  useEffect(() => {
    if (!api) {
      return;
    }
    const unsubscribe = api.noteMouseDown.on(note => {
      selectedRef.current = note;
      setSelectedLabel(describeNote(note));
    });
    return unsubscribe;
  }, [api]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.length !== 1 || e.key < '0' || e.key > '9') {
        return;
      }
      const score = scoreRef.current;
      const note = selectedRef.current;
      if (!api || !score || !note) {
        return;
      }
      // One measurement at a time, but never wedge input: if a render never
      // reported back, treat the pending measurement as lost and start over.
      const pending = pendingRef.current;
      if (pending && performance.now() - pending.t0 < STALE_MEASUREMENT_MS) {
        return;
      }
      e.preventDefault();

      const t0 = performance.now();
      note.fret = Number(e.key);
      pendingRef.current = { t0 };

      switch (renderMode) {
        case 'full':
          api.renderScore(score, [0]);
          break;
        case 'reuseViewport':
          api.render({ reuseViewport: true });
          break;
        case 'partial':
          api.render({ reuseViewport: true, firstChangedMasterBar: note.beat.voice.bar.index });
          break;
      }
      setSelectedLabel(describeNote(note));
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [api, renderMode]);

  async function handleFile(file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      showScore(loadScoreFromBytes(bytes), null);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  const banner = error ?? loadError;
  const conditions = [
    renderMode,
    source,
    options.engine,
    options.enableLazyLoading ? 'lazy on' : 'lazy off',
    options.useWorkers ? 'worker on' : 'worker off',
  ].join(' · ');

  return (
    <div className="app">
      <header className="topbar">
        <h1>FretFlow PoC — render</h1>
        <span className="source">{selectedLabel}</span>
        <span className="hint">음표를 클릭해 고르고 0–9를 누르면 프렛이 바뀝니다 · .gp 파일 드롭 가능</span>
      </header>
      <Toolbar
        source={source}
        onSourceChange={setSource}
        renderMode={renderMode}
        onRenderModeChange={setRenderMode}
        options={options}
        onOptionsChange={setOptions}
        onReset={() => setSamples([])}
      />
      {banner && <div className="banner">{banner}</div>}
      <FileDrop onFile={handleFile}>
        <div className="surface" ref={containerRef} />
      </FileDrop>
      <Stats samples={samples} conditions={conditions} buildMs={buildMs} />
    </div>
  );
}
