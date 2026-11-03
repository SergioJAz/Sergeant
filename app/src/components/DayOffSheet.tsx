import { router } from 'expo-router';
import { useState } from 'react';

import { configOp } from '@/lib/actions';
import { getConfig } from '@/lib/domain';
import { useStore } from '@/lib/store';
import { addDays } from '@/lib/time';
import { Btn, Row, Sheet, SmallBtn, T, Toggle } from '@/lib/ui';

// Day off = an all-day "off" one-off; the scheduler then moves today's auto-placed work into the rest of the week,
// and the Plan screen shows that move for review before anything changes.
export function DayOffSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { data, write } = useStore();
  const [busy, setBusy] = useState(false); // a double tap must not add two day-off rows
  const [keepFixed, setKeepFixed] = useState(true);

  async function clear() {
    setBusy(true);
    const dates = getConfig(data).fixed_off_dates.filter((d) => d >= addDays(date, -14));
    await write([
      { entity: 'oneoff_blocks', kind: 'insert', payload: { label: 'Day off', date, all_day: true, start_time: null, end_time: null, kind: 'off', item_id: null } },
      ...(keepFixed ? [] : [configOp(data, { fixed_off_dates: [...dates, date] })]),
    ]);
    onClose();
    router.push('/plan');
  }

  return (
    <Sheet title="Take the day off?" onClose={onClose}>
      <T muted>Today's planned study moves to later this week. Nothing gets deleted. Blocks you placed by hand stay where they are.</T>
      <Toggle label="Keep fixed times (classes, training)" value={keepFixed} onChange={setKeepFixed} />
      <T muted>Next you'll see the new plan to accept.</T>
      <Row>
        <Btn title="Clear today" disabled={busy} onPress={() => void clear()} />
        <SmallBtn ghost title="Cancel" onPress={onClose} />
      </Row>
    </Sheet>
  );
}
