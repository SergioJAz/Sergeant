import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/lib/ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
// Filled when selected, outline otherwise, so the active tab is not shown by color alone.
const icon = (name: string) => ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
  <Ionicons name={(focused ? name : `${name}-outline`) as IconName} color={color as string} size={size} />
);

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: t.bg },
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={{ tabBarIcon: icon('today'), title: 'Today' }} />
      <Tabs.Screen name="week" options={{ tabBarIcon: icon('calendar'), title: 'Week' }} />
      <Tabs.Screen name="courses" options={{ tabBarIcon: icon('library'), title: 'Courses' }} />
      <Tabs.Screen name="stats" options={{ tabBarIcon: icon('stats-chart'), title: 'Stats' }} />
      <Tabs.Screen name="settings" options={{ tabBarIcon: icon('settings'), title: 'Settings' }} />
    </Tabs>
  );
}
