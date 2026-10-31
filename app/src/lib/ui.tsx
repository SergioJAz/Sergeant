import { Pressable, Text, useColorScheme } from 'react-native';

// Text/background pairs are all above WCAG AA (4.5:1).
const light = { bg: '#e9eef6', surface: '#ffffff', field: '#f4f6fa', line: '#cfd6e2', text: '#111111', muted: '#4a4a4a', border: '#767676', primary: '#0b5fd6', onPrimary: '#ffffff', danger: '#b00020' };
const dark = { bg: '#0a0d12', surface: '#1b222c', field: '#10151c', line: '#2f3a49', text: '#f2f2f2', muted: '#b8b8b8', border: '#8c8c8c', primary: '#6aa9ff', onPrimary: '#000000', danger: '#ff8a80' };

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}

export function Btn({ title, onPress, disabled, secondary }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
        backgroundColor: secondary ? 'transparent' : t.primary,
        borderWidth: secondary ? 1.5 : 0,
        borderColor: t.primary,
      }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: secondary ? t.primary : t.onPrimary }}>{title}</Text>
    </Pressable>
  );
}
