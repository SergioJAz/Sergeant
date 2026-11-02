import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, useColorScheme, View } from 'react-native';

import { useStore, uuid } from '@/lib/store';
import { Btn, Card, Chips, Field, Pill, Row, Section, Sheet, SmallBtn, T, useAppearance, useTheme } from '@/lib/ui';
import { contrastWarnings, customThemesFrom, EDITABLE, type Appearance, type CustomTheme, type Overrides } from '@/theme/appearance';
import { buildTokens, FAMILIES, isHex, type FamilyId, type Mode } from '@/theme/palette';

type Key = typeof EDITABLE[number];
const LABELS: Record<Key, string> = {
  bg: 'Background', surface: 'Cards', text: 'Text', muted: 'Secondary text', line: 'Lines', hero: 'Now card', onHero: 'Now card text',
  bar: 'Progress bar', uni: 'Uni', proj: 'Side projects', train: 'Training', err: 'Errands',
};
// Which rows each contrastWarnings label involves.
const WARN: Record<string, Key[]> = {
  'Text on background': ['text', 'bg'], 'Text on cards': ['text', 'surface'], 'Secondary text on cards': ['muted', 'surface'],
  'Now card text': ['onHero', 'hero'], 'Uni color': ['uni'], 'Side project color': ['proj'], 'Training color': ['train'], 'Errand color': ['err'], 'Progress bar': ['bar'],
};
const PALETTE = [
  '#000000', '#1f2937', '#4b5563', '#9ca3af', '#e5e7eb', '#ffffff', '#7f1d1d', '#dc2626', '#f87171', '#9a3412', '#ea580c', '#fdba74',
  '#a16207', '#facc15', '#fef08a', '#166534', '#22c55e', '#86efac', '#1e3a8a', '#3b82f6', '#93c5fd', '#581c87', '#a855f7', '#f472b6',
];
const NO_DRAFT = { light: {}, dark: {} } as Record<Mode, Overrides>;
const isFamily = (id: string) => FAMILIES.some((f) => f.id === id);

function Swatch({ name, light, dark, on, onPress }: { name: string; light: Overrides; dark: Overrides; on: boolean; onPress: () => void }) {
  const t = useTheme();
  const half = (o: Overrides) => (
    <View style={{ flex: 1, backgroundColor: o.bg, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 12, height: 22, borderRadius: 4, backgroundColor: o.hero }} />
    </View>
  );
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={name} onPress={onPress}
      style={{ width: '25%', alignItems: 'center', gap: 4, paddingVertical: 6 }}>
      <View style={{ width: 54, height: 54, flexDirection: 'row', borderRadius: Math.max(6, t.radius), overflow: 'hidden', borderWidth: 2, borderColor: on ? t.primary : t.line }}>
        {half(light)}{half(dark)}
      </View>
      <T size={12} bold={on} center>{name}</T>
    </Pressable>
  );
}

const variants = (base: FamilyId, c?: CustomTheme) => ({ light: { ...buildTokens(base, 'light'), ...c?.light }, dark: { ...buildTokens(base, 'dark'), ...c?.dark } });

