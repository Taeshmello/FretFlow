import { useSyncExternalStore } from 'react';
import type { Plan } from './plan';
import type { Me } from './SignInDialog';

/** The signed-in account, shared by every Account button and by plan-gated controls. */
let current: Me | null = null;
const listeners = new Set<() => void>();

export const session = {
  get: () => current,
  set(me: Me | null) {
    current = me;
    listeners.forEach(l => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useMe(): Me | null {
  return useSyncExternalStore(session.subscribe, session.get);
}

/** Free until the server says otherwise (signed out, offline or local mode). */
export function usePlan(): Plan {
  return useMe()?.plan ?? 'free';
}
