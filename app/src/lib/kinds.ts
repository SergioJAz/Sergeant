// Which of the four kinds a schedule thing is. Phase 3 adds side_project_id / errand_id branches to kindOfBlock.
import type { FixedEvent } from './types.ts';

export type Kind = 'uni' | 'proj' | 'train' | 'err';
export const KINDS: readonly Kind[] = ['uni', 'proj', 'train', 'err'];
export const KIND_LETTER: Record<Kind, string> = { uni: 'U', proj: 'P', train: 'T', err: 'E' };
export const KIND_LABEL: Record<Kind, string> = { uni: 'Uni', proj: 'Side project', train: 'Training', err: 'Errand' };

export const kindOfBlock = (b: { course_id: string | null; item_id: string | null }): Kind | null => (b.course_id || b.item_id ? 'uni' : null);
export const kindOfFixed = (f: { kind: FixedEvent['kind'] }): Kind | null => (f.kind === 'class' ? 'uni' : f.kind === 'sport' ? 'train' : null);
export const kindOfOneoff = (o: { item_id: string | null }): Kind | null => (o.item_id ? 'uni' : null);
