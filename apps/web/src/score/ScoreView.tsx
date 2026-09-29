import type * as alphaTab from '@coderline/alphatab';
import { beatsInRange, selectionRange, type Command, type EditorState } from '@fretflow/editor-core';
import { beatBox, cellAt, cellBox, toAlphaTab, toAlphaTabString, type Box, type Converted } from '@fretflow/render';
import { barFill } from '@fretflow/score-model';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Audition } from '../app/store';
import type { ViewMode } from './useAlphaTab';

interface Props {
  api: alphaTab.AlphaTabApi | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  editor: EditorState;
  audition: Audition | null;
  viewMode: ViewMode;
  dispatch: (c: Command) => void;
  onConverted: (c: Converted) => void;
}

interface Overlay {
  cursor: Box | null;
  selection: Box[];
  over: Box[];
  under: Box[];
  offset: { left: number; top: number };
}

const EMPTY: Overlay = { cursor: null, selection: [], over: [], under: [], offset: { left: 0, top: 0 } };

export function ScoreView({ api, containerRef, editor, audition, viewMode, dispatch, onConverted }: Props) {
  const convertedRef = useRef<Converted | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const [overlay, setOverlay] = useState<Overlay>(EMPTY);
  const lastAudition = useRef(0);
  const { score, cursor, selection } = editor;

  // Re-convert and re-render on every document change (D-015: full render, ~20–30ms for 200 bars).
  // A layout effect, so the render starts before the browser paints instead of one frame later.
  useLayoutEffect(() => {
    if (!api) {
      return;
    }
    const converted = toAlphaTab(score, { staffMode: viewMode }, api.settings);
    convertedRef.current = converted;
    onConverted(converted);
    api.renderScore(converted.score, score.tracks.map((_, i) => i));
  }, [api, score, viewMode, onConverted]);

  useEffect(() => {
    if (!api) {
      return;
    }
    return api.postRenderFinished.on(() => setLayoutTick(t => t + 1));
  }, [api]);

  // Audition: sound the note that was just entered.
  useEffect(() => {
    const converted = convertedRef.current;
    if (!api || !audition || audition.seq === lastAudition.current || !converted) {
      return;
    }
    lastAudition.current = audition.seq;
    const beat = converted.beats.get(audition.beatId);
    const track = score.tracks.find(t => t.bars.some(b => b.beats.some(x => x.id === audition.beatId)));
    const atString = track ? toAlphaTabString(audition.string, track.tuning.length) : -1;
    const note = beat?.notes.find(n => n.string === atString);
    if (note && api.isReadyForPlayback) {
      api.playNote(note);
    }
  }, [api, audition, score]);

  useLayoutEffect(() => {
    const converted = convertedRef.current;
    const lookup = api?.boundsLookup ?? null;
    const surface = containerRef.current?.querySelector<HTMLElement>('.at-surface');
    const wrap = wrapRef.current;
    if (!api || !converted || !lookup || !surface || !wrap) {
      setOverlay(EMPTY);
      return;
    }
    const s = surface.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const offset = { left: s.left - w.left, top: s.top - w.top };
    const track = score.tracks.find(t => t.id === cursor.trackId) ?? score.tracks[0];
    const beat = track.bars[cursor.barIndex]?.beats[cursor.beatIndex];
    const cursorBox = beat ? cellBox(lookup, converted, beat.id, cursor.string, track.tuning.length) : null;
    const sel = selection
      ? beatsInRange(score, selectionRange(selection))
          .map(r => beatBox(lookup, converted, r.beat.id))
          .filter((b): b is Box => b !== null)
      : [];
    const over: Box[] = [];
    const under: Box[] = [];
    for (const t of score.tracks) {
      t.bars.forEach((bar, i) => {
        const fill = barFill(bar, score.masterBars[i]);
        if (fill.state === 'over') {
          bar.beats.forEach(b => {
            const box = beatBox(lookup, converted, b.id);
            if (box) {
              over.push(box);
            }
          });
        } else if (fill.state === 'under' && bar.beats.length) {
          const box = beatBox(lookup, converted, bar.beats[bar.beats.length - 1].id);
          if (box) {
            under.push({ ...box, x: box.x + box.w, w: 14 });
          }
        }
      });
    }
    setOverlay({ cursor: cursorBox, selection: sel, over, under, offset });
  }, [api, score, cursor, selection, layoutTick, containerRef]);

  function handleClick(e: React.MouseEvent) {
    const converted = convertedRef.current;
    const surface = containerRef.current?.querySelector<HTMLElement>('.at-surface');
    if (!api || !converted || !surface) {
      return;
    }
    const rect = surface.getBoundingClientRect();
    const hit = cellAt(api.boundsLookup, converted, e.clientX - rect.left, e.clientY - rect.top, ti => score.tracks[ti].tuning.length);
    if (hit) {
      const trackId = score.tracks[hit.trackIndex].id;
      dispatch({ type: 'setCursor', cursor: { trackId, barIndex: hit.barIndex, beatIndex: hit.beatIndex, string: hit.string }, extend: e.shiftKey });
    }
  }

  const place = (b: Box) => ({ left: b.x + overlay.offset.left, top: b.y + overlay.offset.top, width: b.w, height: b.h });

  return (
    <div className="score-wrap" ref={wrapRef}>
      <div className="score-surface" ref={containerRef} onMouseDown={handleClick} />
      <div className="score-overlay" aria-hidden="true">
        {overlay.over.map((b, i) => (
          <div key={`o${i}`} className="bar-over" style={place(b)} />
        ))}
        {overlay.under.map((b, i) => (
          <div key={`u${i}`} className="bar-under" style={place(b)} title="Bar is not full; the rest plays as silence" />
        ))}
        {overlay.selection.map((b, i) => (
          <div key={`s${i}`} className="selection-box" style={place(b)} />
        ))}
        {overlay.cursor && <div className="cursor-box" style={place(overlay.cursor)} />}
      </div>
    </div>
  );
}
