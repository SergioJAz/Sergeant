import { View } from 'react-native';

import { KIND_LABEL, KIND_LETTER, type Kind } from '@/lib/kinds';
import { T, useTheme } from '@/lib/ui';

// The one kind marker (letter box, dot or nothing, per Settings). Neutral keeps the letter column aligned.
export function KindMarker({ kind, size = 32 }: { kind: Kind | null; size?: number }) {
  const t = useTheme();
  if (t.markers === 'none') return null;
  const label = kind ? KIND_LABEL[kind] : undefined;
  if (t.markers === 'dot') {
    return <View accessible={!!kind} accessibilityLabel={label} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: kind ? t[kind] : t.muted }} />;
  }
  return (
    <View accessible={!!kind} accessibilityLabel={label}
      style={{ width: size, height: size, borderRadius: Math.max(6, t.radius - 4), backgroundColor: kind ? `${t[kind]}2e` : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
      {kind ? <T bold color={t[kind]}>{KIND_LETTER[kind]}</T> : null}
    </View>
  );
}
