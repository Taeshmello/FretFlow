import * as alphaTab from '@coderline/alphatab';
import { useEffect, useRef, useState } from 'react';

export type ViewMode = 'scoreTab' | 'tab';

/**
 * Owns the AlphaTabApi. Settings follow D-015: workers off (their round trip
 * cost more than the render), lazy loading on, note bounds on for the cursor.
 */
export function useAlphaTab(scrollElement: React.RefObject<HTMLElement | null>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<alphaTab.AlphaTabApi | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const instance = new alphaTab.AlphaTabApi(element, {
      core: {
        // Vite pre-bundles alphaTab, so its own font path detection points at
        // .vite/deps. The alphaTab Vite plugin copies fonts to /font/.
        fontDirectory: '/font/',
        includeNoteBounds: true,
        engine: 'svg',
        enableLazyLoading: true,
        useWorkers: false,
      },
      display: {
        staveProfile: alphaTab.StaveProfile.ScoreTab,
        layoutMode: alphaTab.LayoutMode.Page,
        scale: 1,
      },
      notation: {
        // Keep the tab readable while notes are being typed.
        rhythmMode: alphaTab.TabRhythmMode.ShowWithBars,
        elements: new Map([
          // We have no dynamics in the model; alphaTab would print its default "f".
          [alphaTab.NotationElement.EffectDynamics, false],
          // Only the print layout shows the "Made with FretFlow" copyright line.
          [alphaTab.NotationElement.ScoreCopyright, false],
          // Show "H"/"P" and "sl." so techniques are readable in the tab.
          [alphaTab.NotationElement.EffectHammerOnPullOffText, true],
          [alphaTab.NotationElement.EffectSlideText, true],
        ]),
      },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
        soundFont: '/soundfont/sonivox.sf2',
        enableCursor: true,
        enableAnimatedBeatCursor: true,
        enableUserInteraction: false,
        scrollElement: scrollElement.current ?? undefined,
        scrollMode: alphaTab.ScrollMode.Continuous,
      },
    });
    const off = instance.error.on(e => setError(e.message));
    setApi(instance);
    return () => {
      off();
      instance.destroy();
      setApi(null);
    };
  }, [scrollElement]);

  return { containerRef, api, error };
}
