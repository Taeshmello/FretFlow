import { API_URL, persistence } from './persistence';

async function request(path: string, init: RequestInit = {}) {
  if (!API_URL) throw new Error('Sharing needs the online FretFlow service.');
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: init.credentials ?? 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Sharing failed (${response.status}).`);
  }
  return response;
}

export async function shareStatus(scoreId: string): Promise<boolean> {
  const response = await request(`/api/scores/${encodeURIComponent(scoreId)}/share`);
  return ((await response.json()) as { shared: boolean }).shared;
}

export async function createShareLink(scoreId: string): Promise<string> {
  const p = await persistence(() => {});
  if (!p.remote || !p.sync) throw new Error('Sharing needs the online FretFlow service.');
  await p.saver.flush();
  const synced = await p.sync.pushDirty();
  if (synced.conflicts.some(c => c.scoreId === scoreId)) throw new Error('Resolve the score sync conflict before sharing.');
  if (synced.failed.some(f => f.scoreId === scoreId)) throw new Error('The score could not be synced. Try again when online.');
  if (!await p.remote.load(scoreId)) throw new Error('Save this score online before sharing.');
  const response = await request(`/api/scores/${encodeURIComponent(scoreId)}/share`, { method: 'POST' });
  const { token } = await response.json() as { token: string };
  return `${location.origin}${location.pathname}#/share/${token}`;
}

export async function revokeShareLink(scoreId: string): Promise<void> {
  await request(`/api/scores/${encodeURIComponent(scoreId)}/share`, { method: 'DELETE' });
}

export async function loadSharedScore(token: string): Promise<unknown> {
  const response = await request(`/api/share/${encodeURIComponent(token)}`, { credentials: 'omit' });
  return ((await response.json()) as { snapshot: unknown }).snapshot;
}
