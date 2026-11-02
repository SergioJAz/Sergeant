import { Fragment, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { columnsFor } from '@/theme/layout';

// Whole sections go to explicit columns (never CSS multi-column flow), so a section is never split.
export function Columns({ sections, plan }: { sections: ReactNode[]; plan: { 2: number[][]; 3: number[][] } }) {
  const [width, setWidth] = useState(0);
  // Breakpoints describe the page including its two 16px insets (an 820 tablet beside the rail is 2 columns).
  const n = columnsFor(width + 32);
  const cols = n === 1 ? [sections.map((_, i) => i)] : plan[n];
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
      {cols.map((col, i) => (
        <View key={i} style={{ flex: 1, minWidth: 0, gap: 16 }}>
          {col.map((j) => <Fragment key={j}>{sections[j]}</Fragment>)}
        </View>
      ))}
    </View>
  );
}
