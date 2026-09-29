import 'fake-indexeddb/auto';
import { createScore, setOp, applyOps, type Score, type Transaction } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { AutoSaver, type Timers } from './autosave';
import { IndexedDbScoreStore, LocalMediaStore, openFretFlowDb, TXLOG_LIMIT } from './indexedDb';
import { RemoteScoreStore, type Fetch } from './remote';
import { ScoreSync } from './sync';
import { ConflictError } from './types';

let dbCount = 0;
const freshDb = () => openFretFlowDb(`test-${++dbCount}`);
const tx = (label: string): Transaction => ({ id: label, ops: [], label, at: 0 });

describe('IndexedDbScoreStore', () => {
  it('saves, lists newest first, loads and deletes', async () => {
    let t = 0;
    const store = new IndexedDbScoreStore(await freshDb(), () => ++t);
    const a = createScore({ title: 'A' });
    const b = createScore({ title: 'B' });
    await store.save(a, null);
    await store.save(b, null);
    expect((await store.list()).map(s => s.title)).toEqual(['B', 'A']);
    expect((await store.load(a.id))?.score).toEqual(a);
    await store.delete(a.id);
    expect(await store.load(a.id)).toBeNull();
  });

  it('bumps the local revision on every save and keeps the newest log entries', async () => {
    const store = new IndexedDbScoreStore(await freshDb());
    const score = createScore();
    for (let i = 0; i < TXLOG_LIMIT + 5; i++) {
      await store.save(score, tx(`t${i}`));
    }
    expect((await store.load(score.id))?.rev).toBe(TXLOG_LIMIT + 5);
    const log = await store.txlog(score.id);
    expect(log).toHaveLength(TXLOG_LIMIT);
    expect(log[0].label).toBe('t5');
  });

  it('survives reopening the database (reload)', async () => {
    const name = `reload-${++dbCount}`;
    const score = createScore({ title: 'Kept' });
    await new IndexedDbScoreStore(await openFretFlowDb(name)).save(score, null);
    const reopened = new IndexedDbScoreStore(await openFretFlowDb(name));
    expect((await reopened.load(score.id))?.score.meta.title).toBe('Kept');
  });
});

describe('LocalMediaStore', () => {
  it('keeps beat maps per score apart from the score document', async () => {
    const media = new LocalMediaStore(await freshDb());
    await media.putSyncMap({ scoreId: 's1', audioId: 'a1', anchors: [{ tick: 0, seconds: 1 }], offsetMs: 0, updatedAt: 1 });
    expect(await media.syncMapsFor('s1')).toHaveLength(1);
    expect(await media.syncMapsFor('s2')).toHaveLength(0);
  });
});

function manualTimers() {
  const queue: (() => void)[] = [];
  const timers: Timers = {
    set: fn => {
      queue.push(fn);
      return queue.length - 1;
    },
    clear: h => {
      queue[h as number] = () => {};
    },
  };
  return { timers, fire: () => queue.splice(0).forEach(fn => fn()) };
}

describe('AutoSaver', () => {
  it('debounces many edits into one save with every transaction', async () => {
    const saved: [Score, Transaction[]][] = [];
    const { timers, fire } = manualTimers();
    const saver = new AutoSaver(async (s, t) => void saved.push([s, t]), undefined, 1000, timers);
    const score = createScore();
    saver.schedule(score, tx('a'));
    saver.schedule(score, tx('b'));
    fire();
    await saver.flush();
    expect(saved).toHaveLength(1);
    expect(saved[0][1].map(t => t.label)).toEqual(['a', 'b']);
    expect(saver.status).toBe('saved');
  });

  it('reports an error and retries the same changes on the next flush', async () => {
    let fail = true;
    const saved: Transaction[][] = [];
    const statuses: string[] = [];
    const saver = new AutoSaver(
      async (_s, t) => {
        if (fail) {
          throw new Error('quota');
        }
        saved.push(t);
      },
      s => statuses.push(s),
      1000,
      manualTimers().timers,
    );
    saver.schedule(createScore(), tx('a'));
    await saver.flush();
    expect(saver.status).toBe('error');
    fail = false;
    await saver.flush();
    expect(saved[0].map(t => t.label)).toEqual(['a']);
    expect(statuses).toContain('error');
  });
});

function fakeServer() {
  const rows = new Map<string, { snapshot: Score; rev: number }>();
  const fetchImpl: Fetch = async (url, init) => {
    const method = init?.method ?? 'GET';
    const path = url.replace('http://api', '');
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (path === '/api/scores' && method === 'GET') {
      return json(200, { scores: [...rows].map(([id, r]) => ({ id, title: r.snapshot.meta.title, updated_at: new Date(0).toISOString(), rev: r.rev })) });
    }
    if (path === '/api/scores' && method === 'POST') {
      const { snapshot } = JSON.parse(String(init?.body)) as { snapshot: Score };
      if (rows.has(snapshot.id)) {
        return json(409, { error: { code: 'conflict', message: 'exists' } });
      }
      rows.set(snapshot.id, { snapshot, rev: 1 });
      return json(201, { id: snapshot.id, rev: 1 });
    }
    const id = path.split('/')[3];
    const row = rows.get(id);
    if (method === 'GET') {
      return row ? json(200, { id, snapshot: row.snapshot, rev: row.rev }) : json(404, {});
    }
    if (method === 'PUT' && row) {
      const ifMatch = Number((init?.headers as Record<string, string>)['if-match']);
      if (ifMatch !== row.rev) {
        return json(409, { error: { code: 'conflict', message: 'rev' }, rev: row.rev, updated_at: 'x' });
      }
      row.snapshot = (JSON.parse(String(init?.body)) as { snapshot: Score }).snapshot;
      row.rev++;
      return json(200, { rev: row.rev });
    }
    return json(404, {});
  };
  return { rows, fetchImpl };
}

