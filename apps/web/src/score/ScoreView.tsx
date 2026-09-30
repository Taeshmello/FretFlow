import * as alphaTab from '@coderline/alphatab';
import { beatsInRange, selectionRange, type Command, type EditorState } from '@fretflow/editor-core';
import { beatBox, cellAt, cellBox, hasCustomWidths, pedalChanges, sustainNoteOffs, toAlphaTab, type Box, type Converted } from '@fretflow/render';
import { barFill } from '@fretflow/score-model';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Audition } from '../app/store';
import { previewPitch } from '../audio/preview';
import { clearPlaybackLoop } from '../player/clearPlaybackLoop';
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
  offset: { left: number; top: number };
}

const EMPTY: Overlay = { cursor: null, selection: [], over: [], offset: { left: 0, top: 0 } };

/** Room kept between the cursor's beat and the edge of the view when following it. */
const FOLLOW_MARGIN = 24;

function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) {
      return p;
    }
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Scrolls the least needed to bring a client-space rectangle into view (no-op when visible). */
function keepInView(scroller: HTMLElement, top: number, bottom: number): void {
  const isPage = scroller === document.scrollingElement || scroller === document.documentElement;
  const viewTop = isPage ? 0 : scroller.getBoundingClientRect().top;
  const viewBottom = isPage ? window.innerHeight : viewTop + scroller.clientHeight;
  if (bottom - top > viewBottom - viewTop - 2 * FOLLOW_MARGIN || top < viewTop + FOLLOW_MARGIN) {
    scroller.scrollTop -= viewTop + FOLLOW_MARGIN - top;
  } else if (bottom > viewBottom - FOLLOW_MARGIN) {
    scroller.scrollTop += bottom - (viewBottom - FOLLOW_MARGIN);
  }
}

