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
      ctx.fillStyle = 'rgba(214, 160, 60, 0.26)';
      ctx.fillRect(x(loop.start), 0, x(loop.end) - x(loop.start), HEIGHT);
      ctx.fillStyle = '#c08a2e';
      ctx.fillRect(x(loop.start) - 1, 0, 3, HEIGHT);
      ctx.fillRect(x(loop.end) - 1, 0, 3, HEIGHT);
    }
    // Fine level when there are more pixels than coarse peaks.
    const level = peaks.coarse.max.length >= width ? peaks.coarse : peaks.fine;
    const n = level.max.length;
    const mid = HEIGHT / 2;
    const inLoop = (px: number) => !!loop && px >= x(loop.start) && px <= x(loop.end);
    for (let px = 0; px < width; px++) {
      ctx.fillStyle = inLoop(px) ? '#c08a2e' : '#9a9c95';
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
    // Bar lines with bar numbers; label density follows the zoom.
    const gap = barLines.length > 1 ? x(barLines[1].seconds) - x(barLines[0].seconds) : width;
    const every = gap >= 36 ? 1 : gap >= 12 ? 4 : 8;
    ctx.font = '11px "JetBrains Mono Variable", ui-monospace, monospace';
    for (const line of barLines) {
      const lx = x(line.seconds);
      if (lx < 0 || lx > width) {
        continue;
      }
      ctx.fillStyle = 'rgba(28, 29, 26, 0.18)';
      ctx.fillRect(lx, 0, 1, HEIGHT);
      if (line.bar % every === 0) {
        ctx.fillStyle = '#6e706a';
        ctx.fillText(String(line.bar + 1), lx + 4, 12);
      }
    }
    // Playhead: blue line with a small triangle on top.
    const px = x(time);
    ctx.fillStyle = '#3a57d6';
    ctx.fillRect(px - 1, 0, 2, HEIGHT);
    ctx.beginPath();
    ctx.moveTo(px - 6, 0);
    ctx.lineTo(px + 6, 0);
    ctx.lineTo(px, 8);
    ctx.fill();
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
