-- Notdown personal-device sync, protocol 1. Run once in a Supabase project's SQL editor.
-- Safe to rerun. Client apps use the publishable key and the signed-in user's token only.
begin;

create schema if not exists notdown_sync;
revoke all on schema notdown_sync from public, anon, authenticated;

create table if not exists notdown_sync.vaults (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  sequence bigint not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists notdown_sync.items (
  vault_id uuid not null references notdown_sync.vaults(id) on delete cascade,
  key text not null,
  version bigint not null,
  item jsonb not null,
  primary key (vault_id, key)
);
create table if not exists notdown_sync.changes (
  vault_id uuid not null references notdown_sync.vaults(id) on delete cascade,
  version bigint not null,
  item jsonb not null,
  primary key (vault_id, version)
);
create table if not exists notdown_sync.operations (
  vault_id uuid not null references notdown_sync.vaults(id) on delete cascade,
  id uuid not null,
  mutations jsonb not null,
  result jsonb not null,
  primary key (vault_id, id)
);
alter table notdown_sync.vaults enable row level security;
alter table notdown_sync.items enable row level security;
alter table notdown_sync.changes enable row level security;
alter table notdown_sync.operations enable row level security;
revoke all on all tables in schema notdown_sync from public, anon, authenticated;

create or replace function public.nd_sync_owns_vault(p_vault uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from notdown_sync.vaults where id = p_vault and owner_id = auth.uid());
$$;
create or replace function public.nd_sync_vaults()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by created_at), '[]'::jsonb)
    from notdown_sync.vaults where owner_id = auth.uid());
