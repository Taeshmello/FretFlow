import { API_URL } from '../app/persistence';
import type { PracticeSection } from './practiceRoutine';

export class PracticeConflict extends Error {}

export async function loadRemotePractice(scoreId: string): Promise<{ sections: PracticeSection[]; rev: number }> {
  const res = await fetch(`${API_URL}/api/scores/${encodeURIComponent(scoreId)}/practice`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Practice sync could not load (${res.status}).`);
  return res.json() as Promise<{ sections: PracticeSection[]; rev: number }>;
}

export async function saveRemotePractice(scoreId: string, sections: PracticeSection[], rev: number): Promise<number> {
  const res = await fetch(`${API_URL}/api/scores/${encodeURIComponent(scoreId)}/practice`, {
    method: 'PUT', credentials: 'include',
    headers: { 'content-type': 'application/json', 'if-match': String(rev) },
    body: JSON.stringify({ sections }),
  });
  if (res.status === 409) throw new PracticeConflict('Practice changed on another device. Your changes remain saved here; reload after resolving the conflict.');
  if (!res.ok) throw new Error(`Practice sync could not save (${res.status}).`);
  return ((await res.json()) as { rev: number }).rev;
}
