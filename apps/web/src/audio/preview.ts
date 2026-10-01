/** Equal temperament, A4 (MIDI 69) = 440 Hz. */
export function midiToHz(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

let ctx: AudioContext | null = null;

/**
 * Lightweight note preview while alphaSynth reloads the edited score. A few
 * decaying sine partials avoid the harsh sawtooth used by the old preview.
 */
export function previewPitch(pitch: number, instrument: 'guitar' | 'bass' | 'piano' = 'guitar'): void {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const t = ctx.currentTime;
    const duration = instrument === 'piano' ? 1.1 : instrument === 'bass' ? 0.85 : 0.75;
    const partials = instrument === 'piano' ? [0.75, 0.28, 0.12, 0.05]
      : instrument === 'bass' ? [0.85, 0.17, 0.06] : [0.8, 0.24, 0.1, 0.035];
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(0.18, t + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    envelope.connect(ctx.destination);
    const fundamental = midiToHz(pitch);
    partials.forEach((level, i) => {
      const tone = ctx!.createOscillator();
      const harmonicGain = ctx!.createGain();
      tone.type = 'sine';
      tone.frequency.value = fundamental * (i + 1);
      harmonicGain.gain.value = level;
      tone.connect(harmonicGain).connect(envelope);
      tone.start(t);
      tone.stop(t + duration + 0.02);
    });
  } catch {
    // No audio (e.g. blocked autoplay): the preview is optional.
  }
}

type DrumSound = 'kick' | 'tom' | 'snare' | 'cymbal';

function soundOf(piece: string): DrumSound {
  if (piece === 'kick') {
    return 'kick';
  }
  if (piece.startsWith('tom')) {
    return 'tom';
  }
  if (piece === 'snare' || piece === 'sideStick') {
    return 'snare';
  }
  return 'cymbal';
}

/** A short synthesized drum stroke so a pad can be heard before it is written. */
export function previewDrum(piece: string): void {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const c = ctx;
    const t = c.currentTime;
    const sound = soundOf(piece);
    const out = c.createGain();
    out.connect(c.destination);
    if (sound === 'kick' || sound === 'tom') {
      const osc = c.createOscillator();
      const start = sound === 'kick' ? 140 : piece === 'tomHigh' ? 260 : piece === 'tomMid' ? 200 : 150;
      osc.frequency.setValueAtTime(start, t);
      osc.frequency.exponentialRampToValueAtTime(start / 3, t + 0.25);
      out.gain.setValueAtTime(0.6, t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(out);
      osc.start(t);
      osc.stop(t + 0.4);
      return;
    }
    // Snare and cymbals: filtered noise, longer and brighter for cymbals.
    const length = sound === 'snare' ? 0.18 : piece === 'crash' ? 0.9 : piece === 'hihatOpen' ? 0.45 : 0.08;
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = sound === 'snare' ? 'bandpass' : 'highpass';
    filter.frequency.value = sound === 'snare' ? 1800 : 7000;
    out.gain.setValueAtTime(sound === 'snare' ? 0.5 : 0.25, t);
    out.gain.exponentialRampToValueAtTime(0.0001, t + length);
    noise.connect(filter).connect(out);
    noise.start(t);
  } catch {
    // Audio unavailable: the preview is optional.
  }
}
