import * as alphaTab from '@coderline/alphatab';
import { migrateScore, type Score } from '@fretflow/score-model';
import { toAlphaTab } from '@fretflow/render';
import { useEffect, useRef, useState } from 'react';
import { loadSharedScore } from '../app/share';
import { useAlphaTab } from '../score/useAlphaTab';

function Player({ score, onBack }: { score: Score; onBack: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { containerRef, api, error } = useAlphaTab(scrollRef);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!api) return;
    const mode = score.tracks[0]?.instrument === 'guitar' || score.tracks[0]?.instrument === 'bass' ? 'scoreTab' : 'score';
    api.renderScore(toAlphaTab(score, { staffMode: mode }, api.settings).score, score.tracks.map((_, i) => i));
    setReady(api.isReadyForPlayback);
    const offReady = api.playerReady.on(() => setReady(true));
    const offState = api.playerStateChanged.on(e => setPlaying(e.state === alphaTab.synth.PlayerState.Playing));
    return () => { offReady(); offState(); };
  }, [api, score]);
  return <div className="editor editor-v2">
    <header className="topbar"><button type="button" className="btn" onClick={onBack}>← My scores</button>
      <div className="title-block"><strong>{score.meta.title}</strong><span className="crumb">Shared read-only score</span></div></header>
    <div className="transport"><button type="button" className="play-btn" disabled={!ready} aria-label={playing ? 'Pause' : 'Play'} onClick={() => api?.playPause()}>{playing ? 'Ⅱ' : '▶'}</button>
      <span className="muted small">{ready ? 'View and play only · recording not shared' : 'Loading sound…'}</span></div>
    {error && <p className="banner error">Score display error: {error}</p>}
    <main className="score-card card"><div className="score-scroll" ref={scrollRef}><div className="score-surface" ref={containerRef} /></div></main>
  </div>;
}

export function SharedScore({ token, onBack }: { token: string; onBack: () => void }) {
  const [score, setScore] = useState<Score | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setScore(null);
    setError('');
    void loadSharedScore(token).then(snapshot => {
      if (alive) setScore(migrateScore(snapshot));
    }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not open this link.'); });
    return () => { alive = false; };
  }, [token]);
  if (error) return <div className="editor-loading"><p>{error}</p><button type="button" className="btn" onClick={onBack}>My scores</button></div>;
  if (!score) return <div className="editor-loading">Opening shared score…</div>;
  return <Player score={score} onBack={onBack} />;
}
