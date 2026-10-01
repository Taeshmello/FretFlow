import * as alphaTab from '@coderline/alphatab';
import { useEffect, useRef, useState } from 'react';

export type ViewMode = 'scoreTab' | 'tab' | 'score';

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
          // The score card header shows title, track and tuning (design page 1); print shows them.
          [alphaTab.NotationElement.ScoreTitle, false],
          [alphaTab.NotationElement.ScoreSubTitle, false],
          [alphaTab.NotationElement.ScoreArtist, false],
          [alphaTab.NotationElement.ScoreWordsAndMusic, false],
          [alphaTab.NotationElement.GuitarTuning, false],
          [alphaTab.NotationElement.TrackNames, false],
          // Show "H"/"P" and "sl." so techniques are readable in the tab.
          [alphaTab.NotationElement.EffectHammerOnPullOffText, true],
          [alphaTab.NotationElement.EffectSlideText, true],
        ]),
      },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
        soundFont: '/soundfont/FluidR3Mono_GM.sf3',
        enableCursor: true,
        enableAnimatedBeatCursor: true,
        enableUserInteraction: false,
        scrollElement: scrollElement.current ?? undefined,
        // Follow the playback cursor only while playing (see below).
        scrollMode: alphaTab.ScrollMode.Off,
      },
    });
    // With scrolling on, every re-render after an edit scrolled back to the (stopped)
    // playback cursor, i.e. to the first bar. Scroll along only during playback; the
    // settings update creates alphaTab's scroll handler for the new mode.
    const offState = instance.playerStateChanged.on(e => {
      const mode = e.state === alphaTab.synth.PlayerState.Playing ? alphaTab.ScrollMode.Continuous : alphaTab.ScrollMode.Off;
      if (instance.settings.player.scrollMode !== mode) {
        instance.settings.player.scrollMode = mode;
        instance.updateSettings();
      }
    });
    const offError = instance.error.on(e => setError(e.message));
    const off = () => {
      offState();
      offError();
    };
    setApi(instance);
    return () => {
      off();
      instance.destroy();
      setApi(null);
    };
  }, [scrollElement]);

  return { containerRef, api, error };
}
