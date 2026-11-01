import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SyncStatus } from '@/components/SyncStatus';
import { useAuth } from '@/lib/auth';
import { DEFAULT_CONFIG, getConfig, getTz, timerElapsed } from '@/lib/domain';
import { saveFile } from '@/lib/files';
import { requestPermission, useNotifyState } from '@/lib/notify';
import { useStore, type WriteInput } from '@/lib/store';
import { WEEKDAYS } from '@/lib/time';
import type { Conflict, FixedEvent, Oneoff } from '@/lib/types';
import { Banner, Btn, Card, Chips, Field, H, Row, Screen, SmallBtn, T, Toggle, useTheme } from '@/lib/ui';

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const { data, write, queue, sync, dismissOp, clearQueue, status } = useStore();
  const t = useTheme();
  const notify = useNotifyState();
  const cfg = getConfig(data);
  const settings = data.settings[0];
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [logoutAsk, setLogoutAsk] = useState(false);
  const [typed, setTyped] = useState('');

  const [r, setR] = useState(() => toForm(cfg, getTz(data)));
  useEffect(() => setR(toForm(cfg, getTz(data))), [settings?.rev]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveConfig(patch: Record<string, unknown>, tz?: string) {
    const config = { ...(settings?.config ?? {}), ...patch };
    await write([settings
      ? { entity: 'settings', kind: 'update', row_id: settings.id, payload: { config, ...(tz ? { timezone: tz } : {}) } }
      : { entity: 'settings', kind: 'insert', payload: { config, timezone: tz ?? 'Asia/Beirut' } }]);
  }

  async function saveRules() {
    const times = [r.wake, r.hard_stop, r.review_start, r.review_end, r.lunch_start, r.lunch_end, r.sunday_off_from];
    if (!times.every((x) => HM.test(x))) return setError('Times must be HH:MM.');
    const nums = [r.study, r.brk, r.long, r.every, r.switch_after, r.rest, r.horizon].map(Number);
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) return setError('Numbers must be 0 or more.');
    try {
      new Intl.DateTimeFormat('en', { timeZone: r.timezone });
    } catch {
      return setError('Unknown timezone (use e.g. Asia/Beirut).');
    }
    const [study, brk, long, every, sw, rest, horizon] = nums;
    await saveConfig({
      wake: r.wake, hard_stop: r.hard_stop, review: { start: r.review_start, end: r.review_end }, lunch: { start: r.lunch_start, end: r.lunch_end },
      sunday_off_from: r.sunday_off_from, pomodoro: { study_min: study, break_min: brk, long_break_min: long, long_break_every: every },
      switch_after_blocks: sw, rest_after_exam_min: rest, horizon_days: Math.min(28, Math.max(1, horizon)),
    }, r.timezone);
    setError(null);
    setSaved('Rules saved.');
  }

  async function resolve(c: Conflict, choice: 'keep_mine' | 'keep_server' | 'keep_as_log' | 'discard') {
    const ops: WriteInput[] = [];
    const server = c.server_row;
    if (choice === 'keep_mine' && c.row_id && server) {
      ops.push({ entity: c.entity as any, kind: 'update', row_id: c.row_id, payload: c.client_payload });
    }
    if (choice === 'keep_as_log') {
      // Q6: the losing device's timer session becomes its own log, never merged.
      const p = c.client_payload;
      const ms = timerElapsed(p, Date.parse(c.created_at ?? new Date().toISOString()));
      const end = c.created_at ?? new Date().toISOString();
      ops.push({ entity: 'time_logs', kind: 'insert', payload: { block_id: p.block_id, started_at: new Date(Date.parse(end) - ms).toISOString(), ended_at: end, plan_min: Math.round(Number(p.phase_target_ms) / 60000), actual_min: Math.round(ms / 60000), note: 'Kept from timer conflict on another device' } });
    }
    ops.push({ entity: 'sync_conflicts', kind: 'update', row_id: c.id, payload: { resolution: choice, resolved_at: new Date().toISOString() } });
    await write(ops);
  }

  async function doSignOut() {
    setError((await signOut()).error);
  }

  const openConflicts = data.sync_conflicts.filter((c) => !c.resolved_at);
  const problemOps = queue.filter((o) => o.state === 'failed' || o.state === 'rejected' || o.state === 'conflict');

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <H size={24}>Settings</H>
        <SyncStatus />
      </Row>
      <Row wrap>
        <SmallBtn title="Import / Export" onPress={() => router.push('/io')} />
        <SmallBtn title="Archive" onPress={() => router.push('/archive')} />
        <SmallBtn title="Rebalance" onPress={() => router.push('/plan')} />
      </Row>

      <Card>
        <H size={17}>Sync</H>
        <T muted>{queue.length} ops on this device. Last sync: {status.lastSync ? new Date(status.lastSync).toLocaleString() : 'never'}{status.error ? `. Last error: ${status.error}` : ''}</T>
        <SmallBtn title="Sync now" onPress={() => void sync()} />
        {problemOps.map((o) => (
          <Row key={o.op_id} wrap style={{ justifyContent: 'space-between' }}>
            <T size={13} color={o.state === 'failed' ? t.muted : t.danger}>{o.state}: {o.kind} {o.entity}{o.error ? ` (${o.error})` : ''}</T>
            {o.state !== 'failed' ? <SmallBtn title="Dismiss" onPress={() => void dismissOp(o.op_id)} /> : null}
          </Row>
        ))}
      </Card>

      {openConflicts.length ? (
        <Card>
          <H size={17}>Conflicts</H>
          <T muted size={13}>Progress and timer writes from two places disagreed. Nothing was overwritten; pick what stays.</T>
          {openConflicts.map((c) => (
            <View key={c.id} style={{ gap: 4 }}>
              <T>{c.entity} {c.row_id?.slice(0, 8)}: yours {JSON.stringify(c.client_payload).slice(0, 120)}</T>
              {c.server_row ? <T muted size={13}>server {JSON.stringify(c.server_row).slice(0, 120)}</T> : null}
              <Row wrap>
                {c.entity === 'active_timer' ? (
                  <>
                    <SmallBtn title="Keep as separate log" onPress={() => void resolve(c, 'keep_as_log')} />
                    <SmallBtn danger title="Discard" onPress={() => void resolve(c, 'discard')} />
                  </>
                ) : (
                  <>
                    <SmallBtn title="Keep mine" onPress={() => void resolve(c, 'keep_mine')} />
                    <SmallBtn title="Keep server" onPress={() => void resolve(c, 'keep_server')} />
                  </>
                )}
              </Row>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <H size={17}>Reminders</H>
        {notify.permission === 'unsupported' ? (
          <T muted>Web has no reminders in v1. Use the Android app for notifications.</T>
        ) : (
          <>
            <T>Permission: {notify.permission}{notify.permission !== 'granted' ? ' (reminders off)' : ''}</T>
            {notify.permission !== 'granted' ? <SmallBtn title="Allow notifications" onPress={() => void requestPermission()} /> : null}
            <T muted>
              {notify.scheduledThrough ? `Reminders scheduled through ${new Date(notify.scheduledThrough).toLocaleString()} (${notify.count} queued)` : 'Nothing scheduled yet.'}
              {notify.scheduledAt && Date.now() - Date.parse(notify.scheduledAt) > 86_400_000 ? ` Stale: last scheduled ${new Date(notify.scheduledAt).toLocaleString()}. Open the app to refresh.` : ''}
            </T>
          </>
        )}
        {(['block_start', 'block_end', 'break_end', 'summary', 'deadline', 'nag'] as const).map((k) => (
          <Toggle key={k} label={{ block_start: 'Block start', block_end: 'Block end', break_end: 'Break end', summary: 'Morning summary', deadline: 'Deadline warnings (7/3/1 days)', nag: 'Nag 10 min after unticked block' }[k]}
            value={cfg.notify[k]} onChange={(v) => void saveConfig({ notify: { ...cfg.notify, [k]: v } })} />
        ))}
        <T muted size={13}>Quiet: after hard stop, before wake, during classes and sport. Alerts for a timer you started always ring.</T>
      </Card>

      <Card>
        <H size={17}>Planning rules</H>
        <Field label="Timezone" value={r.timezone} onChange={(v) => setR({ ...r, timezone: v })} />
        <Row wrap>
          <Field label="Wake" value={r.wake} onChange={(v) => setR({ ...r, wake: v })} />
          <Field label="Hard stop" value={r.hard_stop} onChange={(v) => setR({ ...r, hard_stop: v })} />
          <Field label="Sunday off from" value={r.sunday_off_from} onChange={(v) => setR({ ...r, sunday_off_from: v })} />
        </Row>
        <Row wrap>
          <Field label="Study min" value={r.study} onChange={(v) => setR({ ...r, study: v })} keyboard="numeric" />
          <Field label="Break min" value={r.brk} onChange={(v) => setR({ ...r, brk: v })} keyboard="numeric" />
          <Field label="Long break min" value={r.long} onChange={(v) => setR({ ...r, long: v })} keyboard="numeric" />
          <Field label="Long break every N" value={r.every} onChange={(v) => setR({ ...r, every: v })} keyboard="numeric" />
        </Row>
        <Row wrap>
          <Field label="Review start" value={r.review_start} onChange={(v) => setR({ ...r, review_start: v })} />
          <Field label="Review end" value={r.review_end} onChange={(v) => setR({ ...r, review_end: v })} />
          <Field label="Lunch start" value={r.lunch_start} onChange={(v) => setR({ ...r, lunch_start: v })} />
          <Field label="Lunch end" value={r.lunch_end} onChange={(v) => setR({ ...r, lunch_end: v })} />
        </Row>
        <Row wrap>
          <Field label="Switch subject after N blocks" value={r.switch_after} onChange={(v) => setR({ ...r, switch_after: v })} keyboard="numeric" />
          <Field label="Rest after exam (min)" value={r.rest} onChange={(v) => setR({ ...r, rest: v })} keyboard="numeric" />
          <Field label="Auto-fill days" value={r.horizon} onChange={(v) => setR({ ...r, horizon: v })} keyboard="numeric" />
        </Row>
        <Btn title="Save rules" onPress={saveRules} />
        <SmallBtn title="Reset to defaults" onPress={() => setR(toForm(DEFAULT_CONFIG, getTz(data)))} />
        {saved ? <T color={t.ok}>{saved}</T> : null}
      </Card>

      <FixedEditor />
      <OneoffEditor />

      <Card>
        <H size={17}>Account</H>
        {session?.user.email ? <T muted>Signed in as {session.user.email}</T> : null}
        {!logoutAsk ? (
          <Btn secondary title="Sign out" onPress={() => (queue.length ? setLogoutAsk(true) : void doSignOut())} />
        ) : (
          <Banner>
            <T bold>{queue.length} changes are only on this device.</T>
            <Row wrap>
              <SmallBtn title="Sync now" onPress={() => void sync()} />
              <SmallBtn title="Export queue to file" onPress={() => void saveFile('sergeant-queue.json', JSON.stringify(queue, null, 2), 'application/json')} />
              <SmallBtn title="Cancel" onPress={() => setLogoutAsk(false)} />
            </Row>
            <Field label='Type "discard" to drop them and sign out' value={typed} onChange={setTyped} />
            <SmallBtn danger title="Discard and sign out" disabled={typed !== 'discard'} onPress={async () => { await clearQueue(); await doSignOut(); }} />
          </Banner>
        )}
      </Card>
      {error ? <Text accessibilityRole="alert" style={{ color: t.danger, fontWeight: '600' }}>{error}</Text> : null}
    </Screen>
  );
}

function toForm(c: typeof DEFAULT_CONFIG, tz: string) {
  return {
    timezone: tz, wake: c.wake, hard_stop: c.hard_stop, sunday_off_from: c.sunday_off_from,
    study: String(c.pomodoro.study_min), brk: String(c.pomodoro.break_min), long: String(c.pomodoro.long_break_min), every: String(c.pomodoro.long_break_every),
    review_start: c.review.start, review_end: c.review.end, lunch_start: c.lunch.start, lunch_end: c.lunch.end,
    switch_after: String(c.switch_after_blocks), rest: String(c.rest_after_exam_min), horizon: String(c.horizon_days),
  };
}

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const t = useTheme();
  return (
    <Row wrap>
      {WEEKDAYS.map((d, i) => {
        const on = value.includes(i);
        return (
          <Pressable key={d} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => onChange(on ? value.filter((x) => x !== i) : [...value, i].sort())}
            style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1.5, borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : 'transparent' }}>
            <Text style={{ color: on ? t.onPrimary : t.text }}>{d}</Text>
          </Pressable>
        );
      })}
    </Row>
  );
}

