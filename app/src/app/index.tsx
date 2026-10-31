import { Text, View } from 'react-native';

import { useTheme } from '@/lib/ui';

export default function TodayScreen() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: t.text }}>Today</Text>
    </View>
  );
}
