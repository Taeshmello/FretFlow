import * as alphaTab from '@coderline/alphatab';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildCursorView, cursorBox, cursorFromPoint, type CursorBox, type ViewNote } from './alphatab/bounds';
import { useAlphaTab, type AlphaTabOptions } from './alphatab/useAlphaTab';
import { advanceAutoRun, nextDigit, startAutoRun, summarize, type AutoRun, type AutoRunResult } from './bench/autoRun';
import { pushSample, type Sample } from './bench/latency';
import { moveBeat, moveString, noteAt, type Cursor, type CursorScore } from './cursor/cursor';
import { buildScore } from './score/benchScore';
import { loadSampleRiff, loadScoreFromBytes } from './score/sampleRiff';
import { CursorOverlay } from './ui/CursorOverlay';
import { FileDrop } from './ui/FileDrop';
import { Stats } from './ui/Stats';
import { Toolbar, type RenderMode, type ScoreSource } from './ui/Toolbar';

const STALE_MEASUREMENT_MS = 5000;
const AUTO_RUN_SAMPLES = 100;
const AUTO_RUN_WARMUP = 5;
/** Pause between automated edits, roughly a fast typist, so edits never pile up. */
const AUTO_RUN_GAP_MS = 100;

declare global {
  interface Window {
    /** PoC-only handle so measurements and coordinate probes can be driven from the console. */
    __poc?: { api: alphaTab.AlphaTabApi; score: alphaTab.model.Score | null; result?: AutoRunResult };
  }
}

