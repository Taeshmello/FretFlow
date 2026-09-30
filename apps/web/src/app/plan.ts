/**
 * What each plan unlocks in the UI. The plan itself comes from GET /api/me, decided
 * by the server (D-010); these rules only shape controls, they grant nothing.
 */
export type Plan = 'free' | 'pro';

/** Playback speed as a rate (1 = normal). Pitch is kept (D-018). */
export function speedRange(plan: Plan): [number, number] {
  return plan === 'pro' ? [0.25, 1.5] : [0.5, 1];
}

export function clampSpeed(plan: Plan, speed: number): number {
  const [min, max] = speedRange(plan);
  return Math.min(max, Math.max(min, speed));
}

/** Preset buttons, in percent. */
export function speedPresets(plan: Plan): number[] {
  return plan === 'pro' ? [25, 50, 75, 100, 125, 150] : [50, 60, 70, 80, 90, 100];
}

/** Free PDF exports carry the "Made with FretFlow" footer (SPEC §9). */
export function printsFooter(plan: Plan): boolean {
  return plan !== 'pro';
}

/** Automatic speed increases on each loop are reserved for Pro practice. */
export function canUseSpeedTrainer(plan: Plan): boolean {
  return plan === 'pro';
}
