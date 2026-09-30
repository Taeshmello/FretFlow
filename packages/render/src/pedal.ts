import * as alphaTab from '@coderline/alphatab';
import { barCapacity, durationToTicks, type Beat, type MasterBar, type Score } from '@fretflow/score-model';

const at = alphaTab.model;

/**
 * Piano pedal marks go under the bass staff, placed by where the beat starts in the
 * bar. `down` is whether the pedal is held coming into the bar; returns it for the next.
 */
export function addPedalMarkers(target: alphaTab.model.Bar, beats: Beat[], mb: MasterBar | undefined, down: boolean, made: PedalMarkers): boolean {
  const capacity = mb ? barCapacity(mb) : 0;
  let offset = 0;
  for (const beat of beats) {
    const ratio = capacity ? Math.min(offset / capacity, 1) : 0;
    if (beat.pedal && down) {
      target.sustainPedals.push(pedalMarker(ratio, at.SustainPedalMarkerType.Up, made));
      down = false;
    }
    if (beat.pedal === 'down') {
      target.sustainPedals.push(pedalMarker(ratio, at.SustainPedalMarkerType.Down, made));
      down = true;
    }
    offset += durationToTicks(beat.duration);
  }
  return down;
}

/** Markers we made, with the type we meant (see toAlphaTab). */
export type PedalMarkers = [alphaTab.model.SustainPedalMarker, alphaTab.model.SustainPedalMarkerType][];

function pedalMarker(ratio: number, type: alphaTab.model.SustainPedalMarkerType, made: PedalMarkers): alphaTab.model.SustainPedalMarker {
  const m = new at.SustainPedalMarker();
  m.ratioPosition = ratio;
  m.pedalType = type;
  made.push([m, type]);
  return m;
}

/** Sustain pedal marks (any staff) → the beat they fall in. A re-pedal (up + down) stays 'down'. */
export function importPedals(t: alphaTab.model.Track, i: number, top: alphaTab.model.Beat[], beats: Beat[]): void {
  const markers = t.staves.flatMap(st => st.bars[i]?.sustainPedals ?? []);
  if (!markers.length) {
    return;
  }
  const length = t.score.masterBars[i]?.calculateDuration() ?? 0;
  const P = alphaTab.model.SustainPedalMarkerType;
  for (const m of markers) {
    if (m.pedalType === P.Hold) {
      continue;
    }
    const tick = m.ratioPosition * length;
    let index = top.findIndex(b => tick < b.playbackStart + b.playbackDuration);
    if (index < 0) {
      index = beats.length - 1;
    }
    const beat = beats[index];
    if (m.pedalType === P.Down) {
      beat.pedal = 'down';
    } else if (beat.pedal === undefined) {
      beat.pedal = 'up';
    }
  }
}

/** One press or release of a piano track's sustain pedal, in MIDI ticks. */
export interface PedalChange {
  trackIndex: number;
  tick: number;
  down: boolean;
}

/**
 * Pedal presses and releases in playback order. Repeats are unrolled through the
 * generator's tick lookup, so a pedal inside a repeated bar sounds on every pass.
 * 'down' while the pedal is already down re-pedals (release, then press again).
 */
export function pedalChanges(score: Score, lookup: alphaTab.midi.MidiTickLookup, tickShift = 0): PedalChange[] {
  const out: PedalChange[] = [];
  score.tracks.forEach((track, trackIndex) => {
    if (track.instrument !== 'piano') {
      return;
    }
    let down = false;
    let end = 0;
    for (const pass of lookup.masterBars) {
      const bar = track.bars[pass.masterBar.index];
      let offset = 0;
      for (const beat of bar?.beats ?? []) {
        const tick = pass.start + offset + tickShift;
        if (beat.pedal && down) {
          out.push({ trackIndex, tick, down: false });
          down = false;
        }
        if (beat.pedal === 'down') {
          out.push({ trackIndex, tick, down: true });
          down = true;
        }
        offset += durationToTicks(beat.duration);
      }
      end = Math.max(end, pass.end + tickShift);
    }
    if (down) {
      out.push({ trackIndex, tick: end, down: false });
    }
  });
  return out;
}

function channelsOf(model: alphaTab.model.Score, trackIndex: number): number[] {
  const info = model.tracks[trackIndex]?.playbackInfo;
  return info ? [...new Set([info.primaryChannel, info.secondaryChannel])] : [];
}

/** Standard MIDI files: write the pedal as controller 64 so other players honour it. */
export function addPedalControllers(midi: alphaTab.midi.MidiFile, model: alphaTab.model.Score, changes: PedalChange[]): void {
  for (const c of changes) {
    for (const channel of channelsOf(model, c.trackIndex)) {
      midi.addEvent(new alphaTab.midi.ControlChangeEvent(c.trackIndex, c.tick, channel, alphaTab.midi.ControllerType.HoldPedal, c.down ? 127 : 0));
    }
  }
}

/**
 * alphaSynth ignores controller 64, so for in-app playback the pedal is baked into
 * the notes: a key released while the pedal is down keeps sounding until the pedal
 * comes up, or until the same key is struck again.
 */
export function sustainNoteOffs(midi: alphaTab.midi.MidiFile, model: alphaTab.model.Score, changes: PedalChange[]): void {
  const held = new Map<number, [start: number, end: number][]>();
  const open = new Map<number, number>();
  for (const c of changes) {
    for (const channel of channelsOf(model, c.trackIndex)) {
      if (c.down) {
        open.set(channel, c.tick);
      } else if (open.has(channel)) {
        const spans = held.get(channel) ?? [];
        spans.push([open.get(channel)!, c.tick]);
        held.set(channel, spans);
        open.delete(channel);
      }
    }
  }
  if (!held.size) {
    return;
  }
  for (const track of midi.tracks) {
    const events = track.events;
    let moved = false;
    events.forEach((e, i) => {
      if (!(e instanceof alphaTab.midi.NoteOffEvent)) {
        return;
      }
      const span = held.get(e.channel)?.find(([start, end]) => e.tick > start && e.tick < end);
      if (!span) {
        return;
      }
      let until = span[1];
      for (let j = i + 1; j < events.length && events[j].tick < until; j++) {
        const next = events[j];
        if (next instanceof alphaTab.midi.NoteOnEvent && next.channel === e.channel && next.noteKey === e.noteKey) {
          until = next.tick;
          break;
        }
      }
      if (until > e.tick) {
        e.tick = until;
        moved = true;
      }
    });
    if (moved) {
      // Stable sort; at equal ticks a note-off goes first so a re-struck key starts cleanly.
      const order = (e: alphaTab.midi.MidiEvent) => (e instanceof alphaTab.midi.NoteOffEvent ? 0 : 1);
      events.sort((a, b) => a.tick - b.tick || order(a) - order(b));
    }
  }
}
