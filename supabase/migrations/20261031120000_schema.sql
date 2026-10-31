-- Sergeant v1 schema. Rules come from Study_Helper_Contracts.md (sections in brackets).
-- Same-user relationships are enforced by composite foreign keys on (user_id, <parent>_id).
-- Every row: id, user_id, created_at, updated_at, rev (server-incremented on each update) [1].

-- ---------- shared triggers ----------

create function public.bump_rev() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot change';
  end if;
  new.rev := old.rev + 1;
  new.updated_at := now();
  return new;
end $$;

-- ---------- enums ----------

create type public.lifecycle_status as enum ('active', 'archived');
create type public.item_status as enum ('active', 'done', 'archived');
create type public.item_type as enum ('exam', 'project', 'homework', 'lab', 'quiz', 'catchup');
create type public.chunk_kind as enum ('notes', 'problems', 'review', 'mock', 'cheat_sheet', 'lab_work', 'writing', 'other');
create type public.chunk_status as enum ('todo', 'partial', 'done', 'skipped');
create type public.fixed_kind as enum ('class', 'sport', 'commute', 'sleep', 'other');
create type public.oneoff_kind as enum ('blocked', 'off', 'trip', 'exam');
create type public.block_type as enum ('Notes', 'Problems', 'Review', 'Mock', 'CheatSheet', 'Buffer', 'Rest', 'Break', 'Fixed');
create type public.block_source as enum ('auto', 'claude', 'manual', 'import');
create type public.block_status as enum ('planned', 'done', 'partial', 'skipped', 'moved');
create type public.timer_phase as enum ('study', 'break');
create type public.timer_state as enum ('running', 'paused');
create type public.batch_source as enum ('claude_csv', 'migration', 'zip');
create type public.conflict_resolution as enum ('keep_mine', 'keep_server', 'keep_as_log', 'discard');

-- ---------- tables ----------

create table public.import_batches (
  id uuid not null,                                 -- client-made batch_id; retry with same id is a no-op [7]
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source public.batch_source not null,
  summary jsonb not null default '{}',
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1,
  primary key (user_id, id)                         -- per user, so a client id never reveals another user's row
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  code text not null,
  name text not null,
  short text not null,
  color text,
  professor text,
  semester text,
  notes text,
  status public.lifecycle_status not null default 'active',
  archived_at timestamptz,
  legacy_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1,
  unique (user_id, id),
  check ((status = 'archived') = (archived_at is not null))   -- [5]
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_id uuid not null,
  type public.item_type not null,
  title text not null,
  due_at timestamptz,
  due_confirmed boolean not null default false,
  duration_min int check (duration_min > 0),        -- exams: default 120 set by app [6]
  travel_before_min int not null default 30 check (travel_before_min >= 0),
  travel_after_min int not null default 30 check (travel_after_min >= 0),
  scope text,
  rules text,
  needs_laptop boolean not null default false,
  weight_pct numeric check (weight_pct between 0 and 100),
  priority_boost int not null default 0,
  status public.item_status not null default 'active',
  archived_at timestamptz,
  legacy_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1,
  unique (user_id, id),
  foreign key (user_id, course_id) references public.courses (user_id, id),
  check ((status = 'archived') = (archived_at is not null))
);

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_id uuid not null,
  position int not null,
  title text not null,
  kind public.chunk_kind not null default 'other',
  source_ref text,
  est_blocks numeric not null default 0 check (est_blocks >= 0),
  est_unit_min int not null default 50 check (est_unit_min > 0),  -- frozen per chunk [3]
  est_min numeric generated always as (est_blocks * est_unit_min) stored,
  milestone_due date,
  status public.chunk_status not null default 'todo',
  archived_at timestamptz,
  legacy_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1,
  unique (user_id, id),
  foreign key (user_id, item_id) references public.items (user_id, id)
);
-- not deferrable so imports can upsert on it; archived chunks free their position
create unique index chunks_position on public.chunks (user_id, item_id, position) where archived_at is null;

