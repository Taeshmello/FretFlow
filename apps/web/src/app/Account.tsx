import { UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Popover } from '../ui/Popover';
import { Modal } from '../ui/Dialogs';
import { API_URL } from './persistence';
import { session, useMe } from './session';
import { api, fetchMe, SignInDialog, type Me } from './SignInDialog';

const planLabel = (me: Me) => (me.plan === 'pro' ? 'Pro' : 'Free');

function clearDeleteAccountQuery() {
  const url = new URL(window.location.href);
  url.searchParams.delete('delete-account');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function DeleteAccountDialog({ me, onClose }: { me: Me; onClose: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (confirmation !== 'DELETE') return;
    setBusy(true);
    setError(null);
    const response = await api('/api/auth/delete-user', {
      method: 'POST',
      body: JSON.stringify(password ? { password } : {}),
    }).catch(() => null);
    if (response?.ok) {
      session.set(null);
      clearDeleteAccountQuery();
      // Recreate persistence without a signed-in session. IndexedDB scores and
      // recordings remain on this device; all server-side account data is gone.
      window.location.assign('/');
      return;
    }
    setBusy(false);
    setError(response?.status === 400
      ? 'The password is incorrect or this sign-in is too old. Sign out, sign in again, and retry.'
      : 'The account could not be deleted. No data was removed; please try again.');
  }

  return (
    <Modal title="Delete account" onClose={onClose} className="delete-account-modal">
      <form className="signin-form" onSubmit={submit}>
        <p>
          This permanently deletes <b>{me.email}</b>, its cloud scores, sharing links, practice data,
          sessions and any cloud audio. This cannot be undone.
        </p>
        <p className="muted small">
          Scores and recordings stored only in this browser stay on this device. Remove them separately
          from the library or by clearing this site's storage.
        </p>
        <label className="field">
          Current password (optional for a recent magic-link or Google sign-in)
          <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
        </label>
        <label className="field">
          Type DELETE to confirm
          <input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn danger" disabled={busy || confirmation !== 'DELETE'}>
            {busy ? 'Deleting…' : 'Permanently delete account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Account entry: "Sign in" opens the sign-in modal; once signed in it shows the
 * email and plan (from GET /api/me) with Sign out. `menu` is the editor top-bar
 * form of it. Hidden in local-only builds (no API address).
 */
export function Account({ onSignedIn, variant = 'inline', requestDelete = false }: { onSignedIn: () => void; variant?: 'inline' | 'menu'; requestDelete?: boolean }) {
  const me = useMe();
  const setMe = session.set;
  const [dialog, setDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);

  // Parents pass a fresh callback on every render; keep the latest in a ref so the
  // session check runs once per mount (a dependency on it looped /api/me → refresh → /api/me).
  const onSignedInRef = useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;

  useEffect(() => {
    if (!API_URL) {
      return;
    }
    let alive = true;
    void fetchMe().then(found => {
      if (found && alive) {
        setMe(found);
        onSignedInRef.current();
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!requestDelete) return;
    if (me) {
      setDialog(false);
      setDeleteDialog(true);
    } else {
      setDialog(true);
    }
  }, [me, requestDelete]);

  if (!API_URL) {
    return variant === 'menu' ? null : <span className="muted small">Local mode · saved in this browser only</span>;
  }

  const signOut = async () => {
    await api('/api/auth/sign-out', { method: 'POST', body: '{}' }).catch(() => null);
    setMe(null);
  };
  const modal = dialog && (
    <SignInDialog
      onClose={() => setDialog(false)}
      onSignedIn={found => {
        setMe(found);
        setDialog(false);
        onSignedInRef.current();
      }}
    />
  );
  const deleteModal = me && deleteDialog && (
    <DeleteAccountDialog
      me={me}
      onClose={() => {
        setDeleteDialog(false);
        clearDeleteAccountQuery();
      }}
    />
  );

  if (!me) {
    return (
      <>
        <button type="button" className={variant === 'menu' ? 'btn account-trigger' : 'ghost'} title="Sign in to save to the cloud" onClick={() => setDialog(true)}>
          {variant === 'menu' && <UserRound size={17} />}
          <span>{variant === 'menu' ? 'Sign in' : 'Sign in to save to the cloud'}</span>
        </button>
        {modal}
      </>
    );
  }

  if (variant === 'menu') {
    return (
      <>
        <Popover
          align="right"
          label="Account"
          trigger={() => (
            <button type="button" className="btn account-trigger" title={me.email}>
              <UserRound size={17} />
              <span>{me.email}</span>
            </button>
          )}
        >
          <div className="account-menu">
            <p className="small">
              Signed in as <b>{me.email}</b>
            </p>
            <p className="small">
              Plan: <span className={`plan-badge ${me.plan}`}>{planLabel(me)}</span>
            </p>
            <button type="button" className="btn small" onClick={signOut}>
              Sign out
            </button>
            <button type="button" className="btn danger small" onClick={() => setDeleteDialog(true)}>
              Delete account
            </button>
          </div>
        </Popover>
        {deleteModal}
      </>
    );
  }

  return (
    <>
      <span className="account">
        {me.email}
        <span className={`plan-badge ${me.plan}`}>{planLabel(me)}</span>
        <button type="button" className="ghost small" onClick={signOut}>
          Sign out
        </button>
        <button type="button" className="ghost danger small" onClick={() => setDeleteDialog(true)}>
          Delete account
        </button>
      </span>
      {deleteModal}
    </>
  );
}
