// Local-first store (Contracts 1, D04). Every write becomes an op persisted to AsyncStorage first,
// applied to the cached data at once, then sent to the apply_ops RPC. Replays are safe (AC03).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from './auth';
import { supabase } from './supabase';
import { EMPTY, type Data, type Entity, type Op } from './types';

export function uuid(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const TABLES = Object.keys(EMPTY) as Entity[];
const PAGE = 1000; // PostgREST default max rows per request

async function fetchAll(t: Entity): Promise<{ rows: any[]; error: string | null }> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(t).select('*').order('id').range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { rows, error: null };
  }
}

function isProtected(op: Pick<Op, 'entity' | 'kind' | 'payload'>) {
  if (op.entity === 'time_logs' || op.entity === 'active_timer' || op.entity === 'progress_entries') return true;
  return (op.entity === 'blocks' || op.entity === 'chunks') && (op.kind === 'delete' || 'status' in op.payload);
}

// Server bumps rev by exactly 1 per accepted update, so the local copy mirrors it.
function applyLocal(data: Data, op: Op): Data {
  const rows = data[op.entity] as any[];
  let next: any[];
  if (op.kind === 'insert') next = [...rows.filter((r) => r.id !== op.row_id), { ...op.payload, id: op.row_id, rev: 1 }];
  else if (op.kind === 'update') next = rows.map((r) => (r.id === op.row_id ? { ...r, ...op.payload, rev: r.rev + 1 } : r));
  else next = rows.filter((r) => r.id !== op.row_id);
  return { ...data, [op.entity]: next };
}

export type WriteInput = { entity: Entity; kind: Op['kind']; row_id?: string; payload?: Record<string, unknown> };
type SyncStatus = { syncing: boolean; lastSync: string | null; error: string | null; loaded: boolean };

