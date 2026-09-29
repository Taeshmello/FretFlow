import type { LoopRegion, PeakLevels } from '@fretflow/audio-engine';
import { useEffect, useRef } from 'react';

interface Props {
  peaks: PeakLevels | null;
  duration: number;
  time: number;
  loop: LoopRegion | null;
  /** Bar lines in seconds, with the bar index for labels. */
  barLines: { seconds: number; bar: number; anchored: boolean }[];
  onSeek: (seconds: number) => void;
  onLoop: (loop: LoopRegion | null) => void;
  /** Dragging a bar line pins that bar to a new time (adds a sync anchor). */
  onMoveBarLine: (bar: number, seconds: number) => void;
}

const HEIGHT = 96;
const GRAB_PX = 5;

export function Waveform({ peaks, duration, time, loop, barLines, onSeek, onLoop, onMoveBarLine }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ kind: 'loop' | 'bar'; startX: number; bar?: number; moved: boolean } | null>(null);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const width = c.clientWidth;
    c.width = width * dpr;
    c.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);
    if (!peaks || duration <= 0) {
      return;
    }
    const x = (s: number) => (s / duration) * width;
    if (loop) {
      ctx.fillStyle = 'rgba(232, 102, 61, 0.16)';
      ctx.fillRect(x(loop.start), 0, x(loop.end) - x(loop.start), HEIGHT);
    }
    // Fine level when there are more pixels than coarse peaks.
    const level = peaks.coarse.max.length >= width ? peaks.coarse : peaks.fine;
    const n = level.max.length;
    const mid = HEIGHT / 2;
    ctx.fillStyle = '#8a8d85';
    for (let px = 0; px < width; px++) {
      const from = Math.floor((px / width) * n);
      const to = Math.max(from + 1, Math.floor(((px + 1) / width) * n));
      let lo = 0;
      let hi = 0;
      for (let i = from; i < to && i < n; i++) {
        lo = Math.min(lo, level.min[i]);
        hi = Math.max(hi, level.max[i]);
      }
      ctx.fillRect(px, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid));
    }
    for (const line of barLines) {
      const lx = x(line.seconds);
      if (lx < 0 || lx > width) {
        continue;
      }
      ctx.fillStyle = line.anchored ? '#4078d2' : 'rgba(64, 120, 210, 0.35)';
      ctx.fillRect(lx, 0, line.anchored ? 2 : 1, HEIGHT);
      if (line.bar % 4 === 0 || line.anchored) {
        ctx.font = '10px system-ui';
        ctx.fillText(String(line.bar + 1), lx + 3, 10);
      }
    }
    ctx.fillStyle = '#e8663d';
    ctx.fillRect(x(time), 0, 2, HEIGHT);
  }, [peaks, duration, time, loop, barLines]);

  const secondsAt = (clientX: number) => {
    const c = canvas.current;
    if (!c) {
      return 0;
    }
    const r = c.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration));
  };

  function onDown(e: React.PointerEvent) {
    const c = canvas.current;
    if (!c || duration <= 0) {
      return;
    }
    c.setPointerCapture(e.pointerId);
    const r = c.getBoundingClientRect();
    const px = e.clientX - r.left;
    const hit = barLines.find(l => Math.abs((l.seconds / duration) * r.width - px) <= GRAB_PX);
    drag.current = hit && e.altKey === false && e.shiftKey ? { kind: 'bar', startX: e.clientX, bar: hit.bar, moved: false } : { kind: 'loop', startX: e.clientX, moved: false };
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || Math.abs(e.clientX - d.startX) < 4) {
      return;
    }
    d.moved = true;
    if (d.kind === 'bar' && d.bar !== undefined) {
      onMoveBarLine(d.bar, secondsAt(e.clientX));
    } else {
      const a = secondsAt(d.startX);
      const b = secondsAt(e.clientX);
      onLoop({ start: Math.min(a, b), end: Math.max(a, b) });
    }
  }

  function onUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      onSeek(secondsAt(e.clientX));
    }
  }

  return (
    <canvas
      ref={canvas}
      className="waveform"
      style={{ height: HEIGHT }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onDoubleClick={() => onLoop(null)}
      aria-label="Waveform: click to seek, drag to set an A-B loop, Shift+drag a bar line to align it, double-click to clear the loop"
    />
  );
}
