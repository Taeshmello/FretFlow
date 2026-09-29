import { applyOps, barCapacity, deleteOp, durationToTicks, moveOp, type Id, type Op, type Score } from '@fretflow/score-model';
import { insertBarOps } from './bars';

/**
 * SPEC §5.4 overflow: 'pushToNextBar'. Beats that no longer fit move to the start of
 * the next bar (a bar is added after the last one). Rest beats at the end of the
 * receiving bar are padding, so they give way first; only real content cascades.
 * A single beat longer than its bar stays where it is.
 */
export function pushOverflowOps(score: Score, trackId: Id, fromBar: number): Op[] {
  const ops: Op[] = [];
  let s = score;
  const apply = (more: Op[]) => {
    ops.push(...more);
    s = applyOps(s, more);
  };
  const trackOf = () => s.tracks.find(t => t.id === trackId);
  for (let bi = Math.max(0, fromBar); bi < s.masterBars.length; bi++) {
    const track = trackOf();
    if (!track) {
      break;
    }
    const cap = barCapacity(s.masterBars[bi]);
    const beats = track.bars[bi].beats;
    let used = 0;
    let keep = 0;
    for (const beat of beats) {
      const d = durationToTicks(beat.duration);
      if (keep > 0 && used + d > cap) {
        break;
      }
      used += d;
      keep++;
    }
    const moving = beats.slice(keep);
    if (!moving.length) {
      continue;
    }
    if (bi === s.masterBars.length - 1) {
      apply(insertBarOps(s, s.masterBars.length));
    }
    const target = () => trackOf()!.bars[bi + 1];
    moving.forEach((beat, i) => apply([moveOp(s, beat.id, target().id, i)]));
    // Let padding rests at the end of the receiving bar make room.
    const nextCap = barCapacity(s.masterBars[bi + 1]);
    for (;;) {
      const next = target();
      const total = next.beats.reduce((t, b) => t + durationToTicks(b.duration), 0);
      const last = next.beats[next.beats.length - 1];
      const isPadding = last && last.rest && last.notes.length === 0 && !last.keys?.length && !last.hits?.length && next.beats.length > moving.length;
      if (total <= nextCap || !isPadding) {
        break;
      }
      apply([deleteOp(s, last.id)]);
    }
  }
  return ops;
}
