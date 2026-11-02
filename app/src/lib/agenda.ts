// Pure day-agenda model: timeline, free gaps, now/next, bounds, kind totals, clock format. Minutes are minutes of the local day.
import { KINDS, kindOfBlock, type Kind } from './kinds.ts';
import type { Block } from './types.ts';

export type Anchor = { label: string; start: number; end: number; kind: Kind | null };
export type AgendaEntry = { key: string; start: number; end: number; title: string; kind: Kind | null; finished: boolean; block: Block | null };
export type Gap = { start: number; end: number };
export type TimelineItem = { type: 'entry'; entry: AgendaEntry } | { type: 'gap'; gap: Gap };

const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const skipped = (e: AgendaEntry) => e.block?.status === 'skipped';
const counted = (e: AgendaEntry) => (e.block ? !skipped(e) : e.kind !== null);

export function buildTimeline(blocks: Block[], anchors: Anchor[], titleOf: (b: Block) => string): AgendaEntry[] {
  const fromBlocks = blocks.map((b): AgendaEntry => ({
    key: b.id, start: min(b.start_time), end: min(b.end_time), title: titleOf(b), kind: kindOfBlock(b), finished: b.status !== 'planned', block: b,
  }));
  const fromAnchors = anchors.map((a, i): AgendaEntry => ({
    key: `a${i}:${a.start}`, start: a.start, end: a.end, title: a.label, kind: a.kind, finished: false, block: null,
  }));
  return [...fromBlocks, ...fromAnchors].sort((a, b) => a.start - b.start || a.end - b.end);
}

export function freeGaps(entries: AgendaEntry[], from: number, to: number, minLen = 30): Gap[] {
  const out: Gap[] = [];
  let cursor = from;
  const add = (end: number) => { if (Math.min(end, to) - cursor >= minLen) out.push({ start: cursor, end: Math.min(end, to) }); };
  for (const e of entries.filter((x) => !skipped(x)).sort((a, b) => a.start - b.start)) {
    add(e.start);
    cursor = Math.max(cursor, e.end);
  }
  add(to);
  return out;
}

export function withGaps(entries: AgendaEntry[], gaps: Gap[]): TimelineItem[] {
  const items: TimelineItem[] = [...entries.map((entry): TimelineItem => ({ type: 'entry', entry })), ...gaps.map((gap): TimelineItem => ({ type: 'gap', gap }))];
  const start = (i: TimelineItem) => (i.type === 'entry' ? i.entry.start : i.gap.start);
  return items.sort((a, b) => start(a) - start(b) || (a.type === 'gap' ? -1 : 0) - (b.type === 'gap' ? -1 : 0));
}

export function nowState(entries: AgendaEntry[], nowMin: number): { current: AgendaEntry | null; next: AgendaEntry | null } {
  const open = entries.filter((e) => !e.finished).sort((a, b) => a.start - b.start);
  const live = open.filter((e) => e.start <= nowMin && nowMin < e.end);
  return { current: live.find((e) => e.block) ?? live[0] ?? null, next: open.find((e) => e.start > nowMin) ?? null };
}

export function dayBounds(wakeMin: number, stopMin: number, entries: AgendaEntry[]): { start: number; end: number } {
  const inDay = entries.filter((e) => e.end > wakeMin && e.start < stopMin);
  if (!inDay.length) return { start: wakeMin, end: stopMin };
  return { start: Math.min(...inDay.map((e) => e.start)), end: Math.min(stopMin, Math.max(...inDay.map((e) => e.end))) };
}

export const plannedMin = (entries: AgendaEntry[]): number => entries.filter(counted).reduce((s, e) => s + e.end - e.start, 0);

export function kindTotals(entries: AgendaEntry[]): Record<Kind, number> {
  const t: Record<Kind, number> = { uni: 0, proj: 0, train: 0, err: 0 };
  for (const e of entries) if (e.kind && counted(e)) t[e.kind] += e.end - e.start;
  return t;
}

export const kindDots = (entries: AgendaEntry[]): Kind[] => KINDS.filter((k) => entries.some((e) => e.kind === k));

export function fmtClock(m: number, clock24: boolean): string {
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
  if (clock24) return `${String(h).padStart(2, '0')}:${mm}`;
  const h12 = h % 24 % 12 || 12;
  return `${h12}:${mm}${h % 24 < 12 ? 'am' : 'pm'}`;
}

export function fmtDur(m: number): string {
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
}
