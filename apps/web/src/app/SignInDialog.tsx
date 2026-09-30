import { useState } from 'react';
import { Modal } from '../ui/Dialogs';
import { API_URL } from './persistence';

export interface Me {
  id: string;
  email: string;
  name?: string | null;
  /** Decided by the server from the user's entitlements (D-010). */
  plan: 'free' | 'pro';
  planExpiresAt?: string | null;
}

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

/** GET /api/me, or null when signed out or offline. */
export async function fetchMe(): Promise<Me | null> {
  const r = await api('/api/me').catch(() => null);
  return r?.ok ? ((await r.json()) as Me) : null;
}

type Provider = 'google' | 'apple';

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'apple', label: 'Continue with Apple' },
];

/**
 * Social providers that are switched on, e.g. VITE_SOCIAL_LOGIN=google,apple. The buttons
 * always show; until the provider's keys are set up on the server they stay disabled.
 */
const ENABLED = new Set(((import.meta.env.VITE_SOCIAL_LOGIN as string | undefined) ?? '').split(',').map(x => x.trim()));

/** Better Auth answers → a short message for the form. */
function failure(status: number | undefined, mode: 'signIn' | 'signUp'): string {
  if (status === 401) {
    return 'Wrong email or password.';
  }
  if (status === 422) {
    // Deliberately vague: the form should not confirm which emails have accounts.
    return 'Could not create an account with this email. Try signing in, or use an email sign-in link.';
  }
  if (status === 400) {
    return mode === 'signUp' ? 'Check the email address and use a password of 8 to 128 characters.' : 'Check the email address and password.';
  }
  if (status === 429) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  return 'Could not reach the server. Please try again in a moment.';
}

interface Props {
  onClose: () => void;
  onSignedIn: (me: Me) => void;
}

/** Sign in / create account with email and password (Better Auth), in a modal. */
export function SignInDialog({ onClose, onSignedIn }: Props) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const path = mode === 'signIn' ? '/api/auth/sign-in/email' : '/api/auth/sign-up/email';
    const body = mode === 'signIn' ? { email, password } : { email, password, name: email.split('@')[0] };
    const r = await api(path, { method: 'POST', body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) {
      const me = await fetchMe();
      setBusy(false);
      if (me) {
        onSignedIn(me);
        return;
      }
    }
    setBusy(false);
    setError(failure(r?.status, mode));
  }

  /** Forgotten password: the one-time email link still signs you in. */
  async function sendLink() {
    setError(null);
    if (!email) {
      setError('Enter your email address first.');
      return;
    }
    const r = await api('/api/auth/sign-in/magic-link', {
      method: 'POST',
      // Back to this page (and this score) once the link is opened.
      body: JSON.stringify({ email, callbackURL: window.location.href }),
    }).catch(() => null);
    if (r?.ok) {
      setLinkSent(true);
    } else {
      setError(r?.status === 429 ? failure(429, mode) : 'Could not send the link. Please try again in a moment.');
    }
  }

  async function social(id: Provider) {
    const r = await api('/api/auth/sign-in/social', { method: 'POST', body: JSON.stringify({ provider: id, callbackURL: window.location.href }) }).catch(() => null);
    const body = r?.ok ? ((await r.json()) as { url?: string }) : null;
    if (body?.url) {
      window.location.assign(body.url);
    } else {
      setError(`Could not start ${id === 'google' ? 'Google' : 'Apple'} sign-in.`);
    }
  }

  return (
    <Modal title={mode === 'signIn' ? 'Sign in' : 'Create your account'} onClose={onClose} className="signin-modal">
      <p className="muted small">Save your scores to the cloud and open them on any device.</p>
      <div className="segmented signin-tabs" role="tablist" aria-label="Sign in or create an account">
        <button type="button" role="tab" aria-selected={mode === 'signIn'} aria-pressed={mode === 'signIn'} onClick={() => { setMode('signIn'); setError(null); }}>
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={mode === 'signUp'} aria-pressed={mode === 'signUp'} onClick={() => { setMode('signUp'); setError(null); }}>
          Create account
        </button>
      </div>
      <form className="signin-form" onSubmit={submit}>
        <label className="field">
          Email
          <input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            placeholder={mode === 'signUp' ? 'At least 8 characters' : ''}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
        </button>
        {mode === 'signIn' && (
          <p className="small signin-forgot">
            {linkSent ? (
              <>We sent a one-time sign-in link to {email}.</>
            ) : (
              <>
                Forgot your password?{' '}
                <button type="button" className="link" onClick={sendLink}>
                  Email me a sign-in link
                </button>
              </>
            )}
          </p>
        )}
      </form>
      <div className="signin-or muted small">or</div>
      <div className="login-social">
        {PROVIDERS.map(({ id, label }) => {
          const enabled = ENABLED.has(id);
          return (
            <button key={id} type="button" className={`btn social ${id}`} disabled={!enabled} title={enabled ? undefined : 'Coming soon'} onClick={() => social(id)}>
              {label}
              {!enabled && <small>Soon</small>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
