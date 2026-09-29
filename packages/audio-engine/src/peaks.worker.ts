import { computePeakLevels } from './peaks';
import type { PeakRequest, PeakResponse } from './peaks';

/**
 * The package compiles against the DOM lib, where `self` is a Window. This is the only
 * place that needs the dedicated worker scope, so a minimal shape is declared here.
 */
interface PeaksWorkerScope {
  onmessage: ((e: MessageEvent<PeakRequest>) => void) | null;
  postMessage(message: PeakResponse, transfer: Transferable[]): void;
}

const scope = self as unknown as PeaksWorkerScope;

scope.onmessage = e => {
  try {
    const levels = computePeakLevels(e.data.channels, e.data.sampleRate);
    const buffers = [levels.fine.min, levels.fine.max, levels.coarse.min, levels.coarse.max].map(
      a => a.buffer as ArrayBuffer,
    );
    scope.postMessage({ ok: true, levels }, buffers);
  } catch (err) {
    scope.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) }, []);
  }
};