create table public.fixed_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  label text not null,
  kind public.fixed_kind not null,
  weekdays smallint[] not null check (weekdays <@ '{0,1,2,3,4,5,6}' and cardinality(weekdays) > 0), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  valid_from date,
  valid_to date,
  never_cut boolean not null default false,
  course_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1,
  foreign key (user_id, course_id) references public.courses (user_id, id),
  -- overnight (end <= start) only for sleep / other [4]
  check (end_time > start_time or kind in ('sleep', 'other')),
  check (end_time <> start_time),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create table public.oneoff_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  label text not null,
  date date not null,
  all_day boolean not null default false,
  start_time time,
  end_time time,
  kind public.oneoff_kind not null,
  item_id uuid,                                     -- linked exam [6]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1,
  foreign key (user_id, item_id) references public.items (user_id, id),
  check (all_day or (start_time is not null and end_time is not null and end_time > start_time)),
  check ((kind = 'exam') = (item_id is not null))
);
create unique index oneoff_one_per_exam on public.oneoff_blocks (item_id) where item_id is not null;

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  course_id uuid,
  item_id uuid,
  chunk_ids uuid[] not null default '{}',           -- same-user check by trigger below
  what text,
  type public.block_type not null,
  source public.block_source not null default 'manual',
  locked boolean not null default false,
  status public.block_status not null default 'planned',
  moved_to_id uuid,
  subtasks jsonb not null default '[]' check (jsonb_typeof(subtasks) = 'array'),
  legacy_key text,
  import_batch_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1,
  unique (user_id, id),
  foreign key (user_id, course_id) references public.courses (user_id, id),
  foreign key (user_id, item_id) references public.items (user_id, id),
  foreign key (user_id, moved_to_id) references public.blocks (user_id, id),
  foreign key (user_id, import_batch_id) references public.import_batches (user_id, id),
  check (end_time > start_time),                    -- blocks never cross midnight [4]
  check ((status = 'moved') = (moved_to_id is not null))
);

create table public.time_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  block_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  plan_min int not null default 0 check (plan_min >= 0),
  actual_min int not null check (actual_min >= 0),
  pages text,
  completed boolean not null default false,
  focus smallint check (focus between 1 and 5),
  note text,
  subtasks jsonb not null default '[]' check (jsonb_typeof(subtasks) = 'array'),
  legacy_key text,
  deleted_at timestamptz,                           -- soft delete [5]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1,
  unique (user_id, id),
  foreign key (user_id, block_id) references public.blocks (user_id, id),
  check (ended_at >= started_at)
);

create table public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  chunk_id uuid not null,
  time_log_id uuid,                                 -- null = manual or migrated progress
  done_min numeric not null check (done_min >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1,
  foreign key (user_id, chunk_id) references public.chunks (user_id, id),
  foreign key (user_id, time_log_id) references public.time_logs (user_id, id) on delete cascade
);
create unique index progress_one_per_log_chunk on public.progress_entries (time_log_id, chunk_id) where time_log_id is not null;

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  title text not null,
  parts text[] not null default '{}',
  done boolean not null default false,
  legacy_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1
);

create table public.active_timer (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade unique,  -- one per user [2]
  block_id uuid not null,
  phase public.timer_phase not null,
  state public.timer_state not null,
  segment_started_at timestamptz,
  elapsed_ms bigint not null default 0 check (elapsed_ms >= 0),
  phase_target_ms bigint not null check (phase_target_ms > 0),
  subtask_index int not null default 0 check (subtask_index >= 0),
  auto boolean not null default false,
  owner_device_id text not null,
  start_op_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1,
  foreign key (user_id, block_id) references public.blocks (user_id, id),
  check ((state = 'running') = (segment_started_at is not null))
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade unique,  -- one per user
  timezone text not null default 'Asia/Beirut',
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1
);

-- Import undo: before-image (null = row was inserted) and resulting rev per row [7]
create table public.import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  batch_id uuid not null,
  entity text not null,
  row_id uuid not null,
  before jsonb,
  after_rev bigint not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, batch_id) references public.import_batches (user_id, id) on delete cascade,
  unique (batch_id, entity, row_id)
);

