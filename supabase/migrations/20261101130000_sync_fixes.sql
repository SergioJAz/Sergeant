-- Review fixes for 20261101120000_sync_import.sql:
-- import rows get an insert sequence so undo runs children before parents (now() is equal within one transaction);
-- apply_ops locks the row it checks base_rev on, and a malformed op id is rejected without failing the batch.

alter table public.import_batch_rows add column seq bigint generated always as identity;

create or replace function public.apply_ops(ops jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  op jsonb;
  uid uuid := auth.uid();
  out jsonb := '[]';
  res jsonb;
  t text;
  k text;
  rid uuid;
  cur_rev bigint;
  server_row jsonb;
  is_protected boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  for op in select * from jsonb_array_elements(ops) loop
    if coalesce(op->>'op_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      -- unusable op id: report it without storing, so one bad op cannot block the queue
      out := out || jsonb_build_array(jsonb_build_object('op_id', op->>'op_id', 'status', 'rejected', 'error', 'bad op_id'));
      continue;
    end if;
    select a.result into res from public.applied_ops a where a.user_id = uid and a.op_id = (op->>'op_id')::uuid;
    if res is null then
      t := op->>'entity';
      k := op->>'kind';
      is_protected := t in ('time_logs', 'active_timer', 'progress_entries')
        or (t in ('blocks', 'chunks') and (k = 'delete' or (op->'payload') ? 'status'));
      begin
        rid := (op->>'row_id')::uuid;
        server_row := null;
        if t in ('courses','items','chunks','fixed_events','oneoff_blocks','blocks','time_logs',
                 'progress_entries','milestones','active_timer','settings','sync_conflicts') then
          execute format('select to_jsonb(x) from public.%I x where x.id = $1 for update', t) into server_row using rid;
        end if;
        cur_rev := (server_row->>'rev')::bigint;
        if t = 'active_timer' and k = 'insert' and exists (select 1 from public.active_timer where user_id = uid) then
          select to_jsonb(x) into server_row from public.active_timer x where x.user_id = uid;
          insert into public.sync_conflicts (op_id, entity, row_id, server_row, client_payload)
            values ((op->>'op_id')::uuid, t, rid, server_row, coalesce(op->'payload', '{}'));
          res := jsonb_build_object('status', 'conflict');
        elsif is_protected and k <> 'insert' and op ? 'base_rev' and cur_rev is distinct from (op->>'base_rev')::bigint then
          insert into public.sync_conflicts (op_id, entity, row_id, server_row, client_payload)
            values ((op->>'op_id')::uuid, t, rid, server_row, coalesce(op->'payload', '{}'));
          res := jsonb_build_object('status', 'conflict');
        else
          res := jsonb_build_object('status', 'applied', 'rev',
                   public.write_row(t, k, rid, coalesce(op->'payload', '{}')));
        end if;
      exception when others then
        res := jsonb_build_object('status', 'rejected', 'error', sqlerrm);
      end;
      insert into public.applied_ops (op_id, result) values ((op->>'op_id')::uuid, res);
    end if;
    out := out || jsonb_build_array(jsonb_build_object('op_id', op->>'op_id') || res);
  end loop;
  return out;
end $$;

create or replace function public.apply_import(p_batch_id uuid, p_source public.batch_source, p_summary jsonb, p_ops jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  op jsonb;
  t text;
  rid uuid;
  before jsonb;
  new_rev bigint;
  n int := 0;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.import_batches where user_id = auth.uid() and id = p_batch_id) then
    return jsonb_build_object('status', 'already_applied');
  end if;
  insert into public.import_batches (id, source, summary) values (p_batch_id, p_source, coalesce(p_summary, '{}'));
  for op in select * from jsonb_array_elements(p_ops) loop
    t := op->>'entity';
    if t not in ('courses', 'items', 'chunks', 'blocks', 'fixed_events', 'oneoff_blocks', 'time_logs',
                 'progress_entries', 'milestones', 'settings') then
      raise exception 'entity % not allowed in import', t;
    end if;
    rid := (op->>'row_id')::uuid;
    execute format('select to_jsonb(x) from public.%I x where x.id = $1', t) into before using rid;
    new_rev := public.write_row(t, op->>'kind', rid,
      case when t = 'blocks' and op->>'kind' <> 'delete'
           then coalesce(op->'payload', '{}') || jsonb_build_object('import_batch_id', p_batch_id)
           else coalesce(op->'payload', '{}') end);
    insert into public.import_batch_rows (batch_id, entity, row_id, before, after_rev)
      values (p_batch_id, t, rid, before, case when op->>'kind' = 'delete' then -1 else new_rev end)
      on conflict (batch_id, entity, row_id) do update set after_rev = excluded.after_rev;
    n := n + 1;
  end loop;
  return jsonb_build_object('status', 'applied', 'rows', n);
end $$;

create or replace function public.undo_import(p_batch_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  r record;
  cur jsonb;
  conflicts jsonb := '[]';
  n int := 0;
begin
  if not exists (select 1 from public.import_batches where user_id = auth.uid() and id = p_batch_id and undone_at is null) then
    return jsonb_build_object('status', 'not_found');
  end if;
  for r in select * from public.import_batch_rows where batch_id = p_batch_id and user_id = auth.uid() order by seq desc loop
    execute format('select to_jsonb(x) from public.%I x where x.id = $1', r.entity) into cur using r.row_id;
    if r.after_rev = -1 then
      -- row was deleted by the import: put it back unless something with that id exists again
      if cur is null then
        perform public.write_row(r.entity, 'insert', r.row_id, r.before - 'id');
        n := n + 1;
      else
        conflicts := conflicts || jsonb_build_object('entity', r.entity, 'row_id', r.row_id, 'reason', 'recreated');
      end if;
    elsif cur is null or (cur->>'rev')::bigint <> r.after_rev then
      conflicts := conflicts || jsonb_build_object('entity', r.entity, 'row_id', r.row_id, 'reason', 'edited_after_import');
    elsif r.before is null then
      if r.entity = 'blocks' then update public.blocks set import_batch_id = null where id = r.row_id; end if;
      perform public.write_row(r.entity, 'delete', r.row_id, '{}');
      n := n + 1;
    else
      perform public.write_row(r.entity, 'update', r.row_id, r.before - 'id');
      n := n + 1;
    end if;
  end loop;
  update public.import_batches set undone_at = now() where user_id = auth.uid() and id = p_batch_id;
  return jsonb_build_object('status', 'undone', 'rows', n, 'conflicts', conflicts);
end $$;
