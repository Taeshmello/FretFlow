/** Min/max envelope of an audio file, merged across channels. */
export interface PeakData {
  samplesPerPeak: number;
  min: Float32Array;
  max: Float32Array;
}

/** The two waveform resolutions SPEC §7 asks for: zoomed in and overview. */
export interface PeakLevels {
  sampleRate: number;
  fine: PeakData;
  coarse: PeakData;
}

export const FINE_PEAKS_PER_SECOND = 100;
/** Coarse level merges this many fine peaks (≈10 peaks/s). */
export const COARSE_FACTOR = 10;

export function computePeaks(channels: readonly Float32Array[], samplesPerPeak: number): PeakData {
  const spp = Math.max(1, Math.floor(samplesPerPeak));
  const length = channels.reduce((n, c) => Math.max(n, c.length), 0);
  const count = Math.ceil(length / spp);
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    const from = p * spp;
    const to = Math.min(from + spp, length);
    let lo = Infinity;
    let hi = -Infinity;
    for (const data of channels) {
      const end = Math.min(to, data.length);
      for (let i = from; i < end; i++) {
        const v = data[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[p] = lo === Infinity ? 0 : lo;
    max[p] = hi === -Infinity ? 0 : hi;
  }
  return { samplesPerPeak: spp, min, max };
}

/** Coarser level from an existing one without touching the samples again. */
export function mergePeaks(peaks: PeakData, factor: number): PeakData {
  const f = Math.max(1, Math.floor(factor));
  const count = Math.ceil(peaks.min.length / f);
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    let lo = Infinity;
    let hi = -Infinity;
    const end = Math.min((p + 1) * f, peaks.min.length);
    for (let i = p * f; i < end; i++) {
      if (peaks.min[i] < lo) lo = peaks.min[i];
      if (peaks.max[i] > hi) hi = peaks.max[i];
    }
    min[p] = lo;
    max[p] = hi;
  }
  return { samplesPerPeak: peaks.samplesPerPeak * f, min, max };
}

export function computePeakLevels(channels: readonly Float32Array[], sampleRate: number): PeakLevels {
  const fine = computePeaks(channels, Math.round(sampleRate / FINE_PEAKS_PER_SECOND));
  return { sampleRate, fine, coarse: mergePeaks(fine, COARSE_FACTOR) };
}

export interface PeakRequest {
  channels: Float32Array[];
  sampleRate: number;
}

export type PeakResponse = { ok: true; levels: PeakLevels } | { ok: false; error: string };

export interface RequestPeaksOptions {
  /**
   * Transfer the channel buffers to the worker instead of copying them. The caller's arrays
   * become unusable afterwards; only pass true when the samples are no longer needed.
   */
  transfer?: boolean;
}

/** Computes peaks in a module worker (SPEC §7), or synchronously where Worker is unavailable. */
export function requestPeaks(
  channels: Float32Array[],
  sampleRate: number,
  options: RequestPeaksOptions = {},
): Promise<PeakLevels> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(computePeakLevels(channels, sampleRate));
  }
  let worker: Worker;
  try {
    worker = new Worker(new URL('./peaks.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve(computePeakLevels(channels, sampleRate));
  }
  return new Promise<PeakLevels>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<PeakResponse>) => {
      worker.terminate();
      if (e.data.ok) {
        resolve(e.data.levels);
      } else {
        reject(new Error(e.data.error));
      }
    };
    worker.onerror = e => {
      worker.terminate();
      reject(new Error(e.message || 'peaks worker failed'));
    };
    const request: PeakRequest = { channels, sampleRate };
    const transfer = options.transfer ? channels.map(c => c.buffer as ArrayBuffer) : [];
    worker.postMessage(request, transfer);
  });
}
