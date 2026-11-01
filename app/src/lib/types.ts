// Row shapes mirror supabase/migrations/20261031120000_schema.sql. Times come back as 'HH:MM:SS'.

type Base = { id: string; rev: number; created_at?: string; updated_at?: string };

export type Course = Base & {
  code: string; name: string; short: string; color: string | null; professor: string | null;
  semester: string | null; notes: string | null; status: 'active' | 'archived'; archived_at: string | null;
};
export type ItemType = 'exam' | 'project' | 'homework' | 'lab' | 'quiz' | 'catchup';
export type Item = Base & {
  course_id: string; type: ItemType; title: string; due_at: string | null; due_confirmed: boolean;
  duration_min: number | null; travel_before_min: number; travel_after_min: number; scope: string | null;
  rules: string | null; needs_laptop: boolean; weight_pct: number | null; priority_boost: number;
  status: 'active' | 'done' | 'archived'; archived_at: string | null;
};
export type ChunkKind = 'notes' | 'problems' | 'review' | 'mock' | 'cheat_sheet' | 'lab_work' | 'writing' | 'other';
export type Chunk = Base & {
  item_id: string; position: number; title: string; kind: ChunkKind; source_ref: string | null;
  est_blocks: number; est_unit_min: number; est_min?: number; milestone_due: string | null;
  status: 'todo' | 'partial' | 'done' | 'skipped'; archived_at: string | null;
};
export type FixedEvent = Base & {
  label: string; kind: 'class' | 'sport' | 'commute' | 'sleep' | 'other'; weekdays: number[];
  start_time: string; end_time: string; valid_from: string | null; valid_to: string | null;
  never_cut: boolean; course_id: string | null;
};
export type Oneoff = Base & {
  label: string; date: string; all_day: boolean; start_time: string | null; end_time: string | null;
  kind: 'blocked' | 'off' | 'trip' | 'exam'; item_id: string | null;
};
export type BlockType = 'Notes' | 'Problems' | 'Review' | 'Mock' | 'CheatSheet' | 'Buffer' | 'Rest' | 'Break' | 'Fixed';
export type BlockStatus = 'planned' | 'done' | 'partial' | 'skipped' | 'moved';
export type Subtask = { name: string; plan_min: number };
export type Block = Base & {
  date: string; start_time: string; end_time: string; course_id: string | null; item_id: string | null;
  chunk_ids: string[]; what: string | null; type: BlockType; source: 'auto' | 'claude' | 'manual' | 'import';
  locked: boolean; status: BlockStatus; moved_to_id: string | null; subtasks: Subtask[];
  legacy_key: string | null; import_batch_id: string | null; deleted_at: string | null;
};
export type TimeLog = Base & {
  block_id: string | null; started_at: string; ended_at: string; plan_min: number; actual_min: number;
  pages: string | null; completed: boolean; focus: number | null; note: string | null;
  subtasks: { name: string; plan: number; act: number }[]; legacy_key: string | null; deleted_at: string | null;
};
export type ProgressEntry = Base & { chunk_id: string; time_log_id: string | null; done_min: number };
export type Milestone = Base & { date: string; title: string; parts: string[]; done: boolean };
export type ActiveTimer = Base & {
  block_id: string; phase: 'study' | 'break'; state: 'running' | 'paused'; segment_started_at: string | null;
  elapsed_ms: number; phase_target_ms: number; subtask_index: number; auto: boolean;
  owner_device_id: string; start_op_id: string;
};
export type SettingsRow = Base & { timezone: string; config: Record<string, any> };
export type Conflict = Base & {
  op_id: string; entity: string; row_id: string | null; server_row: any; client_payload: any;
  resolution: string | null; resolved_at: string | null;
};
export type ImportBatch = Base & { source: string; summary: any; undone_at: string | null };

export type Data = {
  courses: Course[]; items: Item[]; chunks: Chunk[]; fixed_events: FixedEvent[]; oneoff_blocks: Oneoff[];
  blocks: Block[]; time_logs: TimeLog[]; progress_entries: ProgressEntry[]; milestones: Milestone[];
  active_timer: ActiveTimer[]; settings: SettingsRow[]; sync_conflicts: Conflict[]; import_batches: ImportBatch[];
};
export type Entity = keyof Data;

export const EMPTY: Data = {
  courses: [], items: [], chunks: [], fixed_events: [], oneoff_blocks: [], blocks: [], time_logs: [],
  progress_entries: [], milestones: [], active_timer: [], settings: [], sync_conflicts: [], import_batches: [],
};

export type OpState = 'pending' | 'sent' | 'applied' | 'failed' | 'rejected' | 'conflict';
export type Op = {
  op_id: string; entity: Entity; kind: 'insert' | 'update' | 'delete'; row_id: string;
  base_rev?: number; payload: Record<string, unknown>; created_at: string; state: OpState; error?: string;
};
