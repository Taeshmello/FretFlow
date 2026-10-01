import { useEffect, useRef } from 'react';
import { clampSpeed, speedRange } from '../app/plan';
import { usePlan } from '../app/session';

interface Targets {
  /** Current speed (the recording's when one is loaded, else the synth's). */
  speed: number;
  setRecordingRate: (rate: number) => void;
  setRecordingRange: (range: [number, number]) => void;
  setSynthSpeed: (speed: number) => void;
}

/**
 * Speed for the recording and the synth together, kept inside the plan's range
 * (free normal playback only, Pro 25–150%). A plan change pulls the speed back in.
 */
export function useSpeed(t: Targets): (speed: number) => void {
  const plan = usePlan();
  const latest = useRef(t);
  latest.current = t;

  const set = (speed: number) => {
    const s = clampSpeed(plan, speed);
    latest.current.setRecordingRate(s);
    latest.current.setSynthSpeed(s);
  };

  useEffect(() => {
    const { speed, setRecordingRange } = latest.current;
    setRecordingRange(speedRange(plan));
    const s = clampSpeed(plan, speed);
    if (s !== speed) {
      latest.current.setRecordingRate(s);
      latest.current.setSynthSpeed(s);
    }
  }, [plan]);

  return set;
}
