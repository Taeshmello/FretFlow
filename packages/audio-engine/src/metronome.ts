import { countInClicks, scheduleClicks } from './clickSchedule';
import type { Click, ClickCursor, MeterProvider } from './clickSchedule';

export interface MetronomeOptions {
  destination?: AudioNode;
  provider?: MeterProvider;
  /** 0..1 */
  volume?: number;
}

/** The scheduler wakes up this often... */
const TICK_MS = 25;
/** ...and schedules every click that falls within this window (lookahead scheduling). */
const SCHEDULE_AHEAD_SECONDS = 0.1;
const CLICK_SECONDS = 0.03;
const ACCENT_HZ = 1600;
const BEAT_HZ = 1000;

/**
 * Oscillator clicks on the AudioContext clock. Timers only decide *when to schedule*;
 * the clicks themselves are placed on the audio clock, so timer jitter is inaudible.
 */
export class Metronome {
  private readonly output: GainNode;
  private provider: MeterProvider;
  private cursor: ClickCursor | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly pending = new Set<OscillatorNode>();

  constructor(
    private readonly context: BaseAudioContext,
    options: MetronomeOptions = {},
  ) {
    this.provider = options.provider ?? (() => ({ bpm: 120, timeSig: [4, 4] }));
    this.output = context.createGain();
    this.output.gain.value = options.volume ?? 0.8;
    this.output.connect(options.destination ?? context.destination);
  }

  get running(): boolean {
    return this.timer !== null;
  }

  get volume(): number {
    return this.output.gain.value;
  }

  set volume(v: number) {
    this.output.gain.value = Math.min(1, Math.max(0, v));
  }

  setProvider(provider: MeterProvider): void {
    this.provider = provider;
  }

  /** Starts clicking at context time `atTime` on beat 1 of `startBar`. */
  start(atTime = this.context.currentTime + 0.05, startBar = 0): void {
    this.stop();
    this.cursor = { bar: startBar, beat: 0, time: atTime };
    this.pump();
    this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.cursor = null;
    for (const osc of this.pending) {
      try {
        osc.stop();
      } catch {
        // Already stopped.
      }
    }
    this.pending.clear();
  }

  /**
   * Plays `bars` bars of clicks in the meter of `startBar`. Resolves with the context time
   * at which the count-in ends (where the music should start).
   */
  countIn(bars = 1, atTime = this.context.currentTime + 0.05, startBar = 0): Promise<number> {
    const { clicks, endTime } = countInClicks(atTime, bars, this.provider, startBar);
    for (const click of clicks) {
      this.playClick(click);
    }
    const waitMs = Math.max(0, (endTime - this.context.currentTime) * 1000);
    return new Promise(resolve => setTimeout(() => resolve(endTime), waitMs));
  }

  dispose(): void {
    this.stop();
    this.output.disconnect();
  }

  private pump(): void {
    if (!this.cursor) {
      return;
    }
    const until = this.context.currentTime + SCHEDULE_AHEAD_SECONDS;
    const result = scheduleClicks(this.cursor, until, this.provider);
    this.cursor = result.cursor;
    for (const click of result.clicks) {
      this.playClick(click);
    }
  }

  private playClick(click: Click): void {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = click.accent ? ACCENT_HZ : BEAT_HZ;
    const peak = click.accent ? 1 : 0.6;
    env.gain.setValueAtTime(peak, click.time);
    env.gain.exponentialRampToValueAtTime(0.001, click.time + CLICK_SECONDS);
    osc.connect(env).connect(this.output);
    osc.onended = () => {
      this.pending.delete(osc);
      env.disconnect();
    };
    this.pending.add(osc);
    osc.start(click.time);
    osc.stop(click.time + CLICK_SECONDS);
  }
}