-- Sync [1]: replaying a known op_id returns the stored result
create table public.applied_ops (
  op_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  applied_at timestamptz not null default now(),
  result jsonb not null default '{}',
  primary key (user_id, op_id)
);

create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  op_id uuid not null,
  entity text not null,
  row_id uuid,
  server_row jsonb,
  client_payload jsonb not null,
  resolution public.conflict_resolution,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1,
  unique (user_id, op_id),
  check ((resolution is null) = (resolved_at is null))
);

-- ---------- owner-scoped legacy keys (D07) ----------

create unique index courses_legacy on public.courses (user_id, legacy_key) where legacy_key is not null;
create unique index items_legacy on public.items (user_id, legacy_key) where legacy_key is not null;
create unique index chunks_legacy on public.chunks (user_id, legacy_key) where legacy_key is not null;
create unique index blocks_legacy on public.blocks (user_id, legacy_key) where legacy_key is not null;
create unique index time_logs_legacy on public.time_logs (user_id, legacy_key) where legacy_key is not null;
create unique index milestones_legacy on public.milestones (user_id, legacy_key) where legacy_key is not null;

-- ---------- lookup indexes (also cover the composite foreign keys) ----------

create index items_course on public.items (user_id, course_id);
create index chunks_item on public.chunks (user_id, item_id, position);
create index fixed_events_course on public.fixed_events (user_id, course_id);
create index oneoff_date on public.oneoff_blocks (user_id, date);
create index oneoff_item on public.oneoff_blocks (user_id, item_id);
create index blocks_date on public.blocks (user_id, date);
create index blocks_course on public.blocks (user_id, course_id);
create index blocks_item on public.blocks (user_id, item_id);
create index blocks_moved_to on public.blocks (user_id, moved_to_id);
create index blocks_batch on public.blocks (user_id, import_batch_id);
create index time_logs_started on public.time_logs (user_id, started_at);
create index time_logs_block on public.time_logs (user_id, block_id);
create index progress_chunk on public.progress_entries (user_id, chunk_id);
create index progress_log on public.progress_entries (user_id, time_log_id);
create index active_timer_block on public.active_timer (user_id, block_id);
create index import_rows_batch on public.import_batch_rows (user_id, batch_id);
create index milestones_date on public.milestones (user_id, date);
create index sync_conflicts_open on public.sync_conflicts (user_id) where resolved_at is null;

-- ---------- rev / updated_at triggers ----------

do $$
declare t text;
begin
  foreach t in array array['import_batches','courses','items','chunks','fixed_events','oneoff_blocks',
                           'blocks','time_logs','progress_entries','milestones','active_timer','settings',
                           'sync_conflicts'] loop
    execute format('create trigger bump_rev before update on public.%I for each row execute function public.bump_rev()', t);
  end loop;
end $$;

-- ---------- blocks.chunk_ids: every chunk must belong to the block's owner ----------

create function public.check_block_chunks() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from unnest(new.chunk_ids) as c(id)
    where not exists (select 1 from public.chunks k where k.id = c.id and k.user_id = new.user_id)
  ) then
    raise exception 'chunk_ids contains a chunk not owned by this user';
  end if;
  return new;
end $$;

create trigger check_block_chunks before insert or update of chunk_ids, user_id on public.blocks
  for each row execute function public.check_block_chunks();

-- ---------- soft-deleting a time log removes its progress entries [3][5] ----------

create function public.drop_progress_on_log_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.progress_entries where time_log_id = new.id and user_id = new.user_id;
  end if;
  return new;
end $$;

create trigger drop_progress_on_log_delete after update of deleted_at on public.time_logs
  for each row execute function public.drop_progress_on_log_delete();

-- ---------- derived progress (remaining = max(0, est - done)) [3] ----------

create view public.chunk_progress with (security_invoker = true) as
select k.id as chunk_id,
       k.user_id,
       k.est_min,
       coalesce(sum(p.done_min), 0) as done_min,
       greatest(0, k.est_min - coalesce(sum(p.done_min), 0)) as remaining_min
from public.chunks k
left join public.progress_entries p on p.chunk_id = k.id
group by k.id;
