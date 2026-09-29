import { beatChildrenKey, carryIndex, locate } from './locate';
import type { Id, NodeKind, NodeOfKind, Score } from './types';

export type Op =
  | { t: 'insertNode'; kind: NodeKind; parentId: Id | null; index: number; node: unknown }
  /** Carries a snapshot of the deleted node and where it was, so the op can be inverted on its own. */
  | { t: 'deleteNode'; kind: NodeKind; id: Id; parentId: Id | null; index: number; node: unknown }
  /** `id` may be the score id for meta fields. `value: undefined` removes the key. */
  | { t: 'setProp'; id: Id; path: string[]; value: unknown; prev: unknown }
  | { t: 'moveNode'; kind: NodeKind; id: Id; newParentId: Id | null; newIndex: number; prevParentId: Id | null; prevIndex: number };

export interface Transaction {
  id: Id;
  ops: Op[];
  label: string;
  at: number;
}

export class OpError extends Error {}

const PARENT_KIND: Record<NodeKind, NodeKind | null> = {
  masterBar: null,
  track: null,
  bar: 'track',
  beat: 'bar',
  note: 'beat',
  key: 'beat',
  hit: 'beat',
};

// --- immutable path helpers -------------------------------------------------

function replaceAt<T>(items: readonly T[], i: number, fn: (item: T) => T): T[] {
  const next = items.slice();
  next[i] = fn(items[i]);
  return next;
}

/** Rewrites the child array of `parentId` (or a root array when parentId is null). */
function updateChildren(score: Score, kind: NodeKind, parentId: Id | null, fn: (items: unknown[]) => unknown[]): Score {
  const parentKind = PARENT_KIND[kind];
  if (parentKind === null) {
    if (parentId !== null) {
      throw new OpError(`${kind} must have a null parent`);
    }
    return kind === 'masterBar'
      ? { ...score, masterBars: fn(score.masterBars) as Score['masterBars'] }
      : { ...score, tracks: fn(score.tracks) as Score['tracks'] };
  }
  if (parentId === null) {
    throw new OpError(`${kind} needs a parent`);
  }
  const loc = locate(score, parentId);
  if (!loc || loc.kind !== parentKind) {
    throw new OpError(`parent ${parentId} of ${kind} not found`);
  }
  const [ti, bi, bei] = loc.path;
  return {
    ...score,
    tracks: replaceAt(score.tracks, ti, track => {
      if (kind === 'bar') {
        return { ...track, bars: fn(track.bars) as typeof track.bars };
      }
      return {
        ...track,
        bars: replaceAt(track.bars, bi, bar => {
          if (kind === 'beat') {
            return { ...bar, beats: fn(bar.beats) as typeof bar.beats };
          }
          const field = beatChildrenKey(kind as 'note' | 'key' | 'hit');
          return {
            ...bar,
            beats: replaceAt(bar.beats, bei, beat => {
              const items = fn(beat[field] ?? []);
              // keys/hits are optional: an emptied list goes away so invert round-trips exactly.
              if (field !== 'notes' && items.length === 0) {
                const { [field]: _gone, ...rest } = beat;
                return rest;
              }
              return { ...beat, [field]: items };
            }),
          };
        }),
      };
    }),
  };
}

function updateNode(score: Score, id: Id, fn: (node: Record<string, unknown>) => Record<string, unknown>): Score {
  if (id === score.id) {
    return fn(score as unknown as Record<string, unknown>) as unknown as Score;
  }
  const loc = locate(score, id);
  if (!loc) {
    throw new OpError(`node ${id} not found`);
  }
  const f = fn as <T>(node: T) => T;
  const p = loc.path;
  switch (loc.kind) {
    case 'masterBar':
      return { ...score, masterBars: replaceAt(score.masterBars, p[0], f) };
    case 'track':
      return { ...score, tracks: replaceAt(score.tracks, p[0], f) };
    case 'bar':
      return { ...score, tracks: replaceAt(score.tracks, p[0], t => ({ ...t, bars: replaceAt(t.bars, p[1], f) })) };
    case 'beat':
      return {
        ...score,
        tracks: replaceAt(score.tracks, p[0], t => ({
          ...t,
          bars: replaceAt(t.bars, p[1], b => ({ ...b, beats: replaceAt(b.beats, p[2], f) })),
        })),
      };
    case 'note':
    case 'key':
    case 'hit': {
      const field = beatChildrenKey(loc.kind);
      return {
        ...score,
        tracks: replaceAt(score.tracks, p[0], t => ({
          ...t,
          bars: replaceAt(t.bars, p[1], b => ({
            ...b,
            beats: replaceAt(b.beats, p[2], be => ({ ...be, [field]: replaceAt((be[field] ?? []) as unknown[], p[3], f) })),
          })),
        })),
      };
    }
  }
}

function setIn(obj: Record<string, unknown>, path: readonly string[], value: unknown): Record<string, unknown> {
  const [head, ...rest] = path;
  const next = { ...obj };
  if (rest.length === 0) {
    if (value === undefined) {
      delete next[head];
    } else {
      next[head] = value;
    }
    return next;
  }
  const child = obj[head];
  const base = child !== null && typeof child === 'object' ? (child as Record<string, unknown>) : {};
  next[head] = setIn(base, rest, value);
  return next;
}

