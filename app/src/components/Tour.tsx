import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { Row, Sheet, SmallBtn, T } from '@/lib/ui';

// Seen tours live on the device, not in synced data: a new phone shows them once more, which is fine.
const KEY = 'sg:tours';
let listeners: (() => void)[] = [];

async function seen(): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
  } catch {
    return [];
  }
}

export async function resetTours() {
  await AsyncStorage.removeItem(KEY);
  listeners.forEach((f) => f());
}

export type TourStep = { title: string; body: string };

// First-visit popup for a screen: walks its steps, then never shows again until "Show tips again".
export function Tour({ id, steps }: { id: string; steps: TourStep[] }) {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    const check = () => void seen().then((s) => setStep(s.includes(id) ? null : 0));
    check();
    listeners.push(check);
    return () => void (listeners = listeners.filter((f) => f !== check));
  }, [id]);

  if (step === null) return null;
  const done = async () => {
    setStep(null);
    const s = await seen();
    await AsyncStorage.setItem(KEY, JSON.stringify([...new Set([...s, id])]));
  };
  const last = step === steps.length - 1;
  return (
    <Sheet title={steps[step].title} onClose={() => void done()}>
      <T>{steps[step].body}</T>
      <Row style={{ justifyContent: 'space-between' }}>
        <T muted size={13}>{steps.length > 1 ? `${step + 1} of ${steps.length}` : ''}</T>
        <Row>
          {last ? null : <SmallBtn ghost title="Skip" onPress={() => void done()} />}
          <SmallBtn filled title={last ? 'Got it' : 'Next'} onPress={() => (last ? void done() : setStep(step + 1))} />
        </Row>
      </Row>
    </Sheet>
  );
}
