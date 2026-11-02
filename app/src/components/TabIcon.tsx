import Ionicons from '@expo/vector-icons/Ionicons';

export type TabIconProps = {
  name: 'time' | 'calendar' | 'folder' | 'options';
  focused: boolean;
  color: string;
  size: number;
};

// Native keeps the existing Ionicons appearance. Web resolves TabIcon.web.tsx instead.
export function TabIcon({ name, focused, color, size }: TabIconProps) {
  return <Ionicons name={focused ? name : `${name}-outline`} color={color} size={size} />;
}
