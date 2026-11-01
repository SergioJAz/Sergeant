import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { archiveCourse, examOps } from '@/lib/actions';
import { activeChunks, COLORS, courseColor, getTz, pressure, remainingMin, fmtDue, ITEM_TYPES, parseDue } from '@/lib/domain';
import { useStore, uuid } from '@/lib/store';
import type { Item, ItemType } from '@/lib/types';
import { Btn, Card, Chips, Field, H, Row, Screen, SmallBtn, T, useTheme } from '@/lib/ui';

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, write } = useStore();
  const t = useTheme();
  const tz = getTz(data);
  const c = data.courses.find((x) => x.id === id);
  const [f, setF] = useState({ code: '', name: '', short: '', professor: '', semester: '', notes: '', color: '' });
  const [ni, setNi] = useState({ type: 'exam' as ItemType, title: '', due: '' });
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (c) setF({ code: c.code, name: c.name, short: c.short, professor: c.professor ?? '', semester: c.semester ?? '', notes: c.notes ?? '', color: c.color ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id]);

  if (!c) return <Screen><T>Course not found.</T><SmallBtn title="Back" onPress={() => router.push('/courses')} /></Screen>;
  const course = c;
  const items = data.items.filter((i) => i.course_id === course.id && i.status !== 'archived');
  const now = Date.now();

  async function save() {
    if (!f.code.trim() || !f.name.trim() || !f.short.trim()) return setErr('Code, name and short are required.');
    await write([{ entity: 'courses', kind: 'update', row_id: course.id, payload: { code: f.code.trim(), name: f.name.trim(), short: f.short.trim(), professor: f.professor || null, semester: f.semester || null, notes: f.notes || null, color: f.color || null } }]);
    setErr(null);
    setSaved(true);
  }

  async function addItem() {
    const due = parseDue(ni.due, tz);
    if (!ni.title.trim()) return setErr('Item title is required.');
    if (due === undefined) return setErr('Due must be YYYY-MM-DD or YYYY-MM-DD HH:MM.');
    const itemId = uuid();
    const payload = { course_id: course.id, type: ni.type, title: ni.title.trim(), due_at: due, status: 'active', duration_min: ni.type === 'exam' ? 120 : null };
    await write([
      { entity: 'items', kind: 'insert', row_id: itemId, payload },
      ...examOps(data, { ...(payload as any), id: itemId, travel_before_min: 30, travel_after_min: 30 } as Item),
    ]);
    setNi({ ...ni, title: '', due: '' });
    setErr(null);
    router.push(`/item/${itemId}`);
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <H size={24}>{course.short}</H>
        <SmallBtn title="All courses" onPress={() => router.push('/courses')} />
      </Row>
      {ITEM_TYPES.map((type) => {
        const list = items.filter((i) => i.type === type).sort((a, b) => (a.due_at ?? '9').localeCompare(b.due_at ?? '9'));
        if (!list.length) return null;
        return (
          <Card key={type}>
            <H size={16}>{type}</H>
            {list.map((i) => {
              const left = activeChunks(data, i.id).reduce((s, k) => s + remainingMin(data, k), 0);
              return (
                <Pressable key={i.id} accessibilityRole="button" onPress={() => router.push(`/item/${i.id}`)} style={{ paddingVertical: 4 }}>
                  <T bold>{i.title}{i.status === 'done' ? ' (done)' : ''}</T>
                  <T muted size={13}>
                    {i.due_at ? `Due ${fmtDue(i.due_at, tz)}${i.type === 'exam' && !i.due_confirmed ? ' (assumed slot)' : ''}, ` : 'No due date, '}
                    {left} min left, pressure {pressure(data, i, now).toFixed(2)}
                  </T>
                </Pressable>
              );
            })}
          </Card>
        );
      })}
      <Card>
        <H size={17}>New item</H>
        <Chips label="Type" options={ITEM_TYPES} value={ni.type} onChange={(v) => setNi({ ...ni, type: v })} />
        <Field label="Title" value={ni.title} onChange={(v) => setNi({ ...ni, title: v })} />
        <Field label="Due (YYYY-MM-DD HH:MM, planning timezone)" value={ni.due} onChange={(v) => setNi({ ...ni, due: v })} />
        <Btn title="Add item" onPress={addItem} />
      </Card>
      <Card accent={courseColor(data, course.id)}>
        <H size={17}>Course details</H>
        <Row wrap>
          <Field label="Code" value={f.code} onChange={(v) => setF({ ...f, code: v })} />
          <Field label="Short" value={f.short} onChange={(v) => setF({ ...f, short: v })} />
        </Row>
        <Field label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
        <Row wrap>
          <Field label="Professor" value={f.professor} onChange={(v) => setF({ ...f, professor: v })} />
          <Field label="Semester" value={f.semester} onChange={(v) => setF({ ...f, semester: v })} />
        </Row>
        <Chips label="Color" options={[{ value: '', label: 'auto' }, ...COLORS.map((x) => ({ value: x, label: x }))]} value={f.color} onChange={(v) => setF({ ...f, color: v })} />
        <Field label="Notes" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} multiline />
        <Btn title="Save course" onPress={save} />
        {saved ? <T color={t.ok}>Saved.</T> : null}
        <SmallBtn danger title="Archive course (items, chunks, future blocks)" onPress={async () => { await archiveCourse(write, data, course.id, true); router.push('/courses'); }} />
      </Card>
      {err ? <Text accessibilityRole="alert" style={{ color: t.danger, fontWeight: '600' }}>{err}</Text> : null}
    </Screen>
  );
}
