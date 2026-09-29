import type * as alphaTab from '@coderline/alphatab';

/**
 * alphaTab's clearPlaybackRangeHighlight only hides the markers; it retains
 * the selected Beat objects and re-highlights them after the next render.
 * Apply a single-beat selection first so those stale objects are released.
 */
export function clearPlaybackLoop(api: alphaTab.AlphaTabApi) {
  const firstBeat = api.score?.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0];
  if (firstBeat) {
    api.highlightPlaybackRange(firstBeat, firstBeat);
    api.applyPlaybackRangeFromHighlight();
  }
  api.clearPlaybackRangeHighlight();
  api.playbackRange = null;
  api.isLooping = false;
}
