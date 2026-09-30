import { UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Popover } from '../ui/Popover';
import { API_URL } from './persistence';
import { session, useMe } from './session';
import { api, fetchMe, SignInDialog, type Me } from './SignInDialog';

const planLabel = (me: Me) => (me.plan === 'pro' ? 'Pro' : 'Free');

/**
 * Account entry: "Sign in" opens the sign-in modal; once signed in it shows the
 * email and plan (from GET /api/me) with Sign out. `menu` is the editor top-bar
 * form of it. Hidden in local-only builds (no API address).
 */
export function Account({ onSignedIn, variant = 'inline' }: { onSignedIn: () => void; variant?: 'inline' | 'menu' }) {
  const me = useMe();
  const setMe = session.set;
  const [dialog, setDialog] = useState(false);

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
        </div>
      </Popover>
    );
  }

  return (
    <span className="account">
      {me.email}
      <span className={`plan-badge ${me.plan}`}>{planLabel(me)}</span>
      <button type="button" className="ghost small" onClick={signOut}>
        Sign out
      </button>
    </span>
  );
}
