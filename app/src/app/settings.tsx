import { useState } from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { Btn, useTheme } from '@/lib/ui';

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const t = useTheme();
  const [error, setError] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: t.text }}>Settings</Text>
      {session?.user.email ? <Text style={{ color: t.muted }}>Signed in as {session.user.email}</Text> : null}
      <Btn secondary title="Sign out" onPress={async () => setError((await signOut()).error)} />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: t.danger, fontWeight: '600' }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
