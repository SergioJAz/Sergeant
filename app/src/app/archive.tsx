import { useState } from 'react';

import { archiveCourse, archiveItem } from '@/lib/actions';
import { courseColor } from '@/lib/domain';
import { useStore } from '@/lib/store';
import type { BlockType } from '@/lib/types';
import { Card, Chips, Field, H, Row, Screen, SmallBtn, T } from '@/lib/ui';

// AC19: history views include archived records; restore brings them back.
export default function ArchiveScreen() {
  const { data, write } = useStore();
  const [q, setQ] = useState('');
  const [course, setCourse] = useState('');
  const [type, setType] = useState<'' | BlockType>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const short = (id: string | null) => data.courses.find((c) => c.id === id)?.short ?? '';

  const archivedCourses = data.courses.filter((c) => c.status === 'archived');
  const archivedItems = data.items.filter((i) => i.status === 'archived' && data.courses.find((c) => c.id === i.course_id)?.status === 'active');
  const doneItems = data.items.filter((i) => i.status === 'done');
  const needle = q.trim().toLowerCase();
  const blocks = data.blocks
    .filter((b) => (b.status === 'done' || b.status === 'partial') && !b.deleted_at)
    .filter((b) => (!course || b.course_id === course) && (!type || b.type === type) && (!from || b.date >= from) && (!to || b.date <= to))
    .map((b) => ({ b, logs: data.time_logs.filter((l) => l.block_id === b.id && !l.deleted_at) }))
    .filter(({ b, logs }) => !needle || `${b.what ?? ''} ${short(b.course_id)} ${logs.map((l) => l.note ?? '').join(' ')}`.toLowerCase().includes(needle))
    .sort((a, z) => (z.b.date + z.b.start_time).localeCompare(a.b.date + a.b.start_time))
    .slice(0, 200);

  return (
    <Screen>
      <H size={24}>Archive</H>
      <Card>
        <H size={16}>Archived courses</H>
        {archivedCourses.map((c) => (
          <Row key={c.id} style={{ justifyContent: 'space-between' }} wrap>
            <T>{c.short} {c.name} {c.semester ?? ''}</T>
            <SmallBtn title="Restore" onPress={() => void archiveCourse(write, data, c.id, false)} />
          </Row>
        ))}
        {!archivedCourses.length ? <T muted>None.</T> : null}
      </Card>
      <Card>
        <H size={16}>Archived and done items</H>
        {[...archivedItems, ...doneItems].map((i) => (
          <Row key={i.id} style={{ justifyContent: 'space-between' }} wrap>
            <T>{short(i.course_id)} {i.title} ({i.status})</T>
            <SmallBtn title="Restore" onPress={() => void (i.status === 'archived' ? archiveItem(write, data, i, false) : write([{ entity: 'items', kind: 'update', row_id: i.id, payload: { status: 'active' } }]))} />
          </Row>
        ))}
        {!archivedItems.length && !doneItems.length ? <T muted>None.</T> : null}
      </Card>
      <Card>
        <H size={16}>Done blocks</H>
        <Field label="Search (what, course, notes)" value={q} onChange={setQ} />
        <Chips label="Course" options={[{ value: '', label: 'All' }, ...data.courses.map((c) => ({ value: c.id, label: c.short }))]} value={course} onChange={setCourse} />
        <Chips label="Type" options={[{ value: '', label: 'All' }, ...(['Notes', 'Problems', 'Review', 'Mock', 'CheatSheet', 'Buffer', 'Rest'] as const).map((v) => ({ value: v, label: v }))]} value={type} onChange={(v) => setType(v as '' | BlockType)} />
        <Row wrap>
          <Field label="From (YYYY-MM-DD)" value={from} onChange={setFrom} />
          <Field label="To (YYYY-MM-DD)" value={to} onChange={setTo} />
        </Row>
      </Card>
      {blocks.map(({ b, logs }) => (
        <Card key={b.id} accent={courseColor(data, b.course_id)}>
          <T bold>{b.date} {b.start_time.slice(0, 5)} {short(b.course_id)} {b.what ?? b.type} ({b.status})</T>
          {logs.map((l) => (
            <T key={l.id} muted size={13}>
              {l.actual_min} of {l.plan_min} min{l.focus ? `, focus ${l.focus}` : ''}{l.pages ? `, pages ${l.pages}` : ''}{l.note ? `: ${l.note}` : ''}
            </T>
          ))}
        </Card>
      ))}
      {!blocks.length ? <T muted>No matching blocks.</T> : null}
    </Screen>
  );
}