export function getIn(obj: unknown, path: readonly string[]): unknown {
  let cur = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

// --- apply / invert ---------------------------------------------------------

function checkIndex(index: number, length: number, inclusive: boolean): void {
  const max = inclusive ? length : length - 1;
  if (!Number.isInteger(index) || index < 0 || index > max) {
    throw new OpError(`index ${index} out of range 0..${max}`);
  }
}

function applyOp(score: Score, op: Op): Score {
  switch (op.t) {
    case 'insertNode':
      return updateChildren(score, op.kind, op.parentId, items => {
        checkIndex(op.index, items.length, true);
        const next = items.slice();
        next.splice(op.index, 0, op.node);
        return next;
      });
    case 'deleteNode':
      return updateChildren(score, op.kind, op.parentId, items => {
        const i = items.findIndex(item => (item as { id: Id }).id === op.id);
        if (i < 0) {
          throw new OpError(`node ${op.id} not under ${op.parentId}`);
        }
        const next = items.slice();
        next.splice(i, 1);
        return next;
      });
    case 'setProp': {
      if (op.path.length === 0 || op.path[0] === 'id') {
        throw new OpError('setProp cannot replace a node or its id');
      }
      const next = updateNode(score, op.id, node => setIn(node, op.path, op.value));
      carryIndex(score, next);
      return next;
    }
    case 'moveNode': {
      const loc = locate(score, op.id);
      if (!loc) {
        throw new OpError(`node ${op.id} not found`);
      }
      let node: unknown;
      const removed = updateChildren(score, op.kind, op.prevParentId, items => {
        const i = items.findIndex(item => (item as { id: Id }).id === op.id);
        if (i < 0) {
          throw new OpError(`node ${op.id} not under ${op.prevParentId}`);
        }
        node = items[i];
        const next = items.slice();
        next.splice(i, 1);
        return next;
      });
      return updateChildren(removed, op.kind, op.newParentId, items => {
        checkIndex(op.newIndex, items.length, true);
        const next = items.slice();
        next.splice(op.newIndex, 0, node);
        return next;
      });
    }
  }
}

/** Immutable. Throws OpError when an op does not fit the score. */
export function applyOps(score: Score, ops: readonly Op[]): Score {
  let next = score;
  for (const op of ops) {
    next = applyOp(next, op);
  }
  return next;
}

export function invertOp(op: Op): Op {
  switch (op.t) {
    case 'insertNode':
      return { t: 'deleteNode', kind: op.kind, id: (op.node as { id: Id }).id, parentId: op.parentId, index: op.index, node: op.node };
    case 'deleteNode':
      return { t: 'insertNode', kind: op.kind, parentId: op.parentId, index: op.index, node: op.node };
    case 'setProp':
      return { ...op, value: op.prev, prev: op.value };
    case 'moveNode':
      return {
        ...op,
        newParentId: op.prevParentId,
        newIndex: op.prevIndex,
        prevParentId: op.newParentId,
        prevIndex: op.newIndex,
      };
  }
}

export function invert(tx: Transaction): Transaction {
  return { ...tx, ops: tx.ops.map(invertOp).reverse(), label: `undo ${tx.label}` };
}

// --- op builders (read current state so inverses are exact) ----------------

export function insertOp<K extends NodeKind>(kind: K, parentId: Id | null, index: number, node: NodeOfKind[K]): Op {
  return { t: 'insertNode', kind, parentId, index, node };
}

function parentIdOf(score: Score, kind: NodeKind, path: number[]): Id | null {
  const [ti, bi, bei] = path;
  switch (kind) {
    case 'masterBar':
    case 'track':
      return null;
    case 'bar':
      return score.tracks[ti].id;
    case 'beat':
      return score.tracks[ti].bars[bi].id;
    case 'note':
    case 'key':
    case 'hit':
      return score.tracks[ti].bars[bi].beats[bei].id;
  }
}

function nodeAt(score: Score, kind: NodeKind, path: number[]): unknown {
  const [a, b, c, d] = path;
  switch (kind) {
    case 'masterBar':
      return score.masterBars[a];
    case 'track':
      return score.tracks[a];
    case 'bar':
      return score.tracks[a].bars[b];
    case 'beat':
      return score.tracks[a].bars[b].beats[c];
    case 'note':
    case 'key':
    case 'hit':
      return score.tracks[a].bars[b].beats[c][beatChildrenKey(kind)]?.[d];
  }
}

export function deleteOp(score: Score, id: Id): Op {
  const loc = locate(score, id);
  if (!loc) {
    throw new OpError(`node ${id} not found`);
  }
  return {
    t: 'deleteNode',
    kind: loc.kind,
    id,
    parentId: parentIdOf(score, loc.kind, loc.path),
    index: loc.path[loc.path.length - 1],
    node: nodeAt(score, loc.kind, loc.path),
  };
}

export function setOp(score: Score, id: Id, path: string[], value: unknown): Op {
  const node = id === score.id ? score : (() => {
    const loc = locate(score, id);
    if (!loc) {
      throw new OpError(`node ${id} not found`);
    }
    return nodeAt(score, loc.kind, loc.path);
  })();
  return { t: 'setProp', id, path, value, prev: getIn(node, path) };
}

/** Moves a node; `newIndex` is its index after it has been removed from the old place. */
export function moveOp(score: Score, id: Id, newParentId: Id | null, newIndex: number): Op {
  const loc = locate(score, id);
  if (!loc) {
    throw new OpError(`node ${id} not found`);
  }
  return {
    t: 'moveNode',
    kind: loc.kind,
    id,
    newParentId,
    newIndex,
    prevParentId: parentIdOf(score, loc.kind, loc.path),
    prevIndex: loc.path[loc.path.length - 1],
  };
}
