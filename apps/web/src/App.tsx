import type { Score } from '@fretflow/score-model';
import type { SaveStatus, ScoreSummary, SyncConflict } from '@fretflow/storage';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Account } from './app/Account';
import { persistence, type Persistence } from './app/persistence';
import { EditorStore } from './app/store';
import { checkMilestones, track } from './app/telemetry';
import { Library } from './screens/Library';
import { ConflictDialog, ImportReport, Tutorial } from './ui/Dialogs';

// alphaTab (renderer, synth, importers) is several MB: load it only when a score opens,
// so the score list appears right away.
const Editor = lazy(() => import('./screens/Editor').then(m => ({ default: m.Editor })));

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: '',
  pending: 'Editing…',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
};

export function App() {
  const [p, setP] = useState<Persistence | null>(null);
  const [scores, setScores] = useState<ScoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<EditorStore | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [report, setReport] = useState<Map<string, number> | null>(null);
  const [tutorial, setTutorial] = useState(false);
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  const refresh = useCallback(async (pp: Persistence) => {
    setScores(await pp.scores.list());
    setLoading(false);
  }, []);

  const syncNow = useCallback(async () => {
    if (!p?.sync || !navigator.onLine) {
      return;
    }
    try {
      const result = await p.sync.pushDirty();
      if (result.conflicts[0]) {
        setConflict(result.conflicts[0]);
      }
    } catch {
      // Offline or signed out: local copy is safe, retry on the next save or reconnect.
    }
  }, [p]);

  useEffect(() => {
    persistence((status, _error) => setSaveStatus(status))
      .then(async pp => {
        setP(pp);
        await refresh(pp);
        if (!(await pp.media.getPref<boolean>('tutorialDone'))) {
          setTutorial(true);
        }
        const last = await pp.media.getPref<string>('lastOpened');
        if (last && window.location.hash === `#/score/${last}`) {
          const loaded = await pp.scores.load(last);
          if (loaded) {
            openStore(pp, loaded.score);
          }
        }
      })
      .catch(err => setFatal(`Could not open browser storage: ${err instanceof Error ? err.message : String(err)}`));
    // openStore is stable enough for the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (saveStatus === 'saved') {
      void syncNow();
    }
  }, [saveStatus, syncNow]);

  useEffect(() => {
    const online = () => void syncNow();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [syncNow]);

  // Never lose the last edits on close (SPEC §1: zero loss after reload/close).
  useEffect(() => {
    const flush = () => void p?.saver.flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [p]);

  function openStore(pp: Persistence, score: Score) {
    unsubscribe.current?.();
    const s = new EditorStore(score);
    unsubscribe.current = s.onScoreChange((next, tx) => {
      pp.saver.schedule(next, tx);
      checkMilestones(next);
    });
    setStore(s);
    window.location.hash = `#/score/${score.id}`;
    void pp.media.setPref('lastOpened', score.id);
  }

  async function open(id: string) {
    if (!p) {
      return;
    }
    const loaded = await p.scores.load(id);
    if (loaded) {
      openStore(p, loaded.score);
    }
  }

  async function create(score: Score) {
    if (!p) {
      return;
    }
    await p.scores.save(score, null);
    track('score_created', { instrument: score.tracks[0].instrument, bars: score.masterBars.length });
    if (scores.length === 0) {
      track('first_score', {}, 'first_score');
    }
    openStore(p, score);
  }

  async function importFileAndOpen(file: File) {
    if (!p) {
      return;
    }
    setImportError(null);
    try {
      const { openFile } = await import('./app/files');
      const opened = await openFile(file);
      await p.scores.save(opened.score, null);
      track('score_imported', { source: opened.source, unsupported: opened.unsupported.size });
      openStore(p, opened.score);
      if (opened.unsupported.size) {
        setReport(opened.unsupported);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  }

  async function back() {
    if (!p) {
      return;
    }
    await p.saver.flush();
    unsubscribe.current?.();
    setStore(null);
    window.location.hash = '';
    await refresh(p);
  }

  if (fatal) {
    return <div className="banner error">{fatal}</div>;
  }

  return (
    <>
      {store ? (
        <Suspense fallback={<div className="editor-loading">Loading the editor…</div>}>
          <Editor key={store.state.score.id} store={store} onBack={back} saveLabel={SAVE_LABEL[saveStatus]} saveError={saveStatus === 'error'} />
        </Suspense>
      ) : (
        <Library
          scores={scores}
          loading={loading}
          onOpen={open}
          onCreate={create}
          onImport={importFileAndOpen}
          onDelete={async id => {
            if (p) {
              await p.scores.delete(id);
              await p.remote?.delete(id).catch(() => {});
              await refresh(p);
            }
          }}
          importError={importError}
          account={
            <Account
              onSignedIn={() => {
                track('signed_in');
                void p?.sync?.pullMissing().then(() => refresh(p)).catch(() => {});
              }}
            />
          }
        />
      )}
      {tutorial && (
        <Tutorial
          onClose={() => {
            setTutorial(false);
            void p?.media.setPref('tutorialDone', true);
          }}
        />
      )}
      {report && <ImportReport items={report} onClose={() => setReport(null)} />}
      {conflict && p?.sync && (
        <ConflictDialog
          title={conflict.title}
          onClose={() => setConflict(null)}
          onOverwrite={async () => {
            await p.sync?.overwriteServer(conflict.scoreId, conflict.latestRev);
            setConflict(null);
          }}
          onTakeServer={async () => {
            const score = await p.sync?.takeServer(conflict.scoreId);
            if (score && store?.state.score.id === score.id) {
              store.replace(score);
            }
            setConflict(null);
          }}
        />
      )}
    </>
  );
}
