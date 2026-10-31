import { Tabs } from 'expo-router/js-tabs';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/ui';
import SignInScreen from './sign-in';

function AuthedTabs() {
  const { session, loading } = useAuth();
  const t = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator accessibilityLabel="Loading" color={t.primary} />
      </View>
    );
  }

  // Tabs.Protected rendered no screens in SDK 58 (blank page), so gate by hand.
  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <SignInScreen />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        sceneStyle: { backgroundColor: t.bg },
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border },
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="week" options={{ title: 'Week' }} />
      <Tabs.Screen name="courses" options={{ title: 'Courses' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      <Tabs.Screen name="sign-in" options={{ href: null }} />
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
