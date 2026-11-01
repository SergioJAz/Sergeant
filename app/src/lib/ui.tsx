import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, useColorScheme, View } from 'react-native';

// Text/background pairs are all above WCAG AA (4.5:1).
const light = { bg: '#e9eef6', surface: '#ffffff', field: '#f4f6fa', line: '#cfd6e2', text: '#111111', muted: '#4a4a4a', border: '#767676', primary: '#0b5fd6', onPrimary: '#ffffff', danger: '#b00020', dangerBg: '#fde7e9', warnBg: '#fff4d6', ok: '#0a7a3d' };
const dark = { bg: '#0a0d12', surface: '#1b222c', field: '#10151c', line: '#2f3a49', text: '#f2f2f2', muted: '#b8b8b8', border: '#8c8c8c', primary: '#6aa9ff', onPrimary: '#000000', danger: '#ff8a80', dangerBg: '#3a1a1c', warnBg: '#3a3016', ok: '#6ee7a0' };

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

export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 900, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, accent, style }: { children: ReactNode; accent?: string; style?: object }) {
  const t = useTheme();
  return (
    <View style={[{ padding: 12, gap: 8, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, borderLeftWidth: accent ? 5 : 1, borderLeftColor: accent ?? t.line }, style]}>
      {children}
    </View>
  );
}

export function H({ children, size = 20 }: { children: ReactNode; size?: number }) {
  const t = useTheme();
  return <Text accessibilityRole="header" style={{ fontSize: size, fontWeight: '700', color: t.text }}>{children}</Text>;
}

export function T({ children, muted, bold, color, size }: { children: ReactNode; muted?: boolean; bold?: boolean; color?: string; size?: number }) {
  const t = useTheme();
  return <Text style={{ color: color ?? (muted ? t.muted : t.text), fontWeight: bold ? '700' : '400', fontSize: size ?? 15 }}>{children}</Text>;
}

export function Row({ children, wrap, style }: { children: ReactNode; wrap?: boolean; style?: object }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Field({ label, value, onChange, placeholder, multiline, keyboard, secure }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
  keyboard?: 'default' | 'numeric' | 'email-address'; secure?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 4, flexGrow: 1, minWidth: 120 }}>
      <Text style={{ color: t.muted, fontSize: 13 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        multiline={multiline}
        keyboardType={keyboard}
        secureTextEntry={secure}
        autoCapitalize="none"
        style={{ borderWidth: 1.5, borderColor: t.border, borderRadius: 8, padding: 10, fontSize: 15, color: t.text, backgroundColor: t.field, minHeight: multiline ? 90 : undefined, textAlignVertical: multiline ? 'top' : 'center' }}
      />
    </View>
  );
}

export function Chips<V extends string>({ options, value, onChange, label }: { options: readonly V[] | { value: V; label: string }[]; value: V | null; onChange: (v: V) => void; label?: string }) {
  const t = useTheme();
  const opts = (options as any[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o)) as { value: V; label: string }[];
  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={{ color: t.muted, fontSize: 13 }}>{label}</Text> : null}
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {opts.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(o.value)}
              style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1.5, borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : 'transparent' }}>
              <Text style={{ color: on ? t.onPrimary : t.text, fontSize: 14 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text style={{ color: t.text, fontSize: 15, flexShrink: 1 }}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </Row>
  );
}

export function SmallBtn({ title, onPress, danger, disabled }: { title: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const t = useTheme();
  const c = danger ? t.danger : t.primary;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1.5, borderColor: c, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: c, fontWeight: '600', fontSize: 14 }}>{title}</Text>
    </Pressable>
  );
}

export function Banner({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'danger' | 'info' }) {
  const t = useTheme();
  const bg = tone === 'danger' ? t.dangerBg : tone === 'warn' ? t.warnBg : t.field;
  return <View accessibilityRole="alert" style={{ padding: 10, borderRadius: 8, backgroundColor: bg, borderWidth: 1, borderColor: t.line, gap: 6 }}>{children}</View>;
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(iv);
  }, [ms]);
  return now;
}
