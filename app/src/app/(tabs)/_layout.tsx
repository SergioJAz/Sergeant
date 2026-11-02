import { Tabs } from 'expo-router/js-tabs';
import { useWindowDimensions, type ColorValue } from 'react-native';

import { NavBar } from '@/components/NavBar';
import { TabIcon, type TabIconProps } from '@/components/TabIcon';
import { useTheme } from '@/lib/ui';
import { navLayout } from '@/theme/layout';

// Each platform renders its icon without changing the tab's selected state or label.
const icon = (name: TabIconProps['name']) => ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
  <TabIcon name={name} focused={focused} color={color as string} size={size} />
);

export default function TabsLayout() {
  const t = useTheme();
  const nl = navLayout(useWindowDimensions().width, t.nav);
  return (
    <Tabs
      tabBar={(p) => <NavBar {...p} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: t.bg },
        tabBarPosition: nl.position,
      }}>
      <Tabs.Screen name="index" options={{ tabBarIcon: icon('time'), title: 'Today' }} />
      <Tabs.Screen name="week" options={{ tabBarIcon: icon('calendar'), title: 'Week' }} />
      <Tabs.Screen name="projects" options={{ tabBarIcon: icon('folder'), title: 'Projects' }} />
      <Tabs.Screen name="settings" options={{ tabBarIcon: icon('options'), title: 'Settings' }} />
    </Tabs>
  );
}
