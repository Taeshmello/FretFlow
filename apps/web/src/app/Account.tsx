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
    return <span className="muted small">로컬 모드 · 이 브라우저에만 저장</span>;
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
          로그아웃
        </button>
      </span>
    );
  }
  return (
    <span className="account">
      {!open ? (
        <button type="button" className="ghost" onClick={() => setOpen(true)}>
          로그인해서 클라우드에 저장
        </button>
      ) : sent ? (
        <span className="muted">{email}로 로그인 링크를 보냈습니다.</span>
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
              setError('링크를 보내지 못했습니다. 잠시 뒤 다시 시도하세요.');
            }
          }}
        >
          <input type="email" required placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button type="submit" className="primary small">
            링크 받기
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
                setError('Google 로그인을 시작하지 못했습니다.');
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
