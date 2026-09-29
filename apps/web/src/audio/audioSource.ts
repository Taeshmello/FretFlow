import { AudioLoadError } from '@fretflow/audio-engine';
import { sha256Hex } from '@fretflow/storage';
import type { SyncMap } from '@fretflow/audio-engine';
import type { persistence } from '../app/persistence';

type Persist = Awaited<ReturnType<typeof persistence>>;

/** Another device saved audio + beat map for this score: download once and keep it locally. */
export async function pullFromCloud(p: Persist, scoreId: string) {
  const remote = p.remote;
  const [map] = remote ? await remote.syncMaps(scoreId) : [];
  if (!remote || !map) {
    return undefined;
  }
  const blob = await remote.downloadAudio(map.audioId);
  const id = await sha256Hex(await blob.arrayBuffer());
  const stored = { id, blob, name: '클라우드 음원', type: blob.type, size: blob.size, durationMs: 0, remoteId: map.audioId };
  await p.media.putAudio(stored);
  await p.media.setPref(`audio:${scoreId}`, id);
  await p.media.putSyncMap({ scoreId, audioId: id, anchors: map.anchors, offsetMs: map.offsetMs, updatedAt: Date.now() });
  return stored;
}


export function loadErrorMessage(err: unknown): string {
  if (err instanceof AudioLoadError) {
    return { tooLarge: '100MB 이하 파일만 올릴 수 있습니다.', tooLong: '15분 이하 음원만 지원합니다.', decodeFailed: '이 파일을 재생할 수 없습니다.' }[err.code];
  }
  return String(err);
}

/** Keeps the file in IndexedDB (keyed by sha256) and remembers it for this score. */
export async function saveLocalAudio(p: Persist, scoreId: string, file: File): Promise<string> {
  const id = await sha256Hex(await file.arrayBuffer());
  await p.media.putAudio({ id, blob: file, name: file.name, type: file.type, size: file.size, durationMs: 0 });
  await p.media.setPref(`audio:${scoreId}`, id);
  return id;
}

/** Cloud copy only when signed in; the audio goes up once (sha256 dedupe on the server). */
export async function pushToCloud(p: Persist, scoreId: string, audioId: string, map: SyncMap, durationSeconds: number): Promise<void> {
  if (!p.remote) {
    return;
  }
  try {
    const stored = await p.media.getAudio(audioId);
    if (!stored) {
      return;
    }
    let remoteId = stored.remoteId;
    if (!remoteId) {
      remoteId = await p.remote.uploadAudio(stored.blob, stored.id, durationSeconds * 1000, stored.name);
      await p.media.putAudio({ ...stored, remoteId });
    }
    await p.remote.putSyncMap(scoreId, remoteId, map.anchors, map.offsetMs);
  } catch {
    // Signed out, offline or score not uploaded yet: the local copy is enough for now.
  }
}
