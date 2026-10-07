import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persistence, type Persistence } from '../app/persistence';
import { readPracticeCache, loadPracticeState } from './practicePersistence';
import type { PracticeSection } from './practiceRoutine';

vi.mock('../app/persistence', () => ({ API_URL: '', persistence: vi.fn() }));

const section: PracticeSection = {
  id: 'intro', name: 'Intro', startBar: 1, endBar: 2, targetReps: 3,
  completedSessions: 0, lastPracticedAt: null,
};

describe('practice persistence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks legacy section arrays dirty so they can be sent to the server', () => {
    expect(readPracticeCache([section], 4)).toEqual({ sections: [section], rev: 0, dirty: true });
  });

  it('drops stale bars and invalid revisions from the browser cache', () => {
    expect(readPracticeCache({ sections: [section, { ...section, id: 'stale', endBar: 8 }], rev: -1, dirty: true }, 4))
      .toEqual({ sections: [section], rev: 0, dirty: true });
  });

  it('loads an offline cache without changing its sections or revision', async () => {
    const getPref = vi.fn().mockResolvedValue({ sections: [section], rev: 2, dirty: true });
    vi.mocked(persistence).mockResolvedValue({ media: { getPref } } as unknown as Persistence);
    expect(await loadPracticeState('practice:user:score', 'score', 4, false, () => true))
      .toEqual({ sections: [section], rev: 2, dirty: true, error: null, conflict: false });
    expect(getPref).toHaveBeenCalledWith('practice:user:score');
  });

  it('ignores a cache response after the active score changes', async () => {
    vi.mocked(persistence).mockResolvedValue({ media: { getPref: vi.fn().mockResolvedValue([section]) } } as unknown as Persistence);
    expect(await loadPracticeState('practice:user:old-score', 'old-score', 4, false, () => false)).toBeNull();
  });
});
