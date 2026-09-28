import * as alphaTab from '@coderline/alphatab';
import { useEffect, useRef, useState } from 'react';

export interface AlphaTabOptions {
  engine: 'svg' | 'html5';
  enableLazyLoading: boolean;
  useWorkers: boolean;
}

export interface AlphaTabHandle {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /**
   * The live instance, or null before the first one exists. Held in state rather
   * than only in a ref on purpose: changing engine/worker options tears the API
   * down and builds a new one, and callers must re-render their score onto it.
   * A boolean "ready" flag cannot express that, because React batches the
   * false/true pair from one rebuild into a single unchanged value.
   */
  api: alphaTab.AlphaTabApi | null;
  error: string | null;
}

/**
 * Owns the AlphaTabApi lifetime. Settings follow SPEC section 6 and D-007:
 * standard notation and tablature together, tablature being the editable one later.
 * The player stays off here; alphaSynth is a separate W1 checklist item.
 *
 * The engine and worker options cannot be changed on a live instance, so the API
 * is torn down and rebuilt whenever they change. That is fine for a PoC.
 */
export function useAlphaTab(options: AlphaTabOptions): AlphaTabHandle {
  const containerRef = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<alphaTab.AlphaTabApi | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { engine, enableLazyLoading, useWorkers } = options;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const instance = new alphaTab.AlphaTabApi(element, {
      core: {
        // Vite pre-bundles alphaTab into /node_modules/.vite/deps in dev, so the
        // script-relative font path it derives on its own points at a directory
        // that does not exist and the dev server answers with index.html.
        // The alphaTab Vite plugin copies the fonts into publicDir, so point there.
        fontDirectory: '/font/',
        engine,
        enableLazyLoading,
        useWorkers,
      },
      display: {
        staveProfile: alphaTab.StaveProfile.ScoreTab,
        layoutMode: alphaTab.LayoutMode.Page,
      },
      player: {
        playerMode: alphaTab.PlayerMode.Disabled,
      },
    });
    const unsubscribe = instance.error.on(e => setError(e.message));

    setError(null);
    setApi(instance);

    return () => {
      unsubscribe();
      instance.destroy();
      setApi(null);
    };
  }, [engine, enableLazyLoading, useWorkers]);

  return { containerRef, api, error };
}