function FixedEditor() {
  const { data, write } = useStore();
  const t = useTheme();
  const empty = { label: '', kind: 'class' as FixedEvent['kind'], weekdays: [] as number[], start: '', end: '', never_cut: false, course_id: '' };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  const list = [...data.fixed_events].sort((a, b) => a.start_time.localeCompare(b.start_time));

  async function add() {
    if (!f.label.trim() || !f.weekdays.length || !HM.test(f.start) || !HM.test(f.end)) return setErr('Label, weekdays and HH:MM times are required.');
    if (f.end <= f.start && f.kind !== 'sleep' && f.kind !== 'other') return setErr('Only sleep or other may run past midnight.');
    if (f.end === f.start) return setErr('Start and end cannot be equal.');
    await write([{ entity: 'fixed_events', kind: 'insert', payload: { label: f.label.trim(), kind: f.kind, weekdays: f.weekdays, start_time: f.start, end_time: f.end, never_cut: f.never_cut, course_id: f.course_id || null } }]);
    setF(empty);
    setErr(null);
  }

  return (
    <Card>
      <H size={17}>Fixed schedule</H>
      {list.map((e) => (
        <Row key={e.id} wrap style={{ justifyContent: 'space-between' }}>
          <T>{e.weekdays.map((w) => WEEKDAYS[w % 7]).join(' ')} {e.start_time.slice(0, 5)} to {e.end_time.slice(0, 5)} {e.label} ({e.kind}{e.never_cut ? ', never cut' : ''})</T>
          <SmallBtn danger title="Delete" onPress={() => void write([{ entity: 'fixed_events', kind: 'delete', row_id: e.id }])} />
        </Row>
      ))}
      {!list.length ? <T muted>No fixed events yet: add classes, sport, commute and sleep.</T> : null}
      <Field label="Label" value={f.label} onChange={(v) => setF({ ...f, label: v })} placeholder="Muay Thai" />
      <Chips label="Kind" options={['class', 'sport', 'commute', 'sleep', 'other'] as const} value={f.kind} onChange={(v) => setF({ ...f, kind: v, never_cut: v === 'sport' ? true : f.never_cut })} />
      <WeekdayPicker value={f.weekdays} onChange={(v) => setF({ ...f, weekdays: v })} />
      <Row wrap>
        <Field label="Start HH:MM" value={f.start} onChange={(v) => setF({ ...f, start: v })} />
        <Field label="End HH:MM" value={f.end} onChange={(v) => setF({ ...f, end: v })} />
      </Row>
      {f.kind === 'class' ? <Chips label="Course" options={[{ value: '', label: 'None' }, ...data.courses.filter((c) => c.status === 'active').map((c) => ({ value: c.id, label: c.short }))]} value={f.course_id} onChange={(v) => setF({ ...f, course_id: v })} /> : null}
      <Toggle label="Never cut (gym, Muay Thai)" value={f.never_cut} onChange={(v) => setF({ ...f, never_cut: v })} />
      <Btn title="Add fixed event" onPress={add} />
      {err ? <Text accessibilityRole="alert" style={{ color: t.danger }}>{err}</Text> : null}
    </Card>
  );
}