/** Puts the cursor on the first note of the score so typing has something to edit. */
function firstNoteCursor(view: CursorScore<ViewNote>): Cursor {
  for (let barIndex = 0; barIndex < view.bars.length; barIndex++) {
    const beats = view.bars[barIndex].beats;
    for (let beatIndex = 0; beatIndex < beats.length; beatIndex++) {
      const note = beats[beatIndex].notes[0];
      if (note) {
        return { trackIndex: 0, barIndex, beatIndex, string: note.string };
      }
    }
  }
  return { trackIndex: 0, barIndex: 0, beatIndex: 0, string: 1 };
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Cursor>({ trackIndex: 0, barIndex: 0, beatIndex: 0, string: 1 });
  const [box, setBox] = useState<CursorBox | null>(null);
  const [surfaceOffset, setSurfaceOffset] = useState({ left: 0, top: 0 });
  const [renderTick, setRenderTick] = useState(0);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoRunResult | null>(null);

  const { containerRef, api, error } = useAlphaTab(options);
  const scoreRef = useRef<alphaTab.model.Score | null>(null);
  const viewRef = useRef<CursorScore<ViewNote> | null>(null);
  const cursorRef = useRef(cursor);
  const pendingRef = useRef<{ t0: number } | null>(null);
  const autoRunRef = useRef<AutoRun | null>(null);
  const autoTimerRef = useRef<number | null>(null);
  const conditionsRef = useRef('');
  const samplesRef = useRef<Sample[]>([]);

  cursorRef.current = cursor;
  samplesRef.current = samples;

  const stopAutoRun = useCallback(() => {
    autoRunRef.current = null;
    if (autoTimerRef.current !== null) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setAutoRunning(false);
  }, []);

  // Goes through the same keydown path a real key press would.
  const dispatchAutoEdit = useCallback(() => {
    autoTimerRef.current = null;
    const view = viewRef.current;
    const target = view ? noteAt(view, cursorRef.current) : null;
    if (!target) {
      stopAutoRun();
      return;
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: nextDigit(target.note.fret) }));
  }, [stopAutoRun]);

  const showScore = useCallback(
    (score: alphaTab.model.Score, builtIn: number | null) => {
      const view = buildCursorView(score, 0);
      scoreRef.current = score;
      viewRef.current = view;
      setCursor(firstNoteCursor(view));
      setBuildMs(builtIn);
      setSamples([]);
      pendingRef.current = null;
      stopAutoRun();
      // A result belongs to the conditions it was measured under.
      setAutoResult(null);
      api?.renderScore(score, [0]);
      if (api) {
        window.__poc = { api, score };
      }
    },
    [api, stopAutoRun],
  );

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
    return api.postRenderFinished.on(() => {
      setRenderTick(t => t + 1);
      const pending = pendingRef.current;
      if (!pending) {
        return;
      }
      pendingRef.current = null;
      const render = performance.now() - pending.t0;
      requestAnimationFrame(() => {
        const sample = { total: performance.now() - pending.t0, render };
        const run = autoRunRef.current;
        if (!run) {
          setSamples(prev => pushSample(prev, sample));
          return;
        }
        const next = advanceAutoRun(run);
        autoRunRef.current = next.run;
        const kept = next.keep ? pushSample(samplesRef.current, sample) : samplesRef.current;
        samplesRef.current = kept;
        setSamples(kept);
        if (next.step === 'edit') {
          autoTimerRef.current = window.setTimeout(dispatchAutoEdit, AUTO_RUN_GAP_MS);
          return;
        }
        const result = summarize(kept, conditionsRef.current, navigator.userAgent);
        setAutoResult(result);
        if (window.__poc) {
          window.__poc.result = result;
        }
        console.log('[poc] auto run result', JSON.stringify(result));
        stopAutoRun();
      });
    });
  }, [api, dispatchAutoEdit, stopAutoRun]);

  // A new api instance means new render conditions, so an in-flight run is void.
  useEffect(() => stopAutoRun, [api, stopAutoRun]);

  function handleAutoRun() {
    if (autoRunning) {
      stopAutoRun();
      return;
    }
    const { run, step } = startAutoRun({ samples: AUTO_RUN_SAMPLES, warmup: AUTO_RUN_WARMUP });
    autoRunRef.current = run;
    samplesRef.current = [];
    setSamples([]);
    setAutoResult(null);
    setAutoRunning(true);
    if (step === 'edit') {
      dispatchAutoEdit();
    }
  }

  // The cursor box has to be recomputed whenever the score is laid out again,
  // because every bounds object is rebuilt by that pass.
  useEffect(() => {
    const score = scoreRef.current;
    const view = viewRef.current;
    const surface = containerRef.current?.querySelector<HTMLElement>('.at-surface');
    if (!api || !score || !view || !surface) {
      setBox(null);
      return;
    }
    setSurfaceOffset({ left: surface.offsetLeft, top: surface.offsetTop });
    setBox(cursorBox(api, score, cursor, view.stringCount));
  }, [api, cursor, renderTick, containerRef]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const view = viewRef.current;
      const score = scoreRef.current;
      if (!api || !view || !score) {
        return;
      }

      const current = cursorRef.current;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor(moveString(view, current, e.key === 'ArrowDown' ? 1 : -1));
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setCursor(moveBeat(view, current, e.key === 'ArrowRight' ? 1 : -1));
        return;
      }

      if (e.key.length !== 1 || e.key < '0' || e.key > '9') {
        return;
      }
      const target = noteAt(view, current);
      if (!target) {
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
      target.note.fret = Number(e.key);
      pendingRef.current = { t0 };

      switch (renderMode) {
        case 'full':
          api.renderScore(score, [0]);
          break;
        case 'reuseViewport':
          api.render({ reuseViewport: true });
          break;
        case 'partial':
          api.render({ reuseViewport: true, firstChangedMasterBar: current.barIndex });
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [api, renderMode]);

  function handleSurfaceClick(e: React.MouseEvent<HTMLDivElement>) {
    const view = viewRef.current;
    const surface = containerRef.current?.querySelector<HTMLElement>('.at-surface');
    if (!api || !view || !surface) {
      return;
    }
    const rect = surface.getBoundingClientRect();
    const next = cursorFromPoint(api, e.clientX - rect.left, e.clientY - rect.top, view.stringCount);
    if (next) {
      setCursor(next);
    }
  }

  async function handleFile(file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      showScore(loadScoreFromBytes(bytes), null);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  const banner = error ?? loadError;
  const noteHere = viewRef.current ? noteAt(viewRef.current, cursor) : null;
  const cursorLabel = `마디 ${cursor.barIndex + 1} · 비트 ${cursor.beatIndex + 1} · ${cursor.string}번 현 · ${
    noteHere ? `${noteHere.note.fret}프렛` : '빈 칸'
  }`;
  const conditions = [
    renderMode,
    source,
    options.engine,
    options.enableLazyLoading ? 'lazy on' : 'lazy off',
    options.useWorkers ? 'worker on' : 'worker off',
  ].join(' · ');
  conditionsRef.current = conditions;

  return (
    <div className="app">
      <header className="topbar">
        <h1>FretFlow PoC — render</h1>
        <span className="source">{cursorLabel}</span>
        <span className="hint">방향키로 커서 이동 · 0–9로 프렛 입력 · 클릭으로 커서 이동 · .gp 드롭</span>
      </header>
      <Toolbar
        source={source}
        onSourceChange={setSource}
        renderMode={renderMode}
        onRenderModeChange={setRenderMode}
        options={options}
        onOptionsChange={setOptions}
        onReset={() => setSamples([])}
        autoRunning={autoRunning}
        onAutoRun={handleAutoRun}
      />
      {banner && <div className="banner">{banner}</div>}
      <FileDrop onFile={handleFile}>
        <div className="surface" ref={containerRef} onClick={handleSurfaceClick} />
        <CursorOverlay box={box} offset={surfaceOffset} />
      </FileDrop>
      <Stats samples={samples} conditions={conditions} buildMs={buildMs} result={autoResult} />
    </div>
  );
}
