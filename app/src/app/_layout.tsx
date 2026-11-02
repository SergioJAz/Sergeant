import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { useNotificationSync } from '@/lib/notify';
import { StoreProvider } from '@/lib/store';
import { FONT_ASSETS } from '@/theme/fontAssets';
import { ThemeProvider, useIsDark, useTheme, useThemePref } from '@/lib/ui';
import SignInScreen from './sign-in';

function NotificationSync() {
  useNotificationSync();
  return null;
}

function AuthedApp() {
  const { session, loading } = useAuth();
  const { ready } = useThemePref();
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const t = useTheme();
  const isDark = useIsDark();

  if (loading || !ready || !(fontsLoaded || fontError)) {
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
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NotificationSync />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, headerTitleStyle: { fontWeight: '700' }, headerShadowVisible: false, contentStyle: { backgroundColor: t.bg } }}>
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
    <ThemeProvider>
      <AuthProvider>
        <AuthedApp />
      </AuthProvider>
    </ThemeProvider>
  );
}
