import { useEffect, useRef, useState } from 'react';
import { usePlan } from '../app/session';
import { canUseSpeedTrainer } from '../app/plan';
import { advanceTrainer, beginTrainer, DEFAULT_TRAINER, type TrainerConfig, type TrainerState } from './speedTrainer';

interface Inputs {
  enabled: boolean;
  looping: boolean;
  loopKey: string;
  loopCount: number;
  setSpeed: (rate: number) => void;
}

/** Coordinates loop-completion events with speed changes; the Pro plan comes from /api/me. */
export function useSpeedTrainer({ enabled, looping, loopKey, loopCount, setSpeed }: Inputs) {
  const plan = usePlan();
  const [config, setConfig] = useState<TrainerConfig>(DEFAULT_TRAINER);
  const [state, setState] = useState<TrainerState | null>(null);
  const lastCount = useRef(loopCount);
  const latest = useRef({ config, setSpeed });
  latest.current = { config, setSpeed };

  useEffect(() => {
    const cycles = loopCount - lastCount.current;
    lastCount.current = loopCount;
    if (cycles > 0 && enabled && looping && canUseSpeedTrainer(plan)) {
      setState(previous => previous ? advanceTrainer(previous, latest.current.config, cycles) : null);
    }
  }, [loopCount, enabled, looping, plan]);

  useEffect(() => {
    if (state) latest.current.setSpeed(state.currentPercent / 100);
  }, [state?.currentPercent]);

  useEffect(() => {
    setState(null);
  }, [loopKey]);

  useEffect(() => {
    if (!enabled || !looping || !canUseSpeedTrainer(plan)) setState(null);
  }, [enabled, looping, plan]);

  return {
    plan,
    config,
    state,
    setConfig,
    start() {
      if (!enabled || !looping || !canUseSpeedTrainer(plan)) return;
      lastCount.current = loopCount;
      setState(beginTrainer(config));
    },
    stop() { setState(null); },
    onUserSpeed(rate: number) {
      setState(null);
      latest.current.setSpeed(rate);
    },
  };
}

export type SpeedTrainer = ReturnType<typeof useSpeedTrainer>;
