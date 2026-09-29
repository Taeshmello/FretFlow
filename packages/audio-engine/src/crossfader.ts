import { ListenerSet } from './listeners';

/**
 * Equal-power mix between the original audio and the synth.
 * mix 0 = original audio only, 1 = synth only, 0.5 = both at -3dB.
 */
export function mixGains(mix: number): { audio: number; synth: number } {
  const m = Math.min(1, Math.max(0, mix));
  const angle = (m * Math.PI) / 2;
  // Snap the endpoints so a fully muted side is exactly 0, not cos(π/2) ≈ 6e-17.
  return {
    audio: m === 1 ? 0 : Math.cos(angle),
    synth: m === 0 ? 0 : Math.sin(angle),
  };
}

/** Time constant for gain changes, short enough to feel instant but free of zipper noise. */
const SMOOTHING_SECONDS = 0.015;

/**
 * Applies the mix to the original audio's GainNode. alphaSynth renders through its own
 * output, not our AudioContext graph, so the synth side is exposed as a plain number that
 * the app applies to alphaTab's `masterVolume` via `onSynthGain`.
 */
export class Crossfader {
  readonly audioGain: GainNode;
  private mix = 0;
  private readonly synthListeners = new ListenerSet<[gain: number]>();

  constructor(
    private readonly context: BaseAudioContext,
    destination: AudioNode = context.destination,
  ) {
    this.audioGain = context.createGain();
    this.audioGain.connect(destination);
  }

  /** Connect the original audio player's output here. */
  get input(): AudioNode {
    return this.audioGain;
  }

  get value(): number {
    return this.mix;
  }

  get synthGain(): number {
    return mixGains(this.mix).synth;
  }

  setMix(mix: number): void {
    this.mix = Math.min(1, Math.max(0, mix));
    const gains = mixGains(this.mix);
    this.audioGain.gain.setTargetAtTime(gains.audio, this.context.currentTime, SMOOTHING_SECONDS);
    this.synthListeners.emit(gains.synth);
  }

  /** Called with the synth gain on every `setMix`. Returns an unsubscribe function. */
  onSynthGain(listener: (gain: number) => void): () => void {
    return this.synthListeners.add(listener);
  }

  dispose(): void {
    this.synthListeners.clear();
    this.audioGain.disconnect();
  }
}
