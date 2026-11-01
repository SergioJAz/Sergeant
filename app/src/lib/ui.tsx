import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Semantic tokens. Every text/background pair below meets WCAG AA (4.5:1 body text, 3:1 large text and UI parts).
const light = {
  bg: '#f2f4f8', surface: '#ffffff', surface2: '#eef1f6', elevated: '#ffffff', field: '#f8f9fc', line: '#dde2ea',
  text: '#111827', muted: '#4b5563', border: '#8a94a6', primary: '#2f5bd3', primarySoft: '#e6edfc', onPrimary: '#ffffff',
  danger: '#b42318', dangerBg: '#fdecea', warn: '#8a5300', warnBg: '#fff3d6', ok: '#137333', okBg: '#e4f4e9',
  focus: '#2f5bd3', overlay: 'rgba(17,24,39,0.45)', shadow: '0 1px 2px rgba(17,24,39,0.06), 0 4px 14px rgba(17,24,39,0.06)',
};
const dark = {
  bg: '#0f141c', surface: '#1a2130', surface2: '#232c3d', elevated: '#222b3b', field: '#141a25', line: '#2e384a',
  text: '#eef2f7', muted: '#a3afc0', border: '#6f7b8f', primary: '#7d9cf2', primarySoft: '#25324f', onPrimary: '#0f141c',
  danger: '#ff8f84', dangerBg: '#3a1916', warn: '#f5c25c', warnBg: '#332910', ok: '#6fdd9b', okBg: '#12291c',
  focus: '#a9bdf7', overlay: 'rgba(0,0,0,0.6)', shadow: '0 1px 2px rgba(0,0,0,0.4), 0 6px 18px rgba(0,0,0,0.35)',
};
export type Theme = typeof light;
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'sg:theme';
// Web reads localStorage synchronously so the first paint already has the right theme (no flash).
function initialPref(): ThemePref {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {}
  return 'system';
}

const ThemeCtx = createContext<{ pref: ThemePref; setPref: (p: ThemePref) => void; ready: boolean }>({ pref: 'system', setPref: () => {}, ready: true });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(initialPref);
  const [ready, setReady] = useState(Platform.OS === 'web');
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPrefState(v);
    }).finally(() => setReady(true));
  }, []);
  const setPref = (p: ThemePref) => {
    setPrefState(p);
    void AsyncStorage.setItem(KEY, p);
  };
  return <ThemeCtx.Provider value={{ pref, setPref, ready }}>{children}</ThemeCtx.Provider>;
}

export function useThemePref() {
  return useContext(ThemeCtx);
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const { pref } = useContext(ThemeCtx);
  return (pref === 'system' ? scheme : pref) === 'dark' ? dark : light;
}

export function useIsDark() {
  return useTheme() === dark;
}

// Web hover and keyboard focus ring; native ignores the extra keys.
type PState = { pressed: boolean; hovered?: boolean; focused?: boolean };
function interactive(t: Theme, st: PState, disabled?: boolean) {
  return {
    opacity: disabled ? 0.45 : st.pressed ? 0.8 : 1,
    outlineStyle: st.focused ? 'solid' : 'none',
    outlineWidth: 2,
    outlineOffset: 2,
    outlineColor: t.focus,
    filter: st.hovered && !disabled ? 'brightness(1.06)' : undefined,
  } as object;
}

const R = 14;

export function Btn({ title, onPress, disabled, secondary, danger }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; danger?: boolean }) {
  const t = useTheme();
  const bg = danger ? t.danger : secondary ? t.primarySoft : t.primary;
  const fg = danger ? t.onPrimary : secondary ? t.primary : t.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={(st) => ({ minHeight: 48, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, ...interactive(t, st as PState, disabled) })}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: fg }}>{title}</Text>
    </Pressable>
  );
}