type StoreValue = {
  data: Data;
  queue: Op[];
  status: SyncStatus;
  deviceId: string;
  write: (ops: WriteInput[]) => Promise<string[]>;
  sync: () => Promise<void>;
  dismissOp: (opId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<any>;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [data, setData] = useState<Data>(EMPTY);
  const [queue, setQueue] = useState<Op[]>([]);
  const [status, setStatus] = useState<SyncStatus>({ syncing: false, lastSync: null, error: null, loaded: false });
  const [deviceId, setDeviceId] = useState('');
  const dataRef = useRef(data);
  const queueRef = useRef(queue);
  const syncing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = (k: string) => `sg:${uid}:${k}`;
  // a sync started for one account must not write into another account's state
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const saveQueue = useCallback(async (q: Op[]) => {
    if (uidRef.current !== uid) return;
    queueRef.current = q;
    setQueue(q);
    if (uid) await AsyncStorage.setItem(`sg:${uid}:queue`, JSON.stringify(q));
  }, [uid]);

  const saveData = useCallback(async (d: Data) => {
    if (uidRef.current !== uid) return;
    dataRef.current = d;
    setData(d);
    if (uid) await AsyncStorage.setItem(`sg:${uid}:data`, JSON.stringify(d));
  }, [uid]);

  const sync = useCallback(async () => {
    if (!uid || syncing.current) return;
    syncing.current = true;
    setStatus((s) => ({ ...s, syncing: true }));
    let error: string | null = null;
    try {
      const toSend = queueRef.current.filter((o) => o.state === 'pending' || o.state === 'failed' || o.state === 'sent');
      if (toSend.length) {
        const ids = new Set(toSend.map((o) => o.op_id));
        await saveQueue(queueRef.current.map((o) => (ids.has(o.op_id) ? { ...o, state: 'sent' } : o)));
        const { data: res, error: rpcError } = await supabase.rpc('apply_ops', {
          ops: toSend.map(({ op_id, entity, kind, row_id, base_rev, payload }) => ({ op_id, entity, kind, row_id, base_rev, payload })),
        });
        if (rpcError) {
          error = rpcError.message;
          await saveQueue(queueRef.current.map((o) => (ids.has(o.op_id) ? { ...o, state: 'failed', error: rpcError.message } : o)));
        } else {
          const byId = new Map<string, any>((res as any[]).map((r) => [r.op_id, r]));
          await saveQueue(
            queueRef.current
              .filter((o) => byId.get(o.op_id)?.status !== 'applied')
              .map((o) => {
                const r = byId.get(o.op_id);
                return r ? { ...o, state: r.status, error: r.error } : o;
              })
          );
        }
      }
      if (!error) {
        const results = await Promise.all(TABLES.map(fetchAll));
        const failed = results.find((r) => r.error);
        if (failed?.error) error = failed.error;
        else if (uidRef.current === uid) {
          let next = { ...EMPTY } as Data;
          TABLES.forEach((t, i) => ((next as any)[t] = results[i].rows));
          // only ops written during this sync are re-applied; sent ones are already in the fetched rows
          for (const o of queueRef.current) if (o.state === 'pending') next = applyLocal(next, o);
          await saveData(next);
        }
      }
    } catch (e: any) {
      error = e?.message ?? String(e);
      await saveQueue(queueRef.current.map((o) => (o.state === 'sent' ? { ...o, state: 'failed', error: error! } : o)));
    } finally {
      syncing.current = false;
      if (queueRef.current.some((o) => o.state === 'pending')) setTimeout(() => void syncRef.current(), 400);
      setStatus((s) => ({ ...s, syncing: false, error, lastSync: error ? s.lastSync : new Date().toISOString() }));
    }
  }, [uid, saveQueue, saveData]);

  const syncRef = useRef(sync);
  syncRef.current = sync;

  const soon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void sync(), 400);
  }, [sync]);

  const write = useCallback(async (inputs: WriteInput[]) => {
    let d = dataRef.current;
    const ops: Op[] = inputs.map((i) => {
      const row_id = i.row_id ?? uuid();
      const payload = i.payload ?? {};
      const op: Op = { op_id: uuid(), entity: i.entity, kind: i.kind, row_id, payload, created_at: new Date().toISOString(), state: 'pending' };
      if (i.kind !== 'insert' && isProtected(op)) {
        const cur = (d[i.entity] as any[]).find((r) => r.id === row_id);
        if (cur) op.base_rev = cur.rev;
      }
      d = applyLocal(d, op);
      return op;
    });
    // both refs update synchronously, so a second write during the awaits sees this one
    await Promise.all([saveQueue([...queueRef.current, ...ops]), saveData(d)]);
    soon();
    return ops.map((o) => o.row_id);
  }, [saveQueue, saveData, soon]);

  const dismissOp = useCallback(async (opId: string) => {
    await saveQueue(queueRef.current.filter((o) => o.op_id !== opId));
    soon();
  }, [saveQueue, soon]);

  const clearQueue = useCallback(async () => {
    await saveQueue([]);
    soon();
  }, [saveQueue, soon]);

  const rpc = useCallback(async (fn: string, args: Record<string, unknown>) => {
    const { data: res, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(error.message);
    soon();
    return res;
  }, [soon]);

  useEffect(() => {
    if (!uid) {
      dataRef.current = EMPTY;
      queueRef.current = [];
      setData(EMPTY);
      setQueue([]);
      return;
    }
    let live = true;
    (async () => {
      let dev = await AsyncStorage.getItem('sg:device');
      if (!dev) await AsyncStorage.setItem('sg:device', (dev = uuid()));
      const [d, q] = await Promise.all([AsyncStorage.getItem(key('data')), AsyncStorage.getItem(key('queue'))]);
      if (!live) return;
      setDeviceId(dev);
      dataRef.current = d ? { ...EMPTY, ...JSON.parse(d) } : EMPTY;
      queueRef.current = q ? JSON.parse(q) : [];
      setData(dataRef.current);
      setQueue(queueRef.current);
      setStatus((s) => ({ ...s, loaded: true }));
      void sync();
    })();
    const iv = setInterval(() => void sync(), 60_000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void sync());
    return () => {
      live = false;
      clearInterval(iv);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const value = useMemo(
    () => ({ data, queue, status, deviceId, write, sync, dismissOp, clearQueue, rpc }),
    [data, queue, status, deviceId, write, sync, dismissOp, clearQueue, rpc]
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