// Returns sections 0 to 3 (Appearance, My themes, Themes, Colors); they share the colour draft, so one hook builds all four.
export function useThemeSections(saveConfig: (patch: Record<string, unknown>) => Promise<void>): ReactNode[] {
  const t = useTheme();
  const systemDark = useColorScheme() === 'dark';
  const { appearance: a, update, setDraft } = useAppearance();
  const config = useStore().data.settings[0]?.config;
  const custom = customThemesFrom(config);
  const active = custom.find((c) => c.id === a.themeId);
  const base: FamilyId = isFamily(a.themeId) ? (a.themeId as FamilyId) : active?.base ?? 'classic';
  const mode = t.mode;
  const [drafts, setDrafts] = useState(NO_DRAFT);
  const [editing, setEditing] = useState<Key | null>(null);
  const [hex, setHex] = useState('');
  const [naming, setNaming] = useState<string | null>(null);

  useEffect(() => setDrafts(NO_DRAFT), [a.themeId]);
  useEffect(() => setDraft(Object.keys(drafts[mode]).length ? drafts[mode] : null), [drafts, mode, setDraft]);
  useEffect(() => () => setDraft(null), [setDraft]);

  const setColor = (k: Key, v: string) => setDrafts((d) => ({ ...d, [mode]: { ...d[mode], [k]: v } }));
  // Keep only the colours that differ from the base family, so a stored theme stays small.
  const merged = (m: Mode, from?: Overrides) => {
    const b = buildTokens(base, m), all = { ...from, ...drafts[m] }, r: Overrides = {};
    for (const k of EDITABLE) if (isHex(all[k]) && all[k] !== b[k]) r[k] = all[k];
    return r;
  };
  async function saveList(list: CustomTheme[], themeId: string) {
    await saveConfig({ custom_themes: list });
    setDrafts(NO_DRAFT);
    update({ themeId });
  }
  const saveNew = (name: string) => {
    const id = uuid();
    setNaming(null);
    void saveList([...custom, { id, name, base, light: merged('light'), dark: merged('dark') }], id);
  };
  const saveChanges = (c: CustomTheme) => saveList(custom.map((x) => (x.id === c.id ? { ...c, light: merged('light', c.light), dark: merged('dark', c.dark) } : x)), c.id);
  // A custom variant resets to its base family, which takes a draft of the base colours to undo its saved ones.
  const reset = (m: Mode) => setDrafts((d) => ({ ...d, [m]: active ? Object.fromEntries(EDITABLE.map((k) => [k, buildTokens(base, m)[k]])) : {} }));

  const warned = new Set(contrastWarnings(t).flatMap((w) => WARN[w] ?? []));
  const modes: { value: Appearance['mode']; label: string }[] = [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }];

  return [
    <Section key="appearance" title="Appearance">
      <Card>
        <Chips options={modes} value={a.mode} onChange={(v) => update({ mode: v })} />
        <T muted size={13}>{a.mode === 'system' ? `Following your phone: ${systemDark ? 'dark' : 'light'} right now` : `Always ${a.mode}`}</T>
      </Card>
    </Section>,
    <Section key="mine" title="My themes">
      <Card>
        <Row wrap style={{ gap: 0 }}>
          {custom.map((c) => <Swatch key={c.id} name={c.name} {...variants(c.base, c)} on={c.id === a.themeId} onPress={() => update({ themeId: c.id })} />)}
          <Pressable accessibilityRole="button" accessibilityLabel="New theme" onPress={() => (active ? update({ themeId: base }) : setDrafts(NO_DRAFT))}
            style={{ width: '25%', alignItems: 'center', gap: 4, paddingVertical: 6 }}>
            <View style={{ width: 54, height: 54, borderRadius: Math.max(6, t.radius), borderWidth: 2, borderStyle: 'dashed', borderColor: t.muted, alignItems: 'center', justifyContent: 'center' }}>
              <T size={24} muted>+</T>
            </View>
            <T size={12} center>New</T>
          </Pressable>
        </Row>
        {!custom.length ? <T muted size={13}>Pick a theme below, edit its colors, then Save as my theme.</T> : null}
      </Card>
    </Section>,
    <Section key="themes" title="Themes" right={<T muted size={13}>left light, right dark</T>}>
      <Card>
        <Row wrap style={{ gap: 0 }}>
          {FAMILIES.map((f) => <Swatch key={f.id} name={f.label} {...variants(f.id)} on={f.id === a.themeId} onPress={() => update({ themeId: f.id })} />)}
        </Row>
      </Card>
    </Section>,
    <Section key="colors" title={active ? `Editing "${active.name}"` : 'Colors'}>
      <Card>
        <Chips options={[{ value: 'light', label: 'Edit light' }, { value: 'dark', label: 'Edit dark' }]} value={mode} onChange={(v) => update({ mode: v })} />
        {EDITABLE.map((k) => (
          <Row key={k} style={{ justifyContent: 'space-between', minHeight: 40 }}>
            <Row style={{ flexShrink: 1 }}>
              <T>{LABELS[k]}</T>
              {warned.has(k) ? <Pill label="Low contrast" color={t.danger} /> : null}
            </Row>
            <Pressable accessibilityRole="button" accessibilityLabel={`${LABELS[k]} color ${t[k]}`} onPress={() => { setHex(t[k]); setEditing(k); }}
              style={{ width: 44, height: 32, borderRadius: Math.max(4, t.radius - 6), backgroundColor: t[k], borderWidth: 1.5, borderColor: t.line }} />
          </Row>
        ))}
        {active ? (
          <Row wrap>
            <Btn title="Save changes" onPress={() => void saveChanges(active)} />
            <SmallBtn danger title="Delete" onPress={() => void saveList(custom.filter((x) => x.id !== active.id), base)} />
          </Row>
        ) : <Btn title="Save as my theme" onPress={() => setNaming('')} />}
        <Row wrap>
          <SmallBtn ghost title="Reset light" onPress={() => reset('light')} />
          <SmallBtn ghost title="Reset dark" onPress={() => reset('dark')} />
        </Row>
      </Card>
      {editing ? (
        <Sheet title={`${LABELS[editing]} (${mode})`} onClose={() => setEditing(null)}>
          <Row wrap style={{ gap: 6 }}>
            {PALETTE.map((c) => (
              <Pressable key={c} accessibilityRole="button" accessibilityLabel={c} onPress={() => { setHex(c); setColor(editing, c); }}
                style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: c, borderWidth: 2, borderColor: c === t[editing] ? t.primary : t.line }} />
            ))}
          </Row>
          <Field label="Hex color" value={hex} placeholder="#1a2b3c" onChange={(v) => { setHex(v); if (isHex(v)) setColor(editing, v.toLowerCase()); }} />
          {hex && !isHex(hex) ? <T muted size={13}>Use # and 6 hex digits, like #1a2b3c.</T> : null}
        </Sheet>
      ) : null}
      {naming !== null ? (
        <Sheet title="Save as my theme" onClose={() => setNaming(null)}>
          <Field label="Name" value={naming} placeholder="Comic night" onChange={setNaming} />
          <Btn title="Save" disabled={!naming.trim()} onPress={() => saveNew(naming.trim())} />
        </Sheet>
      ) : null}
    </Section>,
  ];
}