// Compact action: tonal by default, outlined red for destructive, ghost for low emphasis.
export function SmallBtn({ title, onPress, danger, disabled, ghost, filled }: { title: string; onPress: () => void; danger?: boolean; disabled?: boolean; ghost?: boolean; filled?: boolean }) {
  const t = useTheme();
  const fg = filled ? t.onPrimary : danger ? t.danger : t.primary;
  const bg = filled ? t.primary : ghost || danger ? 'transparent' : t.primarySoft;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} onPress={onPress} disabled={disabled} hitSlop={4}
      style={(st) => ({ minHeight: 36, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', backgroundColor: bg, borderWidth: danger ? 1 : 0, borderColor: t.danger, ...interactive(t, st as PState, disabled) })}>
      <Text style={{ color: fg, fontWeight: '600', fontSize: 14 }}>{title}</Text>
    </Pressable>
  );
}

export function Screen({ children, title, subtitle, right }: { children: ReactNode; title?: string; subtitle?: string; right?: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: (title ? insets.top : 0) + 12, paddingBottom: 32, gap: 14, maxWidth: 760, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <View style={{ flexShrink: 1 }}>
            {subtitle ? <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>{subtitle}</Text> : null}
            <Text accessibilityRole="header" style={{ color: t.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>{title}</Text>
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}

export function Card({ children, accent, style, tone }: { children: ReactNode; accent?: string; style?: object; tone?: 'warn' | 'danger' | 'ok' }) {
  const t = useTheme();
  const bg = tone === 'warn' ? t.warnBg : tone === 'danger' ? t.dangerBg : tone === 'ok' ? t.okBg : t.surface;
  return (
    <View style={[{ padding: 14, gap: 10, borderRadius: R, backgroundColor: bg, borderWidth: 1, borderColor: tone ? 'transparent' : t.line, overflow: 'hidden', boxShadow: tone ? undefined : t.shadow }, style]}>
      {accent ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: accent }} /> : null}
      {children}
    </View>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8, marginTop: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function H({ children, size = 20 }: { children: ReactNode; size?: number }) {
  const t = useTheme();
  return <Text accessibilityRole="header" style={{ fontSize: size, fontWeight: '700', color: t.text }}>{children}</Text>;
}

export function T({ children, muted, bold, color, size, center }: { children: ReactNode; muted?: boolean; bold?: boolean; color?: string; size?: number; center?: boolean }) {
  const t = useTheme();
  return <Text style={{ color: color ?? (muted ? t.muted : t.text), fontWeight: bold ? '700' : '400', fontSize: size ?? 15, lineHeight: (size ?? 15) * 1.35, textAlign: center ? 'center' : undefined }}>{children}</Text>;
}

export function Pill({ label, color, soft }: { label: string; color?: string; soft?: boolean }) {
  const t = useTheme();
  const c = color ?? t.muted;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: soft ? t.surface2 : 'transparent', borderWidth: soft ? 0 : 1, borderColor: c }}>
      <Text style={{ color: soft ? t.muted : c, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Progress({ value, color, height = 6 }: { value: number; color?: string; height?: number }) {
  const t = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }} style={{ height, borderRadius: height, backgroundColor: t.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height, backgroundColor: color ?? t.primary, borderRadius: height }} />
    </View>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 96, padding: 12, borderRadius: R, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, gap: 2, boxShadow: t.shadow }}>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: color ?? t.text, fontSize: 20, fontWeight: '800' }}>{value}</Text>
    </View>
  );
}

export function Row({ children, wrap, style }: { children: ReactNode; wrap?: boolean; style?: object }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Field({ label, value, onChange, placeholder, multiline, keyboard, secure }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
  keyboard?: 'default' | 'numeric' | 'email-address'; secure?: boolean;
}) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6, flexGrow: 1, minWidth: 110 }}>
      <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
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
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{ borderWidth: 1.5, borderColor: focus ? t.primary : t.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: t.text, backgroundColor: t.field, minHeight: multiline ? 96 : 46, textAlignVertical: multiline ? 'top' : 'center' }}
      />
    </View>
  );
}

export function Chips<V extends string>({ options, value, onChange, label }: { options: readonly V[] | { value: V; label: string }[]; value: V | null; onChange: (v: V) => void; label?: string }) {
  const t = useTheme();
  const opts = (options as any[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o)) as { value: V; label: string }[];
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text> : null}
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {opts.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(o.value)}
              style={(st) => ({ minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, backgroundColor: on ? t.primary : t.surface2, borderWidth: 1, borderColor: on ? t.primary : t.line, ...interactive(t, st as PState) })}>
              <Text style={{ color: on ? t.onPrimary : t.text, fontSize: 14, fontWeight: on ? '700' : '500' }}>{o.label}</Text>
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
    <Row style={{ justifyContent: 'space-between', minHeight: 40 }}>
      <Text style={{ color: t.text, fontSize: 15, flexShrink: 1 }}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: t.primary, false: t.line }} thumbColor={t.surface} {...({ activeThumbColor: t.surface } as object)} />
    </Row>
  );
}

export function Banner({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'danger' | 'info' }) {
  const t = useTheme();
  const bg = tone === 'danger' ? t.dangerBg : tone === 'warn' ? t.warnBg : t.primarySoft;
  return <View accessibilityRole="alert" style={{ padding: 12, borderRadius: 12, backgroundColor: bg, gap: 6 }}>{children}</View>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ padding: 20, borderRadius: R, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line, alignItems: 'center', gap: 6 }}>
      <Text style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>{title}</Text>
      {body ? <Text style={{ color: t.muted, textAlign: 'center' }}>{body}</Text> : null}
      {action}
    </View>
  );
}

// Bottom sheet on phones, centered dialog on wide screens.
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 700;
  return (
    <Modal visible transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.overlay, justifyContent: wide ? 'center' : 'flex-end', padding: wide ? 24 : 0 }}>
        <Pressable accessibilityLabel="Close" style={{ position: 'absolute', inset: 0 } as object} onPress={onClose} />
        <View style={{ maxHeight: '92%', width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: t.elevated, boxShadow: t.shadow, borderRadius: 20, borderBottomLeftRadius: wide ? 20 : 0, borderBottomRightRadius: wide ? 20 : 0, paddingBottom: wide ? 0 : insets.bottom }}>
          {!wide ? <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.line, marginTop: 8 }} /> : null}
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 14 }}>
            <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '800', color: t.text }}>{title}</Text>
            <SmallBtn ghost title="Close" onPress={onClose} />
          </Row>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(iv);
  }, [ms]);
  return now;
}
