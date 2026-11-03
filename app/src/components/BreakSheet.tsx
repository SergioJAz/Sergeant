import { useState } from 'react';

import { planBreak } from '@/lib/breaks';
import { blocksOn, busyOn, getConfig } from '@/lib/domain';
import { useStore } from '@/lib/store';
import { hmToMin } from '@/lib/time';
import { Btn, Chips, Field, Sheet, T } from '@/lib/ui';

const LENGTHS = ['5', '10', '15', '30', '45', '60'] as const;

// onDone gets how many blocks no longer fit today, so Today can offer a replan.
export function BreakSheet({ date, nowMin, onClose, onDone }: { date: string; nowMin: number; onClose: () => void; onDone: (unfit: number) => void }) {
  const { data, write } = useStore();
  const [len, setLen] = useState('15');
  const min = Number(len);
  const ok = Number.isInteger(min) && min > 0 && min <= 240;
  const over = nowMin >= hmToMin(getConfig(data).hard_stop); // past the stop time there is nothing left to shift

  async function start() {
    const { ops, unfit } = planBreak(blocksOn(data, date), busyOn(data, date), date, nowMin, min, hmToMin(getConfig(data).hard_stop));
    await write(ops);
    onDone(unfit.length);
    onClose();
  }

  return (
    <Sheet title="Take a break" onClose={onClose}>
      <T muted>Your planned work after now slides later by the break. Fixed times and blocks you placed by hand stay put.</T>
      <Chips label="Minutes" options={LENGTHS} value={(LENGTHS as readonly string[]).includes(len) ? (len as (typeof LENGTHS)[number]) : null} onChange={setLen} />
      <Field label="Or type minutes" value={len} onChange={setLen} keyboard="numeric" />
      <Btn title={over ? 'Your day is already over' : ok ? `Break for ${min} min` : 'Enter 1 to 240 minutes'} disabled={!ok || over} onPress={() => void start()} />
    </Sheet>
  );
}
