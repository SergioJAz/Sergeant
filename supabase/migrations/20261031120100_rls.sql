-- RLS on every table (AC01). Row access: user_id = auth.uid().
-- Cross-user references are blocked by the composite foreign keys in the schema migration.

do $$
declare t text;
begin
  foreach t in array array['import_batches','courses','items','chunks','fixed_events','oneoff_blocks',
                           'blocks','time_logs','progress_entries','milestones','active_timer','settings',
                           'import_batch_rows','sync_conflicts','applied_ops'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    -- TRUNCATE ignores RLS; none of these are needed by the app
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
  end loop;

  foreach t in array array['import_batches','courses','items','chunks','fixed_events','oneoff_blocks',
                           'blocks','time_logs','progress_entries','milestones','active_timer','settings',
                           'import_batch_rows','sync_conflicts'] loop
    execute format(
      'create policy owner_all on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- applied_ops is append-only: a stored result must never change, or replays stop being no-ops (AC03).
create policy owner_select on public.applied_ops for select to authenticated
  using (user_id = (select auth.uid()));
create policy owner_insert on public.applied_ops for insert to authenticated
  with check (user_id = (select auth.uid()));
revoke update, delete on public.applied_ops from authenticated;

revoke all on public.chunk_progress from anon;
revoke truncate, references, trigger on public.chunk_progress from authenticated;

-- shortcut: protected-entity base_rev checks and op replay (contract section 1) are not enforced here;
-- direct writes stay open until the sync RPC task lands, which then revokes them on protected tables.

-- Tables, views and functions added by later migrations are not readable by anon unless granted explicitly.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;
