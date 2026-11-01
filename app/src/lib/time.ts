// Planning-timezone helpers (Contracts 4). Dates are 'YYYY-MM-DD', wall times 'HH:MM', instants ISO UTC.

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(ms: number, tz: string) {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return p;
}

export function localDate(ms: number, tz: string) {
  const p = parts(ms, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localHM(ms: number, tz: string) {
  const p = parts(ms, tz);
  return `${p.hour}:${p.minute}`;
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 0 = Sunday, matching fixed_events.weekdays
export function weekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function hmToMin(hm: string) {
  const [h, m] = hm.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

export function minToHm(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Local wall time -> UTC ms; DST gaps move forward, overlaps take the first (Contracts 4).
export { toInstant } from '@/scheduler/time';

export function mondayOf(date: string) {
  return addDays(date, -((weekday(date) + 6) % 7));
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function dayLabel(date: string) {
  return `${DAY[weekday(date)]} ${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;
}
export const WEEKDAYS = DAY;

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
