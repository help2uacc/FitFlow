"use client";
/**
 * Offline support: an IndexedDB outbox for log entries created while offline
 * (synchronised idempotently via client IDs) and a per-device snapshot of the
 * current plans for offline viewing. Private data never goes into the
 * service-worker cache.
 */
import { api, ApiError } from "./client";

const DB_NAME = "fitflow";
const VERSION = 1;
export type OutboxOp =
  | { type: "start_workout"; payload: { clientId: string; date: string; sessionId?: string | null; title?: string } }
  | { type: "log_set"; payload: Record<string, unknown> & { clientId: string } }
  | { type: "workout_status"; payload: { clientId: string; workoutClientId?: string; workoutId?: string; action: string } }
  | { type: "log_food"; payload: Record<string, unknown> & { clientId: string } }
  | { type: "log_planned_meal"; payload: Record<string, unknown> & { clientId: string } }
  | { type: "log_weight"; payload: { clientId: string; date: string; weightKg: number } };
type Stored = OutboxOp & { id: string; createdAt: number };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexeddb"));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("snapshot")) db.createObjectStore("snapshot");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => { resolve(r ? (r.result as T) : undefined); db.close(); };
    t.onerror = () => { reject(t.error); db.close(); };
  });
}

export async function queueOp(op: OutboxOp) {
  await tx("outbox", "readwrite", (s) => s.put({ ...op, id: op.payload.clientId, createdAt: Date.now() } as Stored));
  window.dispatchEvent(new Event("ff-outbox"));
}

export async function outboxCount(): Promise<number> {
  try {
    return (await tx<number>("outbox", "readonly", (s) => s.count())) ?? 0;
  } catch {
    return 0;
  }
}

async function allOps(): Promise<Stored[]> {
  return ((await tx<Stored[]>("outbox", "readonly", (s) => s.getAll())) ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

let flushing = false;
export async function flushOutbox(): Promise<{ synced: number; conflicts: number; failed: number }> {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return { synced: 0, conflicts: 0, failed: 0 };
  flushing = true;
  try {
    const ops = await allOps();
    if (!ops.length) return { synced: 0, conflicts: 0, failed: 0 };
    const res = await api<{ results: { id: string; ok: boolean; conflict?: boolean; retry?: boolean; error?: string }[] }>("/api/sync", { body: { ops: ops.map(({ id: _id, createdAt, ...op }) => ({ ...op, createdAt })) } });
    let synced = 0, conflicts = 0, failed = 0;
    for (const r of res.results) {
      if (r.ok || !r.retry) {
        await tx("outbox", "readwrite", (s) => s.delete(r.id));
        if (r.conflict) conflicts++;
        else if (r.ok) synced++;
        else failed++;
      }
    }
    window.dispatchEvent(new Event("ff-outbox"));
    if (synced || conflicts) window.dispatchEvent(new CustomEvent("ff-synced", { detail: { synced, conflicts } }));
    return { synced, conflicts, failed };
  } catch {
    return { synced: 0, conflicts: 0, failed: 0 };
  } finally {
    flushing = false;
  }
}

export function startSyncLoop() {
  const run = () => void flushOutbox();
  window.addEventListener("online", run);
  const t = setInterval(run, 30000);
  run();
  return () => { window.removeEventListener("online", run); clearInterval(t); };
}

/**
 * Perform a write through the API, or queue it in the outbox when offline.
 * Returns `{ queued: true }` when stored locally.
 */
export async function submitOrQueue<T>(op: OutboxOp, call: () => Promise<T>): Promise<{ queued: false; data: T } | { queued: true }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await queueOp(op);
    return { queued: true };
  }
  try {
    return { queued: false, data: await call() };
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      await queueOp(op);
      return { queued: true };
    }
    throw e;
  }
}

export async function saveSnapshot(key: string, data: unknown) {
  try { await tx("snapshot", "readwrite", (s) => s.put({ data, savedAt: Date.now() }, key)); } catch { /* storage unavailable */ }
}
export async function loadSnapshot<T>(key: string): Promise<{ data: T; savedAt: number } | null> {
  try { return ((await tx("snapshot", "readonly", (s) => s.get(key))) as { data: T; savedAt: number } | undefined) ?? null; } catch { return null; }
}
export async function clearOfflineData() {
  try {
    await tx("snapshot", "readwrite", (s) => s.clear());
    await tx("outbox", "readwrite", (s) => s.clear());
  } catch { /* ignore */ }
}