describe('ScoreSync', () => {
  it('uploads dirty local scores, then only sends what changed', async () => {
    const server = fakeServer();
    const local = new IndexedDbScoreStore(await freshDb());
    const sync = new ScoreSync(local, new RemoteScoreStore('http://api', server.fetchImpl));
    const score = createScore({ title: 'Offline' });
    await local.save(score, null);
    expect((await sync.pushDirty()).uploaded).toEqual([score.id]);
    expect(server.rows.get(score.id)?.rev).toBe(1);
    expect((await sync.pushDirty()).uploaded).toEqual([]);
  });

  it('reports a 409 when another device saved first, and can overwrite or take the server copy', async () => {
    const server = fakeServer();
    const local = new IndexedDbScoreStore(await freshDb());
    const sync = new ScoreSync(local, new RemoteScoreStore('http://api', server.fetchImpl));
    const score = createScore({ title: 'Mine' });
    await local.save(score, null);
    await sync.pushDirty();
    // Another device bumps the server copy.
    const theirs = applyOps(score, [setOp(score, score.id, ['meta', 'title'], 'Theirs')]);
    server.rows.set(score.id, { snapshot: theirs, rev: 2 });
    await local.save(applyOps(score, [setOp(score, score.id, ['meta', 'title'], 'Mine 2')]), null);

    const result = await sync.pushDirty();
    expect(result.conflicts).toEqual([{ scoreId: score.id, title: 'Mine 2', latestRev: 2, updatedAt: 'x' }]);

    await sync.overwriteServer(score.id, 2);
    expect(server.rows.get(score.id)?.snapshot.meta.title).toBe('Mine 2');

    server.rows.set(score.id, { snapshot: theirs, rev: 9 });
    expect((await sync.takeServer(score.id))?.meta.title).toBe('Theirs');
    expect((await local.load(score.id))?.score.meta.title).toBe('Theirs');
  });

  it('throws ConflictError from the remote store on rev mismatch', async () => {
    const server = fakeServer();
    const remote = new RemoteScoreStore('http://api', server.fetchImpl);
    const score = createScore();
    await remote.push(score, null);
    await expect(remote.push(score, 5)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('RemoteScoreStore.uploadAudio', () => {
  it('uses the same audio MIME type for the signed URL and the upload', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl: Fetch = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/api/audio/upload-url')) {
        return new Response(JSON.stringify({ id: 'a1', existing: false, uploadUrl: 'https://s3/put' }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'a1', status: 'ready' }), { status: 200 });
    };
    const remote = new RemoteScoreStore('http://api', fetchImpl);
    // Browsers leave File.type empty for some extensions (e.g. .m4a on some systems).
    await remote.uploadAudio(new Blob([new Uint8Array(4)]), 'abc', 1000, 'riff.m4a');
    const asked = JSON.parse(String(calls[0].init?.body)) as { mime: string };
    const put = calls[1].init?.headers as Record<string, string>;
    expect(asked.mime).toBe('audio/mp4');
    expect(put['content-type']).toBe('audio/mp4');
  });

  it('sends the checksum headers the signed URL requires with the upload', async () => {
    const puts: Record<string, string>[] = [];
    const remote = new RemoteScoreStore('http://api', async (url, init) => {
      if (url.endsWith('/upload-url')) {
        return new Response(JSON.stringify({ id: 'a1', existing: false, uploadUrl: 'https://s3/put', uploadHeaders: { 'x-amz-checksum-sha256': 'q83v', 'content-type': 'audio/wav' } }));
      }
      if (url === 'https://s3/put') {
        puts.push(init?.headers as Record<string, string>);
      }
      return new Response(JSON.stringify({ id: 'a1', status: 'ready' }));
    });
    await remote.uploadAudio(new Blob([new Uint8Array(4)], { type: 'audio/wav' }), 'abc', 1000, 'x.wav');
    expect(puts[0]).toEqual({ 'content-type': 'audio/wav', 'x-amz-checksum-sha256': 'q83v' });
  });

  it('refuses files that are not audio before contacting the server', async () => {
    const calls: string[] = [];
    const remote = new RemoteScoreStore('http://api', async url => {
      calls.push(url);
      return new Response('{}');
    });
    await expect(remote.uploadAudio(new Blob([new Uint8Array(4)], { type: 'text/plain' }), 'abc', 1000, 'notes.txt')).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('skips the complete call when the server already has the file', async () => {
    const calls: string[] = [];
    const remote = new RemoteScoreStore('http://api', async url => {
      calls.push(url);
      return new Response(JSON.stringify({ id: 'a1', existing: true }), { status: 200 });
    });
    expect(await remote.uploadAudio(new Blob([new Uint8Array(4)], { type: 'audio/wav' }), 'abc', 1000, 'x.wav')).toBe('a1');
    expect(calls).toEqual(['http://api/api/audio/upload-url']);
  });
});
