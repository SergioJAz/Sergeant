// Android local notifications (Contracts 10). Web: none in v1.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { activeChunks, blockEndMs, blockStartMs, blocksOn, fixedOn, getConfig, getTz, pressure, remainingMin, timerElapsed } from './domain';
import { useStore } from './store';
import { addDays, hmToMin, localDate, localHM, toInstant } from './time';
import type { Data } from './types';

const HORIZON_MS = 48 * 3600_000;
export type NotifyState = { permission: 'granted' | 'denied' | 'undetermined' | 'unsupported'; scheduledThrough: string | null; scheduledAt: string | null; count: number };

let state: NotifyState = { permission: Platform.OS === 'web' ? 'unsupported' : 'undetermined', scheduledThrough: null, scheduledAt: null, count: 0 };
const listeners = new Set<() => void>();
function setState(s: Partial<NotifyState>) {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
  void AsyncStorage.setItem('sg:notify', JSON.stringify(state));
}
export function useNotifyState() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state, () => state);
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export type Planned = { at: number; title: string; body: string; kind: string };

// Pure: everything that should fire in the next 48 h, quiet hours applied.
export function planNotifications(data: Data, now: number): Planned[] {
  const cfg = getConfig(data);
  const tz = getTz(data);
  const n = cfg.notify;
  const end = now + HORIZON_MS;
  const out: Planned[] = [];
  const course = (id: string | null) => data.courses.find((c) => c.id === id)?.short ?? '';

  const quiet = (at: number) => {
    const d = localDate(at, tz);
    const m = hmToMin(localHM(at, tz));
    if (m >= hmToMin(cfg.hard_stop) || m < hmToMin(cfg.wake)) return true;
    return fixedOn(data, d).some((f) => (f.kind === 'class' || f.kind === 'sport') && m >= hmToMin(f.start_time) && m < hmToMin(f.end_time));
  };
  const add = (p: Planned, suppressible: boolean) => {
    if (p.at > now && p.at <= end && !(suppressible && quiet(p.at))) out.push(p);
  };

  const today = localDate(now, tz);
  for (const date of [addDays(today, -1), today, addDays(today, 1), addDays(today, 2)]) {
    for (const b of blocksOn(data, date)) {
      if (b.status !== 'planned' || b.type === 'Fixed') continue;
      const label = `${course(b.course_id)} ${b.what ?? b.type}`.trim();
      if (n.block_start) add({ at: blockStartMs(b, tz), title: 'Block starting', body: `${b.start_time.slice(0, 5)} ${label}`, kind: 'block_start' }, true);
      if (n.block_end) add({ at: blockEndMs(b, tz), title: 'Block ending', body: `${label}: tick it done, partial or skipped`, kind: 'block_end' }, true);
      if (n.nag) add({ at: blockEndMs(b, tz) + 10 * 60_000, title: 'Unticked block', body: `${label} ended without a tick`, kind: 'nag' }, true);
    }
    if (n.summary) {
      const blocks = blocksOn(data, date).filter((b) => b.status === 'planned' && b.type !== 'Fixed');
      const top = data.items.filter((i) => i.status === 'active').map((i) => ({ i, p: pressure(data, i, now) })).sort((a, b) => b.p - a.p)[0];
      add({ at: toInstant(date, cfg.wake, tz), title: 'Today', body: `${blocks.length} study blocks.${top ? ` Top: ${course(top.i.course_id)} ${top.i.title}` : ''}`, kind: 'summary' }, false);
    }
  }
  if (n.deadline) {
    for (const i of data.items) {
      if (i.status !== 'active' || !i.due_at) continue;
      const left = activeChunks(data, i.id).reduce((s, c) => s + remainingMin(data, c), 0);
      for (const d of n.deadline_days) {
        add({ at: Date.parse(i.due_at) - d * 86_400_000, title: `Due in ${d} day${d === 1 ? '' : 's'}`, body: `${course(i.course_id)} ${i.title}${left ? `, ${left} min left` : ''}`, kind: 'deadline' }, true);
      }
    }
  }
  // Timer alerts Sergio started are never suppressed (Contracts 10).
  for (const t of data.active_timer) {
    if (t.state !== 'running') continue;
    const at = now + (Number(t.phase_target_ms) - timerElapsed(t, now));
    if ((t.phase === 'study' && n.block_end) || (t.phase === 'break' && n.break_end)) {
      add({ at, title: t.phase === 'study' ? 'Study block done' : 'Break over', body: t.phase === 'study' ? 'Take your break and tick the block.' : 'Back to work.', kind: 'timer' }, false);
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export async function requestPermission() {
  if (Platform.OS === 'web') return 'unsupported';
  const r = await Notifications.requestPermissionsAsync();
  setState({ permission: r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied' });
  return r.granted;
}

async function reschedule(data: Data) {
  const perm = await Notifications.getPermissionsAsync();
  const permission = perm.granted ? 'granted' : perm.canAskAgain ? 'undetermined' : 'denied';
  if (!perm.granted) return setState({ permission, count: 0, scheduledThrough: null });
  await Notifications.setNotificationChannelAsync('default', { name: 'Study reminders', importance: Notifications.AndroidImportance.HIGH });
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = Date.now();
  const list = planNotifications(data, now);
  for (const p of list) {
    await Notifications.scheduleNotificationAsync({
      content: { title: p.title, body: p.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(p.at), channelId: 'default' },
    });
  }
  setState({ permission, count: list.length, scheduledAt: new Date(now).toISOString(), scheduledThrough: new Date(now + HORIZON_MS).toISOString() });
}

// One reschedule at a time; a change during a run triggers one more run with the newest data.
let running: Promise<void> | null = null;
let latest: Data | null = null;
function queueReschedule(data: Data) {
  latest = data;
  if (running) return;
  running = (async () => {
    while (latest) {
      const d = latest;
      latest = null;
      await reschedule(d).catch(() => undefined);
    }
  })().finally(() => (running = null));
}

// Reschedules on app open and whenever plan or timer data changes.
export function useNotificationSync() {
  const { data, status } = useStore();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    void AsyncStorage.getItem('sg:notify').then((s) => s && setState({ ...JSON.parse(s), permission: state.permission }));
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web' || !status.loaded) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => queueReschedule(data), 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, status.loaded]);
}
