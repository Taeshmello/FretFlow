import { useEffect, useState } from 'react';
import { API_URL } from '../app/persistence';
import { createShareLink, revokeShareLink, shareStatus } from '../app/share';
import { useMe } from '../app/session';
import { Modal } from './Modal';

export function ShareDialog({ scoreId, isCover, onClose }: { scoreId: string; isCover: boolean; onClose: () => void }) {
  const me = useMe();
  const [shared, setShared] = useState<boolean | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!API_URL || !me) return;
    let active = true;
    void shareStatus(scoreId).then(value => { if (active) setShared(value); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load sharing status.'); });
    return () => { active = false; };
  }, [scoreId, me]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Sharing failed.'); }
    finally { setBusy(false); }
  };

  return <Modal title="Share score" onClose={onClose}>
    {!API_URL ? <p>Sharing is available after the online service is configured.</p> : !me ? <p>Sign in to create a read-only link.</p> : <>
      <p>Anyone with the link can view and play this score. Your recording and private practice routine are never included.</p>
      {isCover && <p className="muted small">Only share an arrangement if you have the rights or permission to do so.</p>}
      {shared === null && !error ? <p className="muted">Loading sharing status…</p> : <>
        <button type="button" className="btn primary" disabled={busy || (shared === null && !error)} onClick={() => void run(async () => {
          const url = await createShareLink(scoreId);
          setLink(url);
          setShared(true);
          setCopied(false);
        })}>{shared ? 'Replace link' : 'Create read-only link'}</button>
        {shared && <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => {
          await revokeShareLink(scoreId);
          setShared(false);
          setLink('');
        })}>Disable link</button>}
        {shared && !link && <p className="muted small">A link is active. Create a replacement to copy it here; the old link will stop working.</p>}
        {link && <div><input aria-label="Share link" readOnly value={link} onFocus={e => e.target.select()} />
          <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setError('Copy failed. Select the link above instead.'))}>{copied ? 'Copied' : 'Copy link'}</button></div>}
      </>}
      {error && <p className="banner error" role="alert">{error}</p>}
    </>}
  </Modal>;
}
