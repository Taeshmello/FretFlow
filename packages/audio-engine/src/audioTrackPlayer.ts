import { ListenerSet } from './listeners';
import { normalizeLoop, shouldWrap } from './loop';
import type { LoopRegion } from './loop';
import { createStretchElement, decodeAudioFile } from './decodeAudio';
import type { LoadedAudio } from './decodeAudio';

/*
 * Time-stretch decision (D-006 is still open): instead of a WASM engine (SoundTouch is LGPL,
 * Rubber Band is GPL/commercial) we use the browser's own pitch-preserving playback,
 * `HTMLAudioElement.preservesPitch` with `playbackRate`. It carries zero license risk, needs
 * no listening test to ship, and works in Chrome and Safari. The element is routed through
 * `createMediaElementSource` → GainNode so loop boundaries get a short gain crossfade
 * (fade out before B, seek to A, fade in). If the built-in stretcher sounds too poor at
 * 50%, a WASM engine can replace the element behind this same class API.
 */

/** Default slowest rate (free plan). */
export const MIN_RATE = 0.5;
/** Hard floor and ceiling of the API; the per-player range (default 0.5–1.0) sits inside them. */
export const RATE_FLOOR = 0.25;
export const RATE_CEILING = 1.5;

/** `value` inside `range`, which itself never leaves [RATE_FLOOR, RATE_CEILING]. */
export function clampRate(value: number, [min, max]: readonly [number, number]): number {
  const lo = Math.max(RATE_FLOOR, min);
  const hi = Math.min(RATE_CEILING, max);
  return Math.min(hi, Math.max(lo, value));
}

export type PlayerState = 'empty' | 'loading' | 'paused' | 'playing';

export interface AudioTrackPlayerOptions {
  /** Where the player's gain goes, e.g. `Crossfader.input`. Defaults to the destination. */
  destination?: AudioNode;
  /** Allowed playback rates. Default [MIN_RATE, 1] (the free plan); Pro widens it with setRateRange. */
  rateRange?: [number, number];
  /** Fade length on each side of a loop jump. */
  crossfadeMs?: number;
}

/** Longest wait for `seeked` before fading back in anyway. */
const SEEK_TIMEOUT_MS = 150;
/** One animation frame of slack when deciding to start the loop fade. */
const FRAME_SECONDS = 0.02;

export class AudioTrackPlayer {
  private readonly gain: GainNode;
  private rateRange: [number, number];
  private readonly fadeSeconds: number;
  private element: HTMLAudioElement | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private objectUrl: string | null = null;
  private loop: LoopRegion | null = null;
  private wrapping = false;
  private raf: number | null = null;
  private currentState: PlayerState = 'empty';
  private playbackRate = 1;
  private gainValue = 1;
  private readonly timeListeners = new ListenerSet<[seconds: number]>();
  private readonly loopListeners = new ListenerSet<[]>();
  private readonly endedListeners = new ListenerSet<[]>();
  private readonly stateListeners = new ListenerSet<[state: PlayerState]>();

  constructor(
    private readonly context: AudioContext,
    options: AudioTrackPlayerOptions = {},
  ) {
    this.gain = context.createGain();
    this.gain.connect(options.destination ?? context.destination);
    this.rateRange = options.rateRange ?? [MIN_RATE, 1];
    this.fadeSeconds = (options.crossfadeMs ?? 10) / 1000;
  }

  get state(): PlayerState {
    return this.currentState;
  }

  get duration(): number {
    const d = this.element?.duration;
    return d !== undefined && Number.isFinite(d) ? d : 0;
  }

  get currentTime(): number {
    return this.element?.currentTime ?? 0;
  }

  get rate(): number {
    return this.playbackRate;
  }

  /** Clamped to the rate range. Pitch is preserved. */
  set rate(value: number) {
    this.playbackRate = clampRate(value, this.rateRange);
    if (this.element) {
      this.element.playbackRate = this.playbackRate;
    }
  }

  /** Changes the allowed rates (plan change); the current rate is pulled inside. */
  setRateRange(range: [number, number]): void {
    this.rateRange = range;
    this.rate = this.playbackRate;
  }

  get volume(): number {
    return this.gainValue;
  }

