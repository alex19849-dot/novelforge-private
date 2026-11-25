create table if not exists public.background_queue_runs (
 id text primary key check (id ~ '^queue:[a-f0-9-]{36}$'),
 user_id uuid not null references auth.users(id),
 kind text not null check (kind in ('chapter','social','publisher','analytics','review','probe')),
 args jsonb not null default '[]', checkpoint jsonb not null default '{}',
 status text not null default 'queued' check (status in ('queued','running','completed','failed')),
 sequence integer not null default 0, next_at timestamptz not null default now(),
 locked_at timestamptz, claim uuid, error_message text not null default '',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.background_queue_runs enable row level security;
revoke all on public.background_queue_runs from anon, authenticated;
grant all on public.background_queue_runs to service_role;
create index if not exists background_queue_due on public.background_queue_runs(next_at) where status='queued';