function OneoffEditor() {
  const { data, write } = useStore();
  const t = useTheme();
  const empty = { label: '', date: '', all_day: false, start: '', end: '', kind: 'blocked' as Oneoff['kind'] };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const list = data.oneoff_blocks.filter((o) => o.date >= today).sort((a, b) => (a.date + (a.start_time ?? '')).localeCompare(b.date + (b.start_time ?? '')));

  async function add() {
    if (!f.label.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return setErr('Label and YYYY-MM-DD date are required.');
    if (!f.all_day && (!HM.test(f.start) || !HM.test(f.end) || f.end <= f.start)) return setErr('Times must be HH:MM with end after start, or tick all day.');
    await write([{ entity: 'oneoff_blocks', kind: 'insert', payload: { label: f.label.trim(), date: f.date, all_day: f.all_day, start_time: f.all_day ? null : f.start, end_time: f.all_day ? null : f.end, kind: f.kind } }]);
    setF(empty);
    setErr(null);
  }

  return (
    <Card>
      <H size={17}>One-off blocks</H>
      {list.map((o) => (
        <Row key={o.id} wrap style={{ justifyContent: 'space-between' }}>
          <T>{o.date} {o.all_day ? 'all day' : `${o.start_time?.slice(0, 5)} to ${o.end_time?.slice(0, 5)}`} {o.label} ({o.kind})</T>
          {o.kind !== 'exam' ? <SmallBtn danger title="Delete" onPress={() => void write([{ entity: 'oneoff_blocks', kind: 'delete', row_id: o.id }])} /> : <T muted size={13}>from exam</T>}
        </Row>
      ))}
      <Field label="Label" value={f.label} onChange={(v) => setF({ ...f, label: v })} />
      <Chips label="Kind" options={['blocked', 'off', 'trip'] as const} value={f.kind as 'blocked'} onChange={(v) => setF({ ...f, kind: v })} />
      <Field label="Date YYYY-MM-DD" value={f.date} onChange={(v) => setF({ ...f, date: v })} />
      <Toggle label="All day" value={f.all_day} onChange={(v) => setF({ ...f, all_day: v })} />
      {!f.all_day ? (
        <Row wrap>
          <Field label="Start HH:MM" value={f.start} onChange={(v) => setF({ ...f, start: v })} />
          <Field label="End HH:MM" value={f.end} onChange={(v) => setF({ ...f, end: v })} />
        </Row>
      ) : null}
      <Btn title="Add one-off" onPress={add} />
      {err ? <Text accessibilityRole="alert" style={{ color: t.danger }}>{err}</Text> : null}
    </Card>
  );
}
