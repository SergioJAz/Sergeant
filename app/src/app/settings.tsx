import { useState } from 'react';
import { Button, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Text accessibilityRole="header">Settings</Text>
      {session?.user.email ? <Text>Signed in as {session.user.email}</Text> : null}
      <Button title="Sign out" onPress={async () => setError((await signOut()).error)} />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: '#c00' }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
