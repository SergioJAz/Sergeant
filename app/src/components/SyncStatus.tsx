import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { useStore } from '@/lib/store';
import { T, useTheme } from '@/lib/ui';

// Contracts 1: pending, failed and conflict counts visible on Today and Settings.
// quiet: show nothing while everything is synced (phone headers).
export function SyncStatus({ quiet }: { quiet?: boolean }) {
  const { queue, status, data } = useStore();
  const t = useTheme();
  const pending = queue.filter((o) => o.state === 'pending' || o.state === 'sent').length;
  const failed = queue.filter((o) => o.state === 'failed').length;
  const rejected = queue.filter((o) => o.state === 'rejected' || o.state === 'conflict').length;
  const conflicts = data.sync_conflicts.filter((c) => !c.resolved_at).length;
  const bad = failed + rejected + conflicts > 0;
  const text = status.syncing
    ? 'Syncing...'
    : [
        pending ? `${pending} saved on device` : null,
        failed ? `${failed} failed (offline?)` : null,
        rejected ? `${rejected} rejected` : null,
        conflicts ? `${conflicts} conflicts` : null,
      ].filter(Boolean).join(', ') || (status.error ? 'Sync failed' : status.lastSync ? 'All synced' : 'Not synced yet');
  if (quiet && !bad && !pending && !status.syncing && !status.error) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Sync status: ${text}`} onPress={() => router.push('/settings')}
      style={{ alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: bad ? t.danger : t.line }}>
      <T size={13} color={bad ? t.danger : t.muted}>{text}</T>
    </Pressable>
  );
}
