import { newId } from '@fretflow/score-model';
import { useEffect, useRef, useState } from 'react';
import { persistence } from '../app/persistence';
import { useMe, usePlan } from '../app/session';
import { advanceRoutine, readPracticeSections, type PracticeSection } from './practiceRoutine';

interface Inputs {
  scoreId: string;
  barCount: number;
  loopCount: number;
  onLoopRange: (bars: [number, number] | null) => void;
}

/** Pro-only saved practice, kept outside the shared Score and local to this browser. */
export function usePracticeRoutine({ scoreId, barCount, loopCount, onLoopRange }: Inputs) {
  const plan = usePlan();
  const me = useMe();
  const key = `practice:${me?.id ?? 'signed-out'}:${scoreId}`;
  const [sections, setSections] = useState<PracticeSection[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [repetitions, setRepetitions] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastCount = useRef(loopCount);
  const previousActive = useRef<string | null>(null);
  const applyRef = useRef(onLoopRange);
  const sectionsRef = useRef(sections);
  applyRef.current = onLoopRange;
  sectionsRef.current = sections;

  useEffect(() => {
    let alive = true;
    setLoadedKey(null);
    setSections([]);
    setActiveId(null);
    setRepetitions(0);
    void persistence(() => {}).then(p => p.media.getPref<unknown>(key)).then(value => {
      if (!alive) return;
      setSections(readPracticeSections(value, barCount));
      setLoadedKey(key);
      setError(null);
    }).catch(() => {
      if (alive) setError('Saved practice could not be loaded in this browser.');
    });
    return () => { alive = false; };
  }, [key, barCount]);

  useEffect(() => {
    if (loadedKey !== key) return;
    void persistence(() => {}).then(p => p.media.setPref(key, sections)).catch(() => {
      setError('Saved practice could not be stored in this browser.');
    });
  }, [key, loadedKey, sections]);

  useEffect(() => {
    const cycles = loopCount - lastCount.current;
    lastCount.current = loopCount;
    if (cycles <= 0 || loadedKey !== key || plan !== 'pro' || !activeId) return;
    const next = advanceRoutine(sectionsRef.current, activeId, repetitions, cycles, Date.now());
    setRepetitions(next.repetitions);
    if (next.sections !== sectionsRef.current) setSections(next.sections);
    if (next.activeId !== activeId) setActiveId(next.activeId);
  }, [loopCount, activeId, repetitions, loadedKey, key, plan]);

  useEffect(() => {
    if (loadedKey !== key || plan !== 'pro') return;
    const section = sectionsRef.current.find(s => s.id === activeId);
    if (activeId) applyRef.current(section ? [section.startBar, section.endBar] : null);
    else if (previousActive.current) applyRef.current(null);
    previousActive.current = activeId;
    // Section edits do not reset the transport; only moving through the routine does.
  }, [activeId, loadedKey, key, plan]);

  useEffect(() => {
    if (plan !== 'pro') {
      setActiveId(null);
      setRepetitions(0);
    }
  }, [plan]);

  const ready = loadedKey === key;
  return {
    ready,
    sections: ready ? sections : [],
    activeId,
    repetitions,
    error,
    add(name: string, bars: [number, number], targetReps: number) {
      if (plan !== 'pro' || !ready || sections.length >= 30) return false;
      const trimmed = name.trim() || `Bars ${bars[0]}–${bars[1]}`;
      if (trimmed.length > 60 || bars[0] < 1 || bars[1] > barCount || bars[0] > bars[1]
        || !Number.isInteger(targetReps) || targetReps < 1 || targetReps > 20) return false;
      setSections(current => [...current, {
        id: newId(), name: trimmed, startBar: bars[0], endBar: bars[1], targetReps,
        completedSessions: 0, lastPracticedAt: null,
      }]);
      return true;
    },
    remove(id: string) {
      if (plan !== 'pro' || !ready) return;
      setSections(current => current.filter(s => s.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setRepetitions(0);
        applyRef.current(null);
      }
    },
    start(id?: string) {
      if (plan !== 'pro' || !ready) return;
      const selected = sections.find(s => s.id === (id ?? sections[0]?.id));
      if (!selected) return;
      lastCount.current = loopCount;
      setRepetitions(0);
      setActiveId(selected.id);
      applyRef.current([selected.startBar, selected.endBar]);
    },
    stop() {
      setActiveId(null);
      setRepetitions(0);
      applyRef.current(null);
    },
  };
}

export type PracticeRoutine = ReturnType<typeof usePracticeRoutine>;
