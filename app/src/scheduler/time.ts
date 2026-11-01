// Planning-timezone math for the scheduler (Contracts 4), Intl only. Dates 'YYYY-MM-DD', wall times 'HH:MM', instants UTC ms.

export const MIN = 60_000;
export const DAY_MS = 86_400_000;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    fmtCache.set(tz, f);
  }
  return f;
}

export function wall(ms: number, tz: string): { date: string; time: string } {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// Local wall clock of an instant, encoded as if it were UTC (minute precision).
function wallMs(ms: number, tz: string) {
  const w = wall(ms, tz);
  return Date.parse(`${w.date}T${w.time}:00Z`);
}

// Ambiguous (fall back) -> first occurrence; nonexistent (spring forward) -> first valid minute after it.
export function toInstant(date: string, time: string, tz: string): number {
  let want = Date.parse(`${date}T${time.slice(0, 5)}:00Z`);
  for (let i = 0; i < 24 * 60; i++, want += MIN) {
    const hits = [want - DAY_MS, want, want + DAY_MS]
      .map((t) => want - (wallMs(t, tz) - Math.floor(t / MIN) * MIN))
      .filter((t) => wallMs(t, tz) === want)
      .sort((a, b) => a - b);
    if (hits.length) return hits[0];
  }
  throw new Error(`cannot resolve ${date} ${time} in ${tz}`);
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
