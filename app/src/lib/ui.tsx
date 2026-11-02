import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_APPEARANCE, parseAppearance, resolveMode, resolveTokens, type Appearance, type CustomTheme, type Overrides } from '@/theme/appearance';
import { fontFamily } from '@/theme/fonts';
import type { Mode, Tokens } from '@/theme/palette';

export type Theme = Tokens & {
  mode: Mode; font: (bold?: boolean) => string | undefined; fs: (size: number) => number; radius: number; spacing: number;
  cardStyle: Appearance['cardStyle']; markers: Appearance['markers']; tabLabels: boolean; clock24: boolean; nav: Appearance['nav'];
};
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'sg:appearance';
const LEGACY = 'sg:theme';
// Web reads localStorage synchronously so the first paint already has the right theme (no flash).
function initialAppearance(): Appearance {
  try {
    if (typeof localStorage !== 'undefined') return parseAppearance(localStorage.getItem(KEY), localStorage.getItem(LEGACY));
  } catch {}
  return DEFAULT_APPEARANCE;
}

// ThemeProvider sits above StoreProvider, so custom themes arrive through CustomThemeBridge.
let customList: CustomTheme[] = [];
let pushCustom: (l: CustomTheme[]) => void = () => {};
export function setCustomThemes(list: CustomTheme[]) {
  customList = list;
  pushCustom(list);
}

