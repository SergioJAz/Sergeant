import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { blockEndMs, blockStartMs, blocksOn, getTz } from '@/lib/domain';
import { useStore } from '@/lib/store';
import { localDate } from '@/lib/time';
import { H, Progress, T, useNow, useTheme, useThemePref, type ThemePref } from '@/lib/ui';
import { navLayout } from '@/theme/layout';

// Tab bar for every position: bottom/top bar, left/right icon rail, or full labeled sidebar on wide screens.
export function NavBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const t = useTheme();
  const nl = navLayout(useWindowDimensions().width, t.nav);
  const { position, vertical, full } = nl;
  const beside = nl.labelsBeside || full;
  const showLabels = full || t.tabLabels;
  const onToday = state.routes[state.index]?.name === 'index';

  const items = (
    <View role="tablist" style={{ flexDirection: vertical ? 'column' : 'row', justifyContent: nl.justify, gap: 8, flex: full ? undefined : 1 }}>
      {state.routes.map((route, i) => {
        const focused = i === state.index;
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const color = focused ? t.primary : t.muted;
        const onPress = () => {
          const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigateToTab(route.key);
        };
        return (
          <Pressable key={route.key} role="tab" aria-selected={focused} accessibilityLabel={label} onPress={onPress}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            style={({ pressed }) => ({ minHeight: 44, minWidth: 44, opacity: pressed ? 0.8 : 1, flexDirection: beside ? 'row' : 'column', alignItems: 'center', gap: beside ? 10 : 4 })}>
            <View style={{ width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? t.primarySoft : 'transparent' }}>
              {options.tabBarIcon?.({ focused, color, size: 22 })}
            </View>
            {showLabels ? (
              <T bold size={beside ? 14 : 11} color={focused ? t.text : t.muted}>{label}</T>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  const edge = { top: 'borderBottomWidth', bottom: 'borderTopWidth', left: 'borderRightWidth', right: 'borderLeftWidth' }[position];
  return (
    <View style={{
      flexDirection: vertical ? 'column' : 'row', backgroundColor: t.surface, borderColor: t.line, [edge]: 1, gap: 12,
      width: vertical ? (full ? 250 : 88) : undefined,
      // The bar spans the whole screen edge, so it keeps every inset except the one opposite it.
      paddingTop: 8 + (position !== 'bottom' ? insets.top : 0), paddingBottom: 8 + (position !== 'top' ? insets.bottom : 0),
      paddingLeft: (full ? 16 : 8) + (position !== 'right' ? insets.left : 0), paddingRight: (full ? 16 : 8) + (position !== 'left' ? insets.right : 0),
    }}>
      {full ? (
        // Scrolls on short windows so the mode switch stays reachable.
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, gap: 12 }}>
          <View style={{ paddingVertical: 8 }}><H size={22}>Sergeant</H></View>
          {items}
          <SidebarExtras showNow={!onToday} />
        </ScrollView>
      ) : items}
    </View>
  );
}

function SidebarExtras({ showNow }: { showNow: boolean }) {
  const t = useTheme();
  const { data } = useStore();
  const { pref, setPref } = useThemePref();
  const now = useNow(30_000);
  const tz = getTz(data);
  const blocks = blocksOn(data, localDate(now, tz)).filter((b) => b.status === 'planned');
  const current = blocks.find((b) => blockStartMs(b, tz) <= now && now < blockEndMs(b, tz));
  const next = blocks.find((b) => blockStartMs(b, tz) > now);
  const title = (b: (typeof blocks)[number]) => b.what ?? data.items.find((i) => i.id === b.item_id)?.title ?? b.type;
  const deadline = data.items
    .filter((i) => i.status === 'active' && i.due_at && Date.parse(i.due_at) >= now)
    .sort((a, b) => a.due_at!.localeCompare(b.due_at!))[0];
  const card = { backgroundColor: t.surface2, borderRadius: t.radius, padding: 12, gap: 4 };

  return (
    <View style={{ flexGrow: 1, gap: 12 }}>
      {showNow ? (
        <View style={card}>
          {current ? (
            <>
              <T muted size={13}>Now · ends {current.end_time.slice(0, 5)}</T>
              <T bold>{title(current)}</T>
              <T muted size={13}>{`${Math.ceil((blockEndMs(current, tz) - now) / 60_000)} min left`}</T>
              <Progress value={(now - blockStartMs(current, tz)) / (blockEndMs(current, tz) - blockStartMs(current, tz))} />
            </>
          ) : (
            <T bold>{next ? `Free now · Next: ${title(next)}` : 'Free now'}</T>
          )}
        </View>
      ) : null}
      {deadline ? (
        <View style={card}>
          <T muted size={13}>Next deadline</T>
          <T bold>{deadline.title}</T>
          <T muted size={13}>{`due ${new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(new Date(deadline.due_at!))}`}</T>
        </View>
      ) : null}
      <View role="radiogroup" accessibilityLabel="Appearance" style={{ marginTop: 'auto', flexDirection: 'row', gap: 3, padding: 3, borderRadius: 12, backgroundColor: t.line }}>
        {(['system', 'light', 'dark'] as ThemePref[]).map((m) => (
          <Pressable key={m} role="radio" aria-checked={pref === m} onPress={() => setPref(m)}
            style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: pref === m ? t.surface : 'transparent' }}>
            <T bold size={14}>{m[0].toUpperCase() + m.slice(1)}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
