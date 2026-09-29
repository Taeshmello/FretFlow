/** Equal temperament, A4 (MIDI 69) = 440 Hz. */
export function midiToHz(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

let ctx: AudioContext | null = null;

/**
 * Plays a short plucked tone for a candidate note without writing it into the score.
 * Independent of alphaSynth so it works before the soundfont has loaded.
 */
export function previewPitch(pitch: number, seconds = 0.7): void {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(3200, t);
    lowpass.frequency.exponentialRampToValueAtTime(700, t + seconds);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midiToHz(pitch);
    osc.connect(lowpass).connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + seconds + 0.05);
  } catch {
    // No audio (e.g. blocked autoplay): the preview is optional.
  }
}
