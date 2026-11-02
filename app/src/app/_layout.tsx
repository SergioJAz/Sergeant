import { loadAsync } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { useNotificationSync } from '@/lib/notify';
import { StoreProvider, useStore } from '@/lib/store';
import { customThemesFrom } from '@/theme/appearance';
import { FONT_ASSETS } from '@/theme/fontAssets';
import { FONTS } from '@/theme/fonts';
import { setCustomThemes, ThemeProvider, useAppearance, useIsDark, useTheme, useThemePref } from '@/lib/ui';
import SignInScreen from './sign-in';

function NotificationSync() {
  useNotificationSync();
  return null;
}

function CustomThemeBridge() {
  const config = useStore().data.settings[0]?.config;
  useEffect(() => setCustomThemes(customThemesFrom(config)), [config]);
  useEffect(() => () => setCustomThemes([]), []); // sign-out unmounts this; drop the last user's themes
  return null;
}

function AuthedApp() {
  const { session, loading } = useAuth();
  const { ready } = useThemePref();
  const { appearance } = useAppearance();
  // Only the chosen font's regular+bold block the first paint (System needs none); settings loads the rest.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const f = FONTS.find((x) => x.id === appearance.font);
    const names = [f?.regular, f?.bold].filter((n): n is string => !!n);
    let live = true;
    loadAsync(Object.fromEntries(names.map((n) => [n, FONT_ASSETS[n]])))
      .catch(() => {})
      .finally(() => { if (live) setFontsReady(true); });
    return () => { live = false; };
  }, [ready, appearance.font]);
  const t = useTheme();
  const isDark = useIsDark();

  if (loading || !ready || !fontsReady) {
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
      <CustomThemeBridge />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, headerTitleStyle: { fontWeight: '700' }, headerShadowVisible: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
        <Stack.Screen name="item/[id]" options={{ title: 'Item' }} />
        <Stack.Screen name="archive" options={{ title: 'Archive' }} />
        <Stack.Screen name="io" options={{ title: 'Import / Export' }} />
        <Stack.Screen name="plan" options={{ title: 'Rebalance' }} />
        <Stack.Screen name="stats" options={{ title: 'Stats' }} />
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