end;
$$;
create or replace function public.nd_sync_create_vault(p_id uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_id is null or p_name is null or length(btrim(p_name)) not between 1 and 200 then raise exception 'Invalid notebook'; end if;
  insert into notdown_sync.vaults(id, owner_id, name) values(p_id, auth.uid(), btrim(p_name)) on conflict (id) do nothing;
  if not public.nd_sync_owns_vault(p_id) then raise exception 'Notebook is unavailable' using errcode = '42501'; end if;
  return (select jsonb_build_object('id', id, 'name', name) from notdown_sync.vaults where id = p_id);
end;
$$;

create or replace function public.nd_sync_pull(p_vault uuid, p_cursor bigint, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare head bigint; ending bigint; result jsonb;
begin
  select sequence into head from notdown_sync.vaults where id = p_vault and owner_id = auth.uid();
  if head is null then raise exception 'Notebook is unavailable' using errcode = '42501'; end if;
  if p_cursor is null or p_cursor < 0 or p_cursor > head or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid sync cursor or limit'; end if;
  select coalesce(max(version), p_cursor), coalesce(jsonb_agg(jsonb_build_object('item', item, 'version', version) order by version), '[]'::jsonb)
    into ending, result from (select item, version from notdown_sync.changes where vault_id = p_vault and version > p_cursor order by version limit p_limit) changes;
  return jsonb_build_object('cursor', ending, 'items', result, 'more', ending < head);
end;
$$;

create or replace function public.nd_sync_push(p_vault uuid, p_operation uuid, p_mutations jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  head bigint; old notdown_sync.operations%rowtype; current_item notdown_sync.items%rowtype;
  mutation jsonb; payload jsonb; expected bigint; item_key text; item_kind text;
  conflicts jsonb := '[]'::jsonb; accepted jsonb := '[]'::jsonb; result jsonb;
begin
  -- The per-vault row lock orders commits and their cursor. A bare sequence alone could skip an uncommitted event.
  select sequence into head from notdown_sync.vaults where id = p_vault and owner_id = auth.uid() for update;
  if head is null then raise exception 'Notebook is unavailable' using errcode = '42501'; end if;
  if p_operation is null or jsonb_typeof(p_mutations) is distinct from 'array' or jsonb_array_length(p_mutations) not between 1 and 100
      or octet_length(p_mutations::text) > 16777216 then raise exception 'Invalid or oversized sync batch'; end if;
  select * into old from notdown_sync.operations where vault_id = p_vault and id = p_operation;
  if found then
    if old.mutations is distinct from p_mutations then raise exception 'Operation ID reused with different contents'; end if;
    return old.result;
  end if;
  if (select count(distinct value->'item'->>'key') from jsonb_array_elements(p_mutations)) <> jsonb_array_length(p_mutations) then raise exception 'Duplicate item in batch'; end if;

  for mutation in select value from jsonb_array_elements(p_mutations) loop
    payload := mutation->'item'; item_key := payload->>'key'; item_kind := payload->>'kind';
    if jsonb_typeof(payload) is distinct from 'object' or item_key is null or length(item_key) not between 1 and 1100
      or item_kind is null or item_kind not in ('page', 'metadata', 'person', 'asset')
      or left(item_key, length(item_kind) + 1) <> item_kind || ':'
      or not (payload ? 'value') or jsonb_typeof(payload->'value') not in ('object', 'null')
      or coalesce(mutation->>'expectedVersion', '') !~ '^[0-9]{1,15}$' then raise exception 'Invalid sync item'; end if;
    expected := (mutation->>'expectedVersion')::bigint;
    select * into current_item from notdown_sync.items where vault_id = p_vault and key = item_key;
    if not found and expected <> 0 then raise exception 'The expected remote item is missing; sync stopped'; end if;
    if coalesce(current_item.version, 0) <> expected then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('item', current_item.item, 'version', current_item.version));
    end if;
    if item_kind = 'asset' and jsonb_typeof(payload->'value') = 'object' then
      if coalesce(payload->'value'->>'hash', '') !~ '^[a-f0-9]{64}$' or not exists (
        select 1 from storage.objects where bucket_id = 'notdown-sync'
          and name = auth.uid()::text || '/' || p_vault::text || '/manifests/' || (payload->'value'->>'hash')
      ) then raise exception 'Upload the complete attachment before publishing its reference'; end if;
    end if;
  end loop;

  if jsonb_array_length(conflicts) > 0 then
    result := jsonb_build_object('accepted', false, 'items', conflicts);
  else
    for mutation in select value from jsonb_array_elements(p_mutations) loop
      payload := mutation->'item'; head := head + 1;
      insert into notdown_sync.items(vault_id, key, version, item) values(p_vault, payload->>'key', head, payload)
        on conflict (vault_id, key) do update set version = excluded.version, item = excluded.item;
      insert into notdown_sync.changes(vault_id, version, item) values(p_vault, head, payload);
      accepted := accepted || jsonb_build_array(jsonb_build_object('item', payload, 'version', head));
    end loop;
    update notdown_sync.vaults set sequence = head where id = p_vault;
    result := jsonb_build_object('accepted', true, 'items', accepted);
  end if;
  insert into notdown_sync.operations(vault_id, id, mutations, result) values(p_vault, p_operation, p_mutations, result);
  return result;
end;
$$;

revoke all on function public.nd_sync_owns_vault(uuid) from public, anon;
revoke all on function public.nd_sync_vaults() from public, anon;
revoke all on function public.nd_sync_create_vault(uuid, text) from public, anon;
revoke all on function public.nd_sync_pull(uuid, bigint, integer) from public, anon;
revoke all on function public.nd_sync_push(uuid, uuid, jsonb) from public, anon;
grant execute on function public.nd_sync_owns_vault(uuid) to authenticated;
grant execute on function public.nd_sync_vaults() to authenticated;
grant execute on function public.nd_sync_create_vault(uuid, text) to authenticated;
grant execute on function public.nd_sync_pull(uuid, bigint, integer) to authenticated;
grant execute on function public.nd_sync_push(uuid, uuid, jsonb) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit)
  values ('notdown-sync', 'notdown-sync', false, 1048576) on conflict (id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets where id = 'notdown-sync' and public) then
    raise exception 'The existing notdown-sync bucket is public. Configure a private bucket before enabling sync.';
  end if;
end $$;
drop policy if exists notdown_sync_read on storage.objects;
drop policy if exists notdown_sync_insert on storage.objects;
create policy notdown_sync_read on storage.objects for select to authenticated using (
  bucket_id = 'notdown-sync' and split_part(name, '/', 1) = auth.uid()::text
  and case when split_part(name, '/', 2) ~ '^[a-f0-9-]{36}$' then public.nd_sync_owns_vault(split_part(name, '/', 2)::uuid) else false end
);
create policy notdown_sync_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'notdown-sync' and split_part(name, '/', 1) = auth.uid()::text
  and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/(chunks|manifests)/[a-f0-9]{64}$'
  and case when split_part(name, '/', 2) ~ '^[a-f0-9-]{36}$' then public.nd_sync_owns_vault(split_part(name, '/', 2)::uuid) else false end
);
-- No client UPDATE/DELETE policy: published objects, change events and tombstones remain recoverable.
commit;
