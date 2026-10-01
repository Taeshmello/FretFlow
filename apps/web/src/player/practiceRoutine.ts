export interface PracticeSection {
  id: string;
  name: string;
  startBar: number;
  endBar: number;
  targetReps: number;
  completedSessions: number;
  lastPracticedAt: number | null;
}

export interface RoutineStep {
  sections: PracticeSection[];
  activeId: string | null;
  repetitions: number;
  finishedSection: boolean;
}

/** Browser preferences can outlive edits to a score; ignore invalid or deleted bars. */
export function readPracticeSections(value: unknown, barCount: number): PracticeSection[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).filter((item): item is PracticeSection => {
    if (typeof item !== 'object' || item === null) return false;
    const s = item as Partial<PracticeSection>;
    return typeof s.id === 'string' && s.id.length > 0
      && typeof s.name === 'string' && s.name.length > 0 && s.name.length <= 60
      && Number.isInteger(s.startBar) && Number.isInteger(s.endBar)
      && s.startBar! >= 1 && s.endBar! >= s.startBar! && s.endBar! <= barCount
      && Number.isInteger(s.targetReps) && s.targetReps! >= 1 && s.targetReps! <= 20
      && Number.isInteger(s.completedSessions) && s.completedSessions! >= 0
      && (s.lastPracticedAt === null || (typeof s.lastPracticedAt === 'number' && Number.isFinite(s.lastPracticedAt)));
  });
}

/** Complete a section after its target loops, then move to the next saved section. */
export function advanceRoutine(
  sections: PracticeSection[], activeId: string | null, repetitions: number, cycles: number, now: number,
): RoutineStep {
  const index = sections.findIndex(s => s.id === activeId);
  if (index < 0 || !Number.isInteger(cycles) || cycles <= 0) {
    return { sections, activeId, repetitions, finishedSection: false };
  }
  const current = sections[index];
  const total = repetitions + cycles;
  if (total < current.targetReps) {
    return { sections, activeId, repetitions: total, finishedSection: false };
  }
  const updated = [...sections];
  updated[index] = { ...current, completedSessions: current.completedSessions + 1, lastPracticedAt: now };
  return {
    sections: updated,
    activeId: sections[index + 1]?.id ?? null,
    repetitions: 0,
    finishedSection: true,
  };
}
