import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Columns } from '@/components/Columns';
import { KindMarker } from '@/components/KindMarker';
import { examOps } from '@/lib/actions';
import { activeChunks, estMin, fmtDue, getTz, ITEM_TYPES, parseDue, pressure, remainingMin } from '@/lib/domain';
import { useStore, uuid } from '@/lib/store';
import { dayLabel } from '@/lib/time';
import type { Item, ItemType } from '@/lib/types';
import { Btn, Card, Chips, Empty, Field, H, Pill, Progress, Row, Screen, Section, SmallBtn, T, Toggle, useTheme } from '@/lib/ui';

export default function ProjectsScreen() {
  const { data, write } = useStore();
  const t = useTheme();
  const tz = getTz(data);
  const now = Date.now();
  const courses = data.courses.filter((c) => c.status === 'active').sort((a, b) => a.short.localeCompare(b.short));
  const [showNew, setShowNew] = useState(!courses.length);
  const [nc, setNc] = useState({ code: '', name: '', short: '', semester: '' });
  const [qa, setQa] = useState({ course_id: '', type: 'homework' as ItemType, title: '', due: '', est: '1', laptop: false });
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function addCourse() {
    if (!nc.code.trim() || !nc.name.trim() || !nc.short.trim()) return setErr('Code, name and short name are required.');
    await write([{ entity: 'courses', kind: 'insert', payload: { code: nc.code.trim(), name: nc.name.trim(), short: nc.short.trim(), semester: nc.semester.trim() || null, status: 'active' } }]);
    setNc({ code: '', name: '', short: '', semester: '' });
    setShowNew(false);
    setErr(null);
  }

  // Spec 3.5 quick add: item plus one chunk with the estimate.
  async function quickAdd() {
    const due = parseDue(qa.due, tz);
    const est = Number(qa.est);
    if (!qa.course_id || !qa.title.trim()) return setErr('Pick a course and enter a title.');
    if (due === undefined) return setErr('Due must be YYYY-MM-DD or YYYY-MM-DD HH:MM.');
    if (!Number.isFinite(est) || est < 0) return setErr('Estimate must be 0 or more blocks.');
    const id = uuid();
    const item = { course_id: qa.course_id, type: qa.type, title: qa.title.trim(), due_at: due, needs_laptop: qa.laptop, status: 'active', duration_min: qa.type === 'exam' ? 120 : null };
    await write([
      { entity: 'items', kind: 'insert', row_id: id, payload: item },
      { entity: 'chunks', kind: 'insert', payload: { item_id: id, position: 1, title: qa.title.trim(), kind: qa.type === 'lab' ? 'lab_work' : 'problems', est_blocks: est } },
      ...examOps(data, { ...(item as any), id, travel_before_min: 30, travel_after_min: 30 } as Item),
    ]);
    setQa({ ...qa, title: '', due: '', est: '1' });
    setErr(null);
    setMsg('Added.');
  }

  const uni = (
    <Section key="uni" title="Uni" right={<T muted size={13}>by course</T>}>
      {courses.map((c) => {
        const items = data.items.filter((i) => i.course_id === c.id && i.status === 'active');
        const chunks = items.flatMap((i) => activeChunks(data, i.id));
        const left = chunks.reduce((x, k) => x + remainingMin(data, k), 0);
        const total = chunks.reduce((x, k) => x + estMin(k), 0);
        const ranked = items.map((item) => ({ item, value: pressure(data, item, now) })).sort((a, b) => b.value - a.value);
        const top = ranked[0]?.value ?? 0;
        const current = ranked[0]?.item;
        return (
          <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Open ${c.short}`} onPress={() => router.push(`/course/${c.id}`)}>
            <Card>
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <Row style={{ flex: 1, minWidth: 0 }}>
                  <KindMarker kind="uni" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T bold size={18}>{c.short}</T>
                    <T muted size={13}>{c.name}</T>
                  </View>
                </Row>
                {top >= 1 ? <Pill label="High pressure" color={t.danger} /> : top >= 0.5 ? <Pill label="Busy" color={t.warn} /> : null}
              </Row>
              {current ? <T size={14}>{current.title} · {current.due_at ? `due ${dayLabel(fmtDue(current.due_at, tz).slice(0, 10))}` : 'no due date'}</T> : null}
              <Progress value={total ? 1 - left / total : 0} color={t.uni} />
              <T muted size={13}>{items.length} active · {Math.round(left / 5) / 10} blocks left</T>
            </Card>
          </Pressable>
        );
      })}
      {!courses.length ? <Empty title="No courses yet" body="Add your first course below, or import from Settings, Import / Export." /> : null}
      <Row><SmallBtn ghost title="+ New course" onPress={() => setShowNew((value) => !value)} /></Row>
      {showNew ? (
        <Card>
          <H size={17}>New course</H>
          <Row wrap>
            <Field label="Code" value={nc.code} onChange={(v) => setNc({ ...nc, code: v })} placeholder="CPEN448" />
            <Field label="Short" value={nc.short} onChange={(v) => setNc({ ...nc, short: v })} placeholder="Cloud" />
          </Row>
          <Field label="Name" value={nc.name} onChange={(v) => setNc({ ...nc, name: v })} />
          <Field label="Semester" value={nc.semester} onChange={(v) => setNc({ ...nc, semester: v })} placeholder="Fall 2026" />
          <Btn title="Add course" onPress={addCourse} />
        </Card>
      ) : null}
    </Section>
  );

  const quickAddSection = courses.length ? (
    <Section key="add" title="Add to a course">
        <Card>
          <H size={17}>Quick add</H>
          <Chips label="Course" options={courses.map((c) => ({ value: c.id, label: c.short }))} value={qa.course_id} onChange={(v) => setQa({ ...qa, course_id: v })} />
          <Chips label="Type" options={ITEM_TYPES} value={qa.type} onChange={(v) => setQa({ ...qa, type: v })} />
          <Field label="Title" value={qa.title} onChange={(v) => setQa({ ...qa, title: v })} />
          <Row wrap>
            <Field label="Due (YYYY-MM-DD HH:MM)" value={qa.due} onChange={(v) => setQa({ ...qa, due: v })} />
            <Field label="Estimate (50 min blocks)" value={qa.est} onChange={(v) => setQa({ ...qa, est: v })} keyboard="numeric" />
          </Row>
          <Toggle label="Needs laptop" value={qa.laptop} onChange={(v) => setQa({ ...qa, laptop: v })} />
          <Btn title="Add item" onPress={quickAdd} />
          {msg ? <T color={t.ok}>{msg}</T> : null}
        </Card>
    </Section>
  ) : null;

  return (
    <Screen wide subtitle="Uni and your own stuff" title="Projects" right={<SmallBtn ghost title="Archive" onPress={() => router.push('/archive')} />}>
      <Columns sections={quickAddSection ? [uni, quickAddSection] : [uni]} plan={{ 2: quickAddSection ? [[0], [1]] : [[0]], 3: quickAddSection ? [[0], [1]] : [[0]] }} />
      {err ? <Text accessibilityRole="alert" style={{ color: t.danger, fontWeight: '600' }}>{err}</Text> : null}
    </Screen>
  );
}