type Ctx = { theme: Theme; appearance: Appearance; update: (patch: Partial<Appearance>) => void; setDraft: (o: Overrides | null) => void; ready: boolean };
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [appearance, setAppearance] = useState<Appearance>(initialAppearance);
  const [custom, setCustom] = useState(customList);
  const [draft, setDraft] = useState<Overrides | null>(null);
  const [ready, setReady] = useState(Platform.OS === 'web');
  useEffect(() => {
    pushCustom = setCustom;
    setCustom(customList);
    return () => { pushCustom = () => {}; };
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AsyncStorage.multiGet([KEY, LEGACY])
      .then(([[, raw], [, legacy]]) => setAppearance(parseAppearance(raw, legacy)))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  const value = useMemo<Ctx>(() => {
    const a = appearance, dark = scheme === 'dark';
    const theme: Theme = {
      ...resolveTokens(a, dark, custom, draft ?? undefined), mode: resolveMode(a, dark),
      font: (bold) => fontFamily(a.font, !!bold), fs: (n) => Math.round(n * a.textScale),
      radius: a.radius, spacing: a.spacing, cardStyle: a.cardStyle, markers: a.markers, tabLabels: a.tabLabels, clock24: a.clock24, nav: a.nav,
    };
    const update = (patch: Partial<Appearance>) => setAppearance((prev) => {
      const next = { ...prev, ...patch };
      void AsyncStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
    return { theme, appearance: a, update, setDraft, ready };
  }, [appearance, scheme, custom, draft, ready]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

function useThemeCtx() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export function useAppearance() {
  const { appearance, update, setDraft, ready } = useThemeCtx();
  return { appearance, update, setDraft, ready };
}

export function useThemePref() {
  const { appearance, update, ready } = useThemeCtx();
  return { pref: appearance.mode as ThemePref, setPref: (p: ThemePref) => update({ mode: p }), ready };
}

export function useTheme(): Theme {
  return useThemeCtx().theme;
}

export function useIsDark() {
  return useTheme().mode === 'dark';
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

// Custom faces are already bold or regular; a fontWeight on top would give faux bold or a fallback face.
const txt = (t: Theme, size: number, weight?: '400' | '500' | '600' | '700' | '800') => {
  const fontFamily = t.font(!!weight && weight >= '600');
  return { fontSize: t.fs(size), fontFamily, fontWeight: fontFamily ? ('normal' as const) : weight };
};
const small = (t: Theme) => Math.max(4, t.radius - 2);
const pill = (t: Theme) => t.radius * 3; // default 42 reads as a full pill; 0 gives square chips
function box(t: Theme) {
  if (t.cardStyle === 'outline') return { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: t.line };
  if (t.cardStyle === 'shadow') return { backgroundColor: t.surface, borderWidth: 0, boxShadow: t.shadow };
  return { backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, boxShadow: t.shadow };
}

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
      style={(st) => ({ minHeight: 48, paddingHorizontal: t.spacing + 8, borderRadius: small(t), alignItems: 'center', justifyContent: 'center', backgroundColor: bg, ...interactive(t, st as PState, disabled) })}>
      <Text style={{ ...txt(t, 16, '700'), color: fg }}>{title}</Text>
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
      style={(st) => ({ minHeight: 36, paddingHorizontal: t.spacing + 2, borderRadius: Math.max(4, t.radius - 4), justifyContent: 'center', backgroundColor: bg, borderWidth: danger ? 1 : 0, borderColor: t.danger, ...interactive(t, st as PState, disabled) })}>
      <Text style={{ ...txt(t, 14, '600'), color: fg }}>{title}</Text>
    </Pressable>
  );
}

// wide: no 760px cap, for screens that lay out their own columns.
export function Screen({ children, title, subtitle, right, wide }: { children: ReactNode; title?: string; subtitle?: string; right?: ReactNode; wide?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: (title ? insets.top : 0) + 12, paddingBottom: 32, gap: 14, maxWidth: wide ? undefined : 760, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <View style={{ flexShrink: 1 }}>
            {subtitle ? <Text style={{ ...txt(t, 13, '600'), color: t.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{subtitle}</Text> : null}
            <Text accessibilityRole="header" style={{ ...txt(t, 30, '800'), color: t.text, letterSpacing: -0.5 }}>{title}</Text>
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
  const look = tone ? { backgroundColor: tone === 'warn' ? t.warnBg : tone === 'danger' ? t.dangerBg : t.okBg, borderWidth: 1, borderColor: 'transparent' } : box(t);
  return (
    <View style={[{ padding: t.spacing + 4, gap: t.spacing, borderRadius: t.radius, overflow: 'hidden', ...look }, style]}>
      {accent ? <View style={{ position: 'absolute', left: 7, top: 7, width: 10, height: 10, borderRadius: 5, backgroundColor: accent }} /> : null}
      {children}
    </View>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8, marginTop: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text accessibilityRole="header" style={{ ...txt(t, 18, '700'), color: t.text }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function H({ children, size = 20 }: { children: ReactNode; size?: number }) {
  const t = useTheme();
  return <Text accessibilityRole="header" style={{ ...txt(t, size, '700'), color: t.text }}>{children}</Text>;
}

export function T({ children, muted, bold, color, size, center }: { children: ReactNode; muted?: boolean; bold?: boolean; color?: string; size?: number; center?: boolean }) {
  const t = useTheme();
  return <Text style={{ color: color ?? (muted ? t.muted : t.text), ...txt(t, size ?? 15, bold ? '700' : '400'), lineHeight: t.fs(size ?? 15) * 1.35, textAlign: center ? 'center' : undefined }}>{children}</Text>;
}

export function Pill({ label, color, soft }: { label: string; color?: string; soft?: boolean }) {
  const t = useTheme();
  const c = color ?? t.muted;
  return (
    <View style={{ paddingHorizontal: t.spacing - 2, paddingVertical: 2, borderRadius: pill(t), backgroundColor: soft ? t.surface2 : 'transparent', borderWidth: soft ? 0 : 1, borderColor: c }}>
      <Text style={{ ...txt(t, 12, '700'), color: soft ? t.muted : c }}>{label}</Text>
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
    <View style={{ flex: 1, minWidth: 96, padding: t.spacing + 2, borderRadius: t.radius, ...box(t), gap: 2 }}>
      <Text style={{ ...txt(t, 12, '600'), color: t.muted }}>{label}</Text>
      <Text style={{ ...txt(t, 20, '800'), color: color ?? t.text }}>{value}</Text>
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
      <Text style={{ ...txt(t, 13, '600'), color: t.muted }}>{label}</Text>
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
        style={{ borderWidth: 1.5, borderColor: focus ? t.primary : t.line, borderRadius: Math.max(4, t.radius - 4), paddingHorizontal: t.spacing + 2, paddingVertical: t.spacing, ...txt(t, 16), color: t.text, backgroundColor: t.field, minHeight: multiline ? 96 : 46, textAlignVertical: multiline ? 'top' : 'center' }}
      />
    </View>
  );
}

export function Chips<V extends string>({ options, value, onChange, label }: { options: readonly V[] | { value: V; label: string }[]; value: V | null; onChange: (v: V) => void; label?: string }) {
  const t = useTheme();
  const opts = (options as any[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o)) as { value: V; label: string }[];
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ ...txt(t, 13, '600'), color: t.muted }}>{label}</Text> : null}
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {opts.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(o.value)}
              style={(st) => ({ minHeight: 34, justifyContent: 'center', paddingHorizontal: t.spacing + 2, borderRadius: pill(t), backgroundColor: on ? t.primary : t.surface2, borderWidth: 1, borderColor: on ? t.primary : t.line, ...interactive(t, st as PState) })}>
              <Text style={{ ...txt(t, 14, on ? '700' : '500'), color: on ? t.onPrimary : t.text }}>{o.label}</Text>
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
      <Text style={{ ...txt(t, 15), color: t.text, flexShrink: 1 }}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: t.primary, false: t.line }} thumbColor={t.surface} {...({ activeThumbColor: t.surface } as object)} />
    </Row>
  );
}

export function Banner({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'danger' | 'info' }) {
  const t = useTheme();
  const bg = tone === 'danger' ? t.dangerBg : tone === 'warn' ? t.warnBg : t.primarySoft;
  return <View accessibilityRole="alert" style={{ padding: t.spacing + 2, borderRadius: small(t), backgroundColor: bg, gap: 6 }}>{children}</View>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ padding: t.spacing * 2, borderRadius: t.radius, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line, alignItems: 'center', gap: 6 }}>
      <Text style={{ ...txt(t, 15, '700'), color: t.text }}>{title}</Text>
      {body ? <Text style={{ ...txt(t, 14), color: t.muted, textAlign: 'center' }}>{body}</Text> : null}
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
        <View style={{ maxHeight: '92%', width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: t.elevated, boxShadow: t.shadow, borderRadius: t.radius + 6, borderBottomLeftRadius: wide ? t.radius + 6 : 0, borderBottomRightRadius: wide ? t.radius + 6 : 0, paddingBottom: wide ? 0 : insets.bottom }}>
          {!wide ? <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.line, marginTop: 8 }} /> : null}
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: t.spacing + 8, paddingTop: t.spacing + 4 }}>
            <Text accessibilityRole="header" style={{ ...txt(t, 20, '800'), color: t.text }}>{title}</Text>
            <SmallBtn ghost title="Close" onPress={onClose} />
          </Row>
          <ScrollView contentContainerStyle={{ padding: t.spacing + 8, gap: t.spacing + 2 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
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
