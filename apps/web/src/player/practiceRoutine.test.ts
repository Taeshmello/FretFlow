import { describe, expect, it } from 'vitest';
import { advanceRoutine, readPracticeSections, type PracticeSection } from './practiceRoutine';

const first: PracticeSection = {
  id: 'a', name: 'Intro', startBar: 1, endBar: 2, targetReps: 3, completedSessions: 0, lastPracticedAt: null,
};
const second: PracticeSection = { ...first, id: 'b', name: 'Solo', startBar: 3, endBar: 4 };

describe('saved practice routine', () => {
  it('counts loops and advances to the next section only at the target', () => {
    const before = advanceRoutine([first, second], 'a', 1, 1, 1000);
    expect(before).toMatchObject({ activeId: 'a', repetitions: 2, finishedSection: false });
    const done = advanceRoutine(before.sections, before.activeId, before.repetitions, 1, 1000);
    expect(done).toMatchObject({ activeId: 'b', repetitions: 0, finishedSection: true });
    expect(done.sections[0]).toMatchObject({ completedSessions: 1, lastPracticedAt: 1000 });
    expect(first.completedSessions).toBe(0);
  });

  it('ends the routine after the final section and ignores inactive loops', () => {
    const done = advanceRoutine([first], 'a', 2, 1, 2000);
    expect(done.activeId).toBeNull();
    expect(advanceRoutine(done.sections, null, 0, 1, 3000).sections[0].completedSessions).toBe(1);
  });

  it('rejects stale bars and malformed browser preferences', () => {
    expect(readPracticeSections([first, { ...second, endBar: 8 }, { ...first, id: '', targetReps: 0 }], 4)).toEqual([first]);
    expect(readPracticeSections({ section: first }, 4)).toEqual([]);
  });
});
