// Test helper: loads fixtures/csv/base-state.json as DB-shaped rows.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImportState } from './importPlan.ts';

const file = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'csv', 'base-state.json');

// base-state.json uses spec names (start, end, order); the DB columns are start_time, end_time, position.
export function fixtureState(): ImportState {
  const s = JSON.parse(readFileSync(file, 'utf8'));
  return {
    courses: s.courses,
    items: s.items,
    chunks: s.chunks.map(({ order, ...c }: any) => ({ ...c, position: order })),
    blocks: s.blocks.map(({ start, end, ...b }: any) => ({ ...b, start_time: `${start}:00`, end_time: `${end}:00` })),
    time_logs: s.time_logs,
  };
}

