import { useEffect, useRef, useState } from 'react';
import { API_URL } from './persistence';

interface Me {
  id: string;
  email: string;
  name?: string | null;
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
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

/** Login (email link now; Google and Apple via Better Auth once configured). Hidden in local-only mode. */
export function Account({ onSignedIn }: { onSignedIn: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parents pass a fresh callback on every render; keep the latest in a ref so the
  // session check runs once per mount (a dependency on it looped /api/me → refresh → /api/me).
  const onSignedInRef = useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;

  useEffect(() => {
    if (!API_URL) {
      return;
    }
    let alive = true;
    api('/api/me')
      .then(async r => {
        if (r.ok && alive) {
          // services/api returns the user fields at the top level.
          setMe((await r.json()) as Me);
          onSignedInRef.current();
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!API_URL) {
    return <span className="muted small">Local mode · saved in this browser only</span>;
  }
  if (me) {
    return (
      <span className="account">
        {me.email}
        <button
          type="button"
          className="ghost small"
          onClick={async () => {
            await api('/api/auth/sign-out', { method: 'POST', body: '{}' });
            setMe(null);
          }}
        >
          Sign out
        </button>
      </span>
    );
  }
  return (
    <span className="account">
      {!open ? (
        <button type="button" className="ghost" onClick={() => setOpen(true)}>
          Sign in to save to the cloud
        </button>
      ) : sent ? (
        <span className="muted">We sent a sign-in link to {email}.</span>
      ) : (
        <form
          className="login"
          onSubmit={async e => {
            e.preventDefault();
            setError(null);
            const r = await api('/api/auth/sign-in/magic-link', {
              method: 'POST',
              body: JSON.stringify({ email, callbackURL: window.location.origin }),
            }).catch(() => null);
            if (r?.ok) {
              setSent(true);
            } else {
              setError('Could not send the link. Please try again in a moment.');
            }
          }}
        >
          <div className="login-social">
            {PROVIDERS.map(({ id, label }) => {
              const enabled = ENABLED.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`btn social ${id}`}
                  disabled={!enabled}
                  title={enabled ? undefined : 'Coming soon — use email for now'}
                  onClick={async () => {
                    // Better Auth: POST {provider, callbackURL} → { url } of the provider's consent page.
                    const r = await api('/api/auth/sign-in/social', {
                      method: 'POST',
                      body: JSON.stringify({ provider: id, callbackURL: window.location.origin }),
                    }).catch(() => null);
                    const body = r?.ok ? ((await r.json()) as { url?: string }) : null;
                    if (body?.url) {
                      window.location.assign(body.url);
                    } else {
                      setError(`Could not start ${id === 'google' ? 'Google' : 'Apple'} sign-in.`);
                    }
                  }}
                >
                  {label}
                  {!enabled && <small>Soon</small>}
                </button>
              );
            })}
          </div>
          <span className="login-or muted small">or sign in with email</span>
          <div className="login-email">
            <input type="email" required aria-label="Email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            <button type="submit" className="btn primary small">
              Email me a link
            </button>
          </div>
          {error && <span className="error-text">{error}</span>}
        </form>
      )}
    </span>
  );
}
