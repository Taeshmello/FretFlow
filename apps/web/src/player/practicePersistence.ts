import { API_URL, persistence } from '../app/persistence';
import { readPracticeSections, type PracticeSection } from './practiceRoutine';
import { loadRemotePractice, PracticeConflict, saveRemotePractice } from './practiceRemote';

export interface CachedPractice { sections: PracticeSection[]; rev: number; dirty: boolean }

export interface PracticeLoadResult extends CachedPractice {
  error: string | null;
  conflict: boolean;
}

export function readPracticeCache(value: unknown, barCount: number): CachedPractice {
  if (Array.isArray(value)) {
    const sections = readPracticeSections(value, barCount);
    return { sections, rev: 0, dirty: sections.length > 0 };
  }
  const raw = value as Partial<CachedPractice> | null;
  return {
    sections: readPracticeSections(raw?.sections, barCount),
    rev: typeof raw?.rev === 'number' && Number.isInteger(raw.rev) && raw.rev >= 0 ? raw.rev : 0,
    dirty: raw?.dirty === true,
  };
}

/** Loads browser state first, then reconciles the private Pro row if online. */
export async function loadPracticeState(
  key: string, scoreId: string, barCount: number, onlinePro: boolean, isCurrent: () => boolean,
): Promise<PracticeLoadResult | null> {
  const p = await persistence(() => {});
  const cache = readPracticeCache(await p.media.getPref<unknown>(key), barCount);
  if (!isCurrent()) return null;
  let sections = cache.sections;
  let rev = cache.rev;
  let dirty = cache.dirty;
  let error: string | null = null;
  let conflict = false;
  if (onlinePro && navigator.onLine && API_URL) {
    try {
      await p.saver.flush();
      const result = await p.sync?.pushDirty();
      if (!isCurrent()) return null;
      if (result?.conflicts.some(c => c.scoreId === scoreId) || result?.failed.some(f => f.scoreId === scoreId)) {
        throw new Error('Sync this score before syncing practice.');
      }
      const cloud = await loadRemotePractice(scoreId);
      if (!isCurrent()) return null;
      if (cache.dirty) {
        if (cache.rev !== cloud.rev) throw new PracticeConflict('Practice changed on another device. Choose which version to keep.');
        rev = await saveRemotePractice(scoreId, cache.sections, cloud.rev);
        if (!isCurrent()) return null;
        dirty = false;
      } else {
        sections = readPracticeSections(cloud.sections, barCount);
        rev = cloud.rev;
      }
      await p.media.setPref(key, { sections, rev, dirty } satisfies CachedPractice);
    } catch (e) {
      if (!isCurrent()) return null;
      conflict = e instanceof PracticeConflict;
      error = e instanceof Error ? e.message : 'Practice could not be synced.';
    }
  }
  if (!isCurrent()) return null;
  return { sections, rev, dirty, error, conflict };
}
