import { migrateScore, type Id, type Score, type Transaction } from '@fretflow/score-model';
import { ConflictError, StorageError, type ScoreStore, type ScoreSummary } from './types';

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class UnauthorizedError extends StorageError {}

/**
 * Talks to services/api (BACKEND.md §5). Keeps the last known server rev per
 * score so PUT can send If-Match.
 */
export class RemoteScoreStore implements ScoreStore {
  private readonly revs = new Map<Id, number>();

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: Fetch = (i, init) => fetch(i, init),
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    if (res.status === 401) {
      throw new UnauthorizedError('Not signed in.');
    }
    return res;
  }

  knownRev(id: Id): number | undefined {
    return this.revs.get(id);
  }

  setKnownRev(id: Id, rev: number): void {
    this.revs.set(id, rev);
  }

  async list(): Promise<ScoreSummary[]> {
    const res = await this.request('/api/scores');
    if (!res.ok) {
      throw new StorageError(`list failed (${res.status})`);
    }
    const body = (await res.json()) as { scores: { id: Id; title: string; updated_at: string; rev: number }[] };
    return body.scores.map(s => {
      this.revs.set(s.id, s.rev);
      return { id: s.id, title: s.title, updatedAt: Date.parse(s.updated_at), rev: s.rev };
    });
  }

  async load(id: Id): Promise<{ score: Score; rev: number } | null> {
    const res = await this.request(`/api/scores/${encodeURIComponent(id)}`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new StorageError(`load failed (${res.status})`);
    }
    const body = (await res.json()) as { snapshot: unknown; rev: number };
    this.revs.set(id, body.rev);
    return { score: migrateScore(body.snapshot), rev: body.rev };
  }

  /** POST when the server has never seen the score, PUT with If-Match otherwise. Returns the new server rev. */
  async push(score: Score, baseRev: number | null): Promise<number> {
    const body = JSON.stringify({ snapshot: score });
    const res =
      baseRev === null
        ? await this.request('/api/scores', { method: 'POST', body })
        : await this.request(`/api/scores/${encodeURIComponent(score.id)}`, {
            method: 'PUT',
            body,
            headers: { 'if-match': String(baseRev) },
          });
    if (res.status === 409) {
      const info = (await res.json().catch(() => ({}))) as { rev?: number; updated_at?: string };
      if (baseRev === null && info.rev === undefined) {
        // Id already exists on the server (created from another device): treat as a conflict at rev 0.
        throw new ConflictError(0, null);
      }
      throw new ConflictError(info.rev ?? 0, info.updated_at ?? null);
    }
    if (res.status === 413) {
      throw new StorageError('The score is too large to upload (5MB limit).');
    }
    if (!res.ok) {
      throw new StorageError(`save failed (${res.status})`);
    }
    const out = (await res.json()) as { rev: number };
    this.revs.set(score.id, out.rev);
    return out.rev;
  }

  async save(score: Score, _tx: Transaction | null): Promise<void> {
    await this.push(score, this.revs.get(score.id) ?? null);
  }

  async delete(id: Id): Promise<void> {
    const res = await this.request(`/api/scores/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      throw new StorageError(`delete failed (${res.status})`);
    }
    this.revs.delete(id);
  }

  async putSyncMap(scoreId: Id, audioId: string, anchors: { tick: number; seconds: number }[], offsetMs: number): Promise<void> {
    const res = await this.request(`/api/scores/${encodeURIComponent(scoreId)}/sync-maps/${encodeURIComponent(audioId)}`, {
      method: 'PUT',
      body: JSON.stringify({ anchors, offset_ms: offsetMs }),
    });
    if (!res.ok) {
      throw new StorageError(`sync map save failed (${res.status})`);
    }
  }

  /**
   * Signed upload flow: ask for a URL (or get an existing id), PUT the bytes, mark complete.
   * The same MIME type goes into the signature request and the PUT, or S3 rejects the signature.
   */
  async uploadAudio(file: Blob, sha256: string, durationMs: number, fileName = ''): Promise<string> {
    const mime = audioMimeType(file.type, fileName);
    if (!mime) {
      throw new StorageError('Only audio files can be uploaded.');
    }
    const res = await this.request('/api/audio/upload-url', {
      method: 'POST',
      body: JSON.stringify({ sha256, size: file.size, mime }),
    });
    if (!res.ok) {
      throw new StorageError(`upload url failed (${res.status})`);
    }
    const body = (await res.json()) as { id: string; uploadUrl?: string; uploadHeaders?: Record<string, string>; existing?: boolean };
    if (body.existing) {
      return body.id;
    }
    if (body.uploadUrl) {
      // The server may bind a checksum (and type) into the signature; those headers must be sent as-is.
      const headers = { 'content-type': mime, ...(body.uploadHeaders ?? {}) };
      const put = await this.fetchImpl(body.uploadUrl, { method: 'PUT', body: file, headers });
      if (!put.ok) {
        throw new StorageError(`upload failed (${put.status})`);
      }
    }
    const done = await this.request(`/api/audio/${encodeURIComponent(body.id)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ duration_ms: Math.round(durationMs) }),
    });
    if (!done.ok) {
      throw new StorageError(`upload complete failed (${done.status})`);
    }
    return body.id;
  }
}

const AUDIO_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
};

/** The browser's type when it is audio, else a guess from the extension; null when it is not audio. */
export function audioMimeType(type: string, fileName: string): string | null {
  if (type.startsWith('audio/')) {
    return type;
  }
  if (type) {
    return null;
  }
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return AUDIO_BY_EXTENSION[ext] ?? null;
}
