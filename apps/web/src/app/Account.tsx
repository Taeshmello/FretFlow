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

/** Login (magic link / Google via Better Auth on services/api). Hidden in local-only mode. */
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
          <input type="email" required placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button type="submit" className="primary small">
            Email me a link
          </button>
          <button
            type="button"
            className="ghost small"
            onClick={async () => {
              // Better Auth: POST {provider, callbackURL} → { url } of the Google consent page.
              const r = await api('/api/auth/sign-in/social', {
                method: 'POST',
                body: JSON.stringify({ provider: 'google', callbackURL: window.location.origin }),
              }).catch(() => null);
              const body = r?.ok ? ((await r.json()) as { url?: string }) : null;
              if (body?.url) {
                window.location.assign(body.url);
              } else {
                setError('Could not start Google sign-in.');
              }
            }}
          >
            Google
          </button>
          {error && <span className="error-text">{error}</span>}
        </form>
      )}
    </span>
  );
}
