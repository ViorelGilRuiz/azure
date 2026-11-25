begin;
create table public.azure_progress (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision integer not null check (revision > 0),
 progress jsonb not null check (jsonb_typeof(progress) = 'object'),
 updated_at timestamptz not null default now()
);
alter table public.azure_progress enable row level security;
alter table public.azure_progress force row level security;
revoke all on public.azure_progress from public, anon, authenticated;
grant select on public.azure_progress to authenticated;
create policy own_progress_read on public.azure_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy own_progress_insert on public.azure_progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy own_progress_update on public.azure_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create function public.azure_save_progress(expected_revision integer, new_progress jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
 if owner_id is null or expected_revision < 0 or expected_revision is null or new_progress is null
    or pg_catalog.jsonb_typeof(new_progress) <> 'object' or pg_catalog.pg_column_size(new_progress) > 10485760 then
  return false;
 end if;
 if expected_revision = 0 then
  insert into public.azure_progress(user_id,revision,progress) values(owner_id,1,new_progress)
  on conflict(user_id) do nothing;
 else
  update public.azure_progress p set revision=p.revision+1, progress=new_progress, updated_at=pg_catalog.now()
  where p.user_id=owner_id and p.revision=expected_revision;
 end if;
 return found;
end;
$$;
revoke execute on function public.azure_save_progress(integer,jsonb) from public, anon;
grant execute on function public.azure_save_progress(integer,jsonb) to authenticated;
commit;
