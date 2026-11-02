import { Pressable, Text, View } from 'react-native';

import { Card, Chips, Row, Section, SmallBtn, T, useAppearance, useTheme } from '@/lib/ui';
import { DEFAULT_APPEARANCE, type Appearance } from '@/theme/appearance';
import { fontFamily, FONTS } from '@/theme/fonts';

const SIZES = [{ value: '0.85', label: 'XS' }, { value: '0.92', label: 'S' }, { value: '1', label: 'M' }, { value: '1.08', label: 'L' }, { value: '1.16', label: 'XL' }];

export function TextSection() {
  const t = useTheme();
  const { appearance: a, update } = useAppearance();
  return (
    <Section title="Text">
      <Card>
        <T muted size={13} bold>Font</T>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {FONTS.map((f) => {
            const on = f.id === a.font;
            return (
              <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => update({ font: f.id })}
                style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: t.spacing + 2, borderRadius: t.radius * 3, backgroundColor: on ? t.primary : t.surface2, borderWidth: 1, borderColor: on ? t.primary : t.line }}>
                {/* Each label in its own face; no fontWeight, which would fake bold on a custom font. */}
                <Text style={{ fontFamily: fontFamily(f.id, false), fontSize: t.fs(15), color: on ? t.onPrimary : t.text }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Chips label="Size" options={SIZES} value={String(a.textScale)} onChange={(v) => update({ textScale: Number(v) as Appearance['textScale'] })} />
      </Card>
    </Section>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', minHeight: 40 }}>
      <T>{label}</T>
      <Row>
        <SmallBtn title="-" disabled={value <= min} onPress={() => onChange(Math.max(min, value - 2))} />
        <SmallBtn title="+" disabled={value >= max} onPress={() => onChange(Math.min(max, value + 2))} />
      </Row>
    </Row>
  );
}

export function LayoutSection() {
  const { appearance: a, update } = useAppearance();
  return (
    <Section title="Layout">
      <Card>
        <Stepper label={`Corner roundness: ${a.radius}px`} value={a.radius} min={0} max={26} onChange={(radius) => update({ radius })} />
        <Stepper label={`Spacing: ${a.spacing < 8 ? 'tight' : a.spacing > 13 ? 'roomy' : 'normal'} (${a.spacing})`} value={a.spacing} min={4} max={20} onChange={(spacing) => update({ spacing })} />
        <Chips label="Card style" options={[{ value: 'filled', label: 'Filled' }, { value: 'outline', label: 'Outline' }, { value: 'shadow', label: 'Shadow' }]} value={a.cardStyle} onChange={(cardStyle) => update({ cardStyle })} />
        <Chips label="Block markers" options={[{ value: 'letter', label: 'Letters' }, { value: 'dot', label: 'Dots' }, { value: 'none', label: 'None' }]} value={a.markers} onChange={(markers) => update({ markers })} />
        <Chips label="Tab bar" options={[{ value: 'on', label: 'Icons + text' }, { value: 'off', label: 'Icons only' }]} value={a.tabLabels ? 'on' : 'off'} onChange={(v) => update({ tabLabels: v === 'on' })} />
        <Chips label="Clock" options={[{ value: '24', label: '24-hour' }, { value: '12', label: '12-hour' }]} value={a.clock24 ? '24' : '12'} onChange={(v) => update({ clock24: v === '24' })} />
        <SmallBtn ghost title="Reset all" onPress={() => update({ ...DEFAULT_APPEARANCE, mode: a.mode })} />
      </Card>
    </Section>
  );
}

export function NavSection() {
  const { appearance: a, update } = useAppearance();
  const nav = (patch: Partial<Appearance['nav']>) => update({ nav: { ...a.nav, ...patch } });
  return (
    <Section title="Navigation bar">
      <Card>
        <Chips label="Position" options={[{ value: 'auto', label: 'Auto' }, { value: 'bottom', label: 'Bottom' }, { value: 'top', label: 'Top' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} value={a.nav.position} onChange={(position) => nav({ position })} />
        <Chips label="Alignment" options={[{ value: 'auto', label: 'Auto' }, { value: 'start', label: 'Start' }, { value: 'center', label: 'Center' }, { value: 'end', label: 'End' }, { value: 'spread', label: 'Spread' }]} value={a.nav.align} onChange={(align) => nav({ align })} />
        <Chips label="Side bar" options={[{ value: 'auto', label: 'Auto' }, { value: 'icons', label: 'Icons' }, { value: 'full', label: 'Full' }]} value={a.nav.sidebar} onChange={(sidebar) => nav({ sidebar })} />
        <T muted size={13}>Auto = bottom on phones, left rail on tablets, full sidebar on wide screens.</T>
      </Card>
    </Section>
  );
}
