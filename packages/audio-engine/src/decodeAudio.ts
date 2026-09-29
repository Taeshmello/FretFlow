export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 15 * 60;

export class AudioLoadError extends Error {
  constructor(
    readonly code: 'tooLarge' | 'tooLong' | 'decodeFailed',
    message: string,
  ) {
    super(message);
    this.name = 'AudioLoadError';
  }
}

export interface LoadedAudio {
  duration: number;
  sampleRate: number;
  /** Decoded PCM per channel, for waveform peaks. Not kept by the player. */
  channels: Float32Array[];
}

/** Validates size (≤ 100MB) and decoded length (≤ 15 min) per SPEC §7. */
export async function decodeAudioFile(context: BaseAudioContext, file: Blob): Promise<LoadedAudio> {
  if (file.size > MAX_AUDIO_BYTES) {
    throw new AudioLoadError('tooLarge', `Audio file is larger than ${MAX_AUDIO_BYTES / 1024 / 1024}MB`);
  }
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new AudioLoadError('decodeFailed', 'Audio file could not be decoded');
  }
  if (decoded.duration > MAX_AUDIO_SECONDS) {
    throw new AudioLoadError('tooLong', `Audio is longer than ${MAX_AUDIO_SECONDS / 60} minutes`);
  }
  const channels: Float32Array[] = [];
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    channels.push(decoded.getChannelData(c));
  }
  return { duration: decoded.duration, sampleRate: decoded.sampleRate, channels };
}

/** Safari before 17 only knows the prefixed flag. */
type PitchElement = HTMLAudioElement & { webkitPreservesPitch?: boolean };

/** A pitch-preserving audio element for `url`, resolved once its metadata is loaded. */
export async function createStretchElement(url: string, rate: number): Promise<HTMLAudioElement> {
  const element: PitchElement = new Audio();
  element.preload = 'auto';
  element.preservesPitch = true;
  element.webkitPreservesPitch = true;
  element.playbackRate = rate;
  element.src = url;
  await new Promise<void>((resolve, reject) => {
    element.addEventListener('loadedmetadata', () => resolve(), { once: true });
    element.addEventListener('error', () => reject(new AudioLoadError('decodeFailed', 'Audio element failed to load')), {
      once: true,
    });
  });
  return element;
}
