import { newId } from '@fretflow/score-model';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, persistence } from '../app/persistence';
import { useMe, usePlan } from '../app/session';
import { advanceRoutine, readPracticeSections, type PracticeSection } from './practiceRoutine';
import { loadRemotePractice, PracticeConflict, saveRemotePractice } from './practiceRemote';

interface Inputs {
  scoreId: string;
  barCount: number;
  loopCount: number;
  onLoopRange: (bars: [number, number] | null) => void;
}

interface CachedPractice { sections: PracticeSection[]; rev: number; dirty: boolean }

function readCache(value: unknown, barCount: number): CachedPractice {
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

/** Pro-only saved practice, local first and synchronized to the user's private server row. */
export function usePracticeRoutine({ scoreId, barCount, loopCount, onLoopRange }: Inputs) {
  const plan = usePlan();
  const me = useMe();
  const key = `practice:${me?.id ?? 'signed-out'}:${scoreId}`;
  const [sections, setSections] = useState<PracticeSection[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [repetitions, setRepetitions] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const remoteRev = useRef(0);
  const dirty = useRef(false);
  const generation = useRef(0);
  const saving = useRef(false);
  const blocked = useRef(false);
  const activeKey = useRef(key);
  const lastCount = useRef(loopCount);
  const previousActive = useRef<string | null>(null);
  const applyRef = useRef(onLoopRange);
  const sectionsRef = useRef(sections);
  applyRef.current = onLoopRange;
  sectionsRef.current = sections;

  const onlinePro = plan === 'pro' && !!me && !!API_URL;
  const syncCurrent = useCallback(async () => {
    if (!onlinePro || !navigator.onLine || saving.current || blocked.current || activeKey.current !== key) return;
    saving.current = true;
    try {
      while (dirty.current && activeKey.current === key) {
        const at = generation.current;
        const snapshot = sectionsRef.current;
        const nextRev = await saveRemotePractice(scoreId, snapshot, remoteRev.current);
        if (activeKey.current !== key) return;
        remoteRev.current = nextRev;
        dirty.current = generation.current !== at;
        const p = await persistence(() => {});
        await p.media.setPref(key, { sections: sectionsRef.current, rev: nextRev, dirty: dirty.current } satisfies CachedPractice);
        if (activeKey.current === key) setError(null);
      }
    } catch (e) {
      if (activeKey.current === key) {
        if (e instanceof PracticeConflict) { blocked.current = true; setConflict(true); }
        setError(e instanceof Error ? e.message : 'Practice could not be synced.');
      }
    } finally {
      saving.current = false;
    }
  }, [key, onlinePro, scoreId]);

  useEffect(() => {
    let alive = true;
    activeKey.current = key;
    blocked.current = false;
    generation.current = 0;
    remoteRev.current = 0;
    dirty.current = false;
    setLoadedKey(null);
    setSections([]);
    setConflict(false);
    setActiveId(null);
    setRepetitions(0);
    void (async () => {
      const p = await persistence(() => {});
      const cache = readCache(await p.media.getPref<unknown>(key), barCount);
      if (!alive || activeKey.current !== key) return;
      let next = cache.sections;
      remoteRev.current = cache.rev;
      dirty.current = cache.dirty;
      let loadError: string | null = null;
      if (onlinePro && navigator.onLine) {
        try {
          await p.saver.flush();
          const result = await p.sync?.pushDirty();
          if (!alive || activeKey.current !== key) return;
          if (result?.conflicts.some(c => c.scoreId === scoreId) || result?.failed.some(f => f.scoreId === scoreId)) {
            throw new Error('Sync this score before syncing practice.');
          }
          const cloud = await loadRemotePractice(scoreId);
          if (!alive || activeKey.current !== key) return;
          if (cache.dirty) {
            if (cache.rev !== cloud.rev) throw new PracticeConflict('Practice changed on another device. Choose which version to keep.');
            const savedRev = await saveRemotePractice(scoreId, cache.sections, cloud.rev);
            if (!alive || activeKey.current !== key) return;
            remoteRev.current = savedRev;
            dirty.current = false;
          } else {
            next = readPracticeSections(cloud.sections, barCount);
            remoteRev.current = cloud.rev;
          }
          await p.media.setPref(key, { sections: next, rev: remoteRev.current, dirty: dirty.current } satisfies CachedPractice);
        } catch (e) {
          if (!alive || activeKey.current !== key) return;
          if (e instanceof PracticeConflict) { blocked.current = true; if (alive) setConflict(true); }
          loadError = e instanceof Error ? e.message : 'Practice could not be synced.';
        }
      }
      if (!alive || activeKey.current !== key) return;
      setSections(next);
      sectionsRef.current = next;
      setLoadedKey(key);
      setError(loadError);
    })().catch(() => { if (alive) setError('Saved practice could not be loaded in this browser.'); });
    return () => { alive = false; };
  }, [key, barCount, onlinePro, scoreId]);

  useEffect(() => {
    if (loadedKey !== key || !dirty.current) return;
    void persistence(() => {}).then(p => p.media.setPref(key, { sections, rev: remoteRev.current, dirty: true } satisfies CachedPractice)).catch(() => {
      setError('Saved practice could not be stored in this browser.');
    });
    const timer = setTimeout(() => void syncCurrent(), 500);
    return () => clearTimeout(timer);
  }, [key, loadedKey, sections, syncCurrent]);

  useEffect(() => {
    if (loadedKey !== key || !onlinePro) return;
    const online = () => {
      if (dirty.current) { void syncCurrent(); return; }
      void loadRemotePractice(scoreId).then(async cloud => {
        if (activeKey.current !== key || dirty.current || cloud.rev <= remoteRev.current) return;
        const next = readPracticeSections(cloud.sections, barCount);
        remoteRev.current = cloud.rev;
        sectionsRef.current = next;
        setSections(next);
        const p = await persistence(() => {});
        await p.media.setPref(key, { sections: next, rev: cloud.rev, dirty: false } satisfies CachedPractice);
      }).catch(() => setError('Practice could not be refreshed from another device.'));
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [barCount, key, loadedKey, onlinePro, scoreId, syncCurrent]);

  useEffect(() => {
    const cycles = loopCount - lastCount.current;
    lastCount.current = loopCount;
    if (cycles <= 0 || loadedKey !== key || plan !== 'pro' || !activeId) return;
    const next = advanceRoutine(sectionsRef.current, activeId, repetitions, cycles, Date.now());
    setRepetitions(next.repetitions);
    if (next.sections !== sectionsRef.current) { dirty.current = true; generation.current++; setSections(next.sections); }
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
    conflict,
    async resolveConflict(choice: 'local' | 'cloud') {
      if (!onlinePro || !navigator.onLine || !conflict) return;
      try {
        const cloud = await loadRemotePractice(scoreId);
        if (choice === 'local') {
          const rev = await saveRemotePractice(scoreId, sectionsRef.current, cloud.rev);
          remoteRev.current = rev;
          dirty.current = false;
        } else {
          const next = readPracticeSections(cloud.sections, barCount);
          sectionsRef.current = next;
          setSections(next);
          remoteRev.current = cloud.rev;
          dirty.current = false;
          setActiveId(null);
        }
        blocked.current = false;
        setConflict(false);
        setError(null);
        const p = await persistence(() => {});
        await p.media.setPref(key, { sections: sectionsRef.current, rev: remoteRev.current, dirty: false } satisfies CachedPractice);
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not resolve practice conflict.'); }
    },
    add(name: string, bars: [number, number], targetReps: number) {
      if (plan !== 'pro' || !ready || sections.length >= 30) return false;
      const trimmed = name.trim() || `Bars ${bars[0]}–${bars[1]}`;
      if (trimmed.length > 60 || bars[0] < 1 || bars[1] > barCount || bars[0] > bars[1]
        || !Number.isInteger(targetReps) || targetReps < 1 || targetReps > 20) return false;
      dirty.current = true; generation.current++;
      setSections(current => [...current, {
        id: newId(), name: trimmed, startBar: bars[0], endBar: bars[1], targetReps,
        completedSessions: 0, lastPracticedAt: null,
      }]);
      return true;
    },
    remove(id: string) {
      if (plan !== 'pro' || !ready) return;
      dirty.current = true; generation.current++;
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