  /** 0..1. Tracked separately because the gain param may be mid-ramp during a loop jump. */
  set volume(value: number) {
    this.gainValue = Math.min(1, Math.max(0, value));
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gainValue, now);
  }

  get loopRegion(): LoopRegion | null {
    return this.loop;
  }

  /**
   * Validates size (≤ 100MB) and decoded length (≤ 15 min), then prepares playback.
   * Returns the decoded channels so the caller can compute peaks (`requestPeaks`).
   */
  async load(file: Blob): Promise<LoadedAudio> {
    this.unload();
    this.setState('loading');
    let loaded: LoadedAudio;
    try {
      loaded = await decodeAudioFile(this.context, file);
    } catch (err) {
      this.setState('empty');
      throw err;
    }

    this.objectUrl = URL.createObjectURL(file);
    let element: HTMLAudioElement;
    try {
      element = await createStretchElement(this.objectUrl, this.playbackRate);
    } catch (err) {
      this.unload();
      throw err;
    }
    element.addEventListener('ended', this.handleEnded);
    // A media element can only ever feed one source node, so a new element per file.
    this.source = this.context.createMediaElementSource(element);
    this.source.connect(this.gain);
    this.element = element;
    this.setState('paused');
    return loaded;
  }

  /** Must be called from a user gesture the first time (Safari keeps the context suspended). */
  async play(): Promise<void> {
    if (!this.element) {
      return;
    }
    if (this.context.state !== 'running') {
      await this.context.resume();
    }
    if (this.loop && (this.element.currentTime < this.loop.start || this.element.currentTime >= this.loop.end)) {
      this.element.currentTime = this.loop.start;
    }
    await this.element.play();
    this.setState('playing');
    this.startTicker();
  }

  pause(): void {
    if (!this.element) {
      return;
    }
    this.element.pause();
    this.stopTicker();
    this.emitTime();
    this.setState('paused');
  }

  seek(seconds: number): void {
    if (!this.element) {
      return;
    }
    this.element.currentTime = Math.min(Math.max(0, seconds), this.duration);
    this.emitTime();
  }

  /** null clears the loop. Invalid or too-short regions also clear it. */
  setLoop(region: LoopRegion | null): void {
    this.loop = region ? normalizeLoop(region, this.duration || undefined) : null;
  }

  onTime(listener: (seconds: number) => void): () => void {
    return this.timeListeners.add(listener);
  }

  /** Fires once after an actual A–B loop wrap, never for a user seek. */
  onLoop(listener: () => void): () => void {
    return this.loopListeners.add(listener);
  }

  onEnded(listener: () => void): () => void {
    return this.endedListeners.add(listener);
  }

  onState(listener: (state: PlayerState) => void): () => void {
    return this.stateListeners.add(listener);
  }

  dispose(): void {
    this.unload();
    this.gain.disconnect();
    this.timeListeners.clear();
    this.loopListeners.clear();
    this.endedListeners.clear();
    this.stateListeners.clear();
  }

  private unload(): void {
    this.stopTicker();
    if (this.element) {
      this.element.pause();
      this.element.removeEventListener('ended', this.handleEnded);
      this.element.removeAttribute('src');
      this.element.load();
      this.element = null;
    }
    this.source?.disconnect();
    this.source = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.loop = null;
    this.wrapping = false;
    this.setState('empty');
  }

  private readonly handleEnded = (): void => {
    // A loop that ends at the very end of the file can reach `ended` before the fade starts.
    if (this.loop && this.element) {
      if (this.wrapping) return;
      this.element.currentTime = this.loop.start;
      void this.element.play();
      this.loopListeners.emit();
      return;
    }
    this.stopTicker();
    this.setState('paused');
    this.endedListeners.emit();
  };

  private startTicker(): void {
    this.stopTicker();
    const step = () => {
      this.tick();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private stopTicker(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  private tick(): void {
    this.emitTime();
    const el = this.element;
    if (!el || !this.loop || this.wrapping || el.paused) {
      return;
    }
    // Lookahead is in media seconds: at 50% speed, one real second covers half a media second.
    const lookahead = (this.fadeSeconds + FRAME_SECONDS) * this.playbackRate;
    if (shouldWrap(el.currentTime, this.loop, lookahead)) {
      void this.wrapToLoopStart(el, this.loop);
    }
  }

  private async wrapToLoopStart(el: HTMLAudioElement, loop: LoopRegion): Promise<void> {
    this.wrapping = true;
    const g = this.gain.gain;
    const now = this.context.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(this.gainValue, now);
    g.linearRampToValueAtTime(0, now + this.fadeSeconds);
    await delay(this.fadeSeconds * 1000);
    if (this.element !== el) {
      return;
    }
    el.currentTime = loop.start;
    this.loopListeners.emit();
    await Promise.race([
      new Promise<void>(resolve => el.addEventListener('seeked', () => resolve(), { once: true })),
      delay(SEEK_TIMEOUT_MS),
    ]);
    const t = this.context.currentTime;
    if (el.paused && this.currentState === 'playing') void el.play();
    g.cancelScheduledValues(t);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(this.gainValue, t + this.fadeSeconds);
    this.wrapping = false;
  }

  private emitTime(): void {
    this.timeListeners.emit(this.currentTime);
  }

  private setState(state: PlayerState): void {
    if (state === this.currentState) {
      return;
    }
    this.currentState = state;
    this.stateListeners.emit(state);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
