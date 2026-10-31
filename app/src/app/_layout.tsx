import { Tabs } from 'expo-router/js-tabs';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';

function AuthedTabs() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }

  return (
    <Tabs>
      <Tabs.Protected guard={!!session}>
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="week" options={{ title: 'Week' }} />
        <Tabs.Screen name="courses" options={{ title: 'Courses' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs.Protected>
      <Tabs.Protected guard={!session}>
        <Tabs.Screen name="sign-in" options={{ title: 'Sign in', href: null, headerShown: false }} />
      </Tabs.Protected>
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthedTabs />
    </AuthProvider>
  );
}