export function ScoreView({ api, containerRef, editor, audition, viewMode, dispatch, onConverted }: Props) {
  const convertedRef = useRef<Converted | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const [overlay, setOverlay] = useState<Overlay>(EMPTY);
  const lastAudition = useRef(0);
  // The cursor position the view last scrolled to; edits alone never move the view.
  const followed = useRef('');
  const { score, cursor, selection } = editor;

  // Custom bar widths need the line width to break lines (layout.ts); plain scores
  // leave it to alphaTab and do not re-convert on resize.
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const measure = () => setSurfaceWidth(Math.round(el.clientWidth / 10) * 10);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);
  const layoutWidth = hasCustomWidths(score) ? surfaceWidth : 0;

  // Re-convert and re-render on every document change (D-015: full render, ~20–30ms for 200 bars).
  // A layout effect, so the render starts before the browser paints instead of one frame later.
  useLayoutEffect(() => {
    if (!api) {
      return;
    }
    // Playback highlights refer to bounds of the previous score. Keeping them
    // across renderScore can make alphaTab dereference missing realBounds.
    if (api.playbackRange) {
      clearPlaybackLoop(api);
    }
    // renderScore reloads the MIDI and stops playback; carry on from the same tick.
    const resumeTick = api.playerState === alphaTab.synth.PlayerState.Playing ? api.tickPosition : null;
    // alphaTab's own page padding sits on both sides of the lines.
    const [padX] = api.settings.display.padding.length ? api.settings.display.padding : [0];
    const converted = toAlphaTab(score, { staffMode: viewMode, layoutWidth: Math.max(0, layoutWidth - 2 * padX) }, api.settings);
    const mode = converted.modelLayout ? alphaTab.SystemsLayoutMode.UseModelLayout : alphaTab.SystemsLayoutMode.Automatic;
    if (api.settings.display.systemsLayoutMode !== mode) {
      api.settings.display.systemsLayoutMode = mode;
      api.updateSettings();
    }
    convertedRef.current = converted;
    onConverted(converted);
    api.renderScore(converted.score, score.tracks.map((_, i) => i));
    if (resumeTick !== null) {
      // The MIDI reload finishes after the render and fires playerReady (often more than
      // once), stopping playback each time. Resume shortly after the last of them.
      // (api.midiLoaded would be the natural signal, but subscribing to it recurses
      // forever inside alphaTab 1.8.4.)
      let timer: ReturnType<typeof setTimeout> | null = null;
      const resume = () => {
        off();
        clearTimeout(giveUp);
        if (api.playerState !== alphaTab.synth.PlayerState.Playing) {
          api.tickPosition = resumeTick;
          api.play();
        }
      };
      const off = api.playerReady.on(() => {
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(resume, 50);
      });
      const giveUp = setTimeout(() => {
        off();
        if (timer) {
          clearTimeout(timer);
        }
      }, 2000);
    }
  }, [api, score, viewMode, onConverted, layoutWidth]);

  useEffect(() => {
    if (!api) {
      return;
    }
    return api.postRenderFinished.on(() => setLayoutTick(t => t + 1));
  }, [api]);

  // alphaSynth ignores the sustain pedal controller, so bake the pedal into the notes
  // before the MIDI reaches the player (midiLoad fires after the tick lookup is built).
  const scoreRef = useRef(score);
  scoreRef.current = score;
  useEffect(() => {
    if (!api) {
      return;
    }
    return api.midiLoad.on(midi => {
      const current = scoreRef.current;
      if (api.score && api.tickCache && current.tracks.some(t => t.instrument === 'piano')) {
        sustainNoteOffs(midi, api.score, pedalChanges(current, api.tickCache, midi.tickShift));
      }
    });
  }, [api]);

  // Audition: sound the note that was just entered. This uses the short Web Audio
  // preview tone, not alphaSynth.playNote: an edit re-renders the score and resets the
  // synth, and a playNote still starting then throws inside alphaTab (stop before start).
  useEffect(() => {
    if (!audition || audition.seq === lastAudition.current) {
      return;
    }
    lastAudition.current = audition.seq;
    for (const track of score.tracks) {
      for (const bar of track.bars) {
        const beat = bar.beats.find(b => b.id === audition.beatId);
        const note = beat?.notes.find(n => n.string === audition.string);
        if (beat) {
          if (note) {
            previewPitch(note.pitch);
          }
          return;
        }
      }
    }
  }, [audition, score]);

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
    const cursorBox = beat && track.tuning.length ? cellBox(lookup, converted, beat.id, cursor.string, track.tuning.length) : null;
    const sel = selection
      ? beatsInRange(score, selectionRange(selection))
          .map(r => beatBox(lookup, converted, r.beat.id))
          .filter((b): b is Box => b !== null)
      : [];
    const over: Box[] = [];
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
        }
      });
    }
    setOverlay({ cursor: cursorBox, selection: sel, over, offset });

    // Follow the cursor when it moves off screen (keys, touch buttons). A beat that was
    // just added may not be drawn yet: then this runs again after the next render.
    const key = `${cursor.trackId}:${cursor.barIndex}:${cursor.beatIndex}:${cursor.string}`;
    const target = beat ? beatBox(lookup, converted, beat.id) : null;
    if (key !== followed.current && target) {
      if (followed.current) {
        keepInView(scrollParent(wrap), s.top + target.y, s.top + target.y + target.h);
      }
      followed.current = key;
    }
  }, [api, score, cursor, selection, layoutTick, containerRef]);

  function handleClick(e: React.MouseEvent) {
    const converted = convertedRef.current;
    const surface = containerRef.current?.querySelector<HTMLElement>('.at-surface');
    if (!api || !converted || !surface) {
      return;
    }
    const rect = surface.getBoundingClientRect();
    const hit = cellAt(api.boundsLookup, converted, e.clientX - rect.left, e.clientY - rect.top, ti => Math.max(1, score.tracks[ti].tuning.length));
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
        {overlay.selection.map((b, i) => (
          <div key={`s${i}`} className="selection-box" style={place(b)} />
        ))}
        {overlay.cursor && <div className="cursor-box" style={place(overlay.cursor)} />}
      </div>
    </div>
  );
}
