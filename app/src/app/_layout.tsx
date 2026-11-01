import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { useNotificationSync } from '@/lib/notify';
import { StoreProvider } from '@/lib/store';
import { useTheme } from '@/lib/ui';
import SignInScreen from './sign-in';

function NotificationSync() {
  useNotificationSync();
  return null;
}

function AuthedApp() {
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

  // Tabs live in (tabs); detail screens stack on top so they are reachable by URL and router.push.
  return (
    <StoreProvider>
      <NotificationSync />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
        <Stack.Screen name="item/[id]" options={{ title: 'Item' }} />
        <Stack.Screen name="archive" options={{ title: 'Archive' }} />
        <Stack.Screen name="io" options={{ title: 'Import / Export' }} />
        <Stack.Screen name="plan" options={{ title: 'Rebalance' }} />
      </Stack>
    </StoreProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthedApp />
    </AuthProvider>
  );
}
