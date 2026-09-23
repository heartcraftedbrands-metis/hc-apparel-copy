create table if not exists public.quarterly_tax_filings (
  period_key text primary key check (period_key ~ '^\d{4}-Q[1-4]$'),
  year integer not null check (year between 2000 and 2200),
  quarter integer not null check (quarter between 1 and 4),
  status text not null default 'open' check (status in ('open', 'reviewed', 'ready_for_filing', 'filed')),
  filed_date date,
  confirmation_reference text,
  admin_notes text,
  data_check_status text check (data_check_status in ('passed', 'warnings', 'needs_review')),
  data_check_result jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (year, quarter)
);

alter table public.quarterly_tax_filings enable row level security;
drop policy if exists quarterly_tax_filings_admin_all on public.quarterly_tax_filings;
create policy quarterly_tax_filings_admin_all on public.quarterly_tax_filings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.quarterly_tax_filings from anon, authenticated;
grant select, insert, update on public.quarterly_tax_filings to authenticated;

create or replace function public.set_quarterly_tax_filings_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists quarterly_tax_filings_updated_at on public.quarterly_tax_filings;
create trigger quarterly_tax_filings_updated_at before update on public.quarterly_tax_filings
for each row execute function public.set_quarterly_tax_filings_updated_at();

comment on table public.quarterly_tax_filings is 'Admin-only quarterly bookkeeping workflow. It does not file tax returns or alter historical orders.';
