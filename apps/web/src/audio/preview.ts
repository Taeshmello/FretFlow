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
