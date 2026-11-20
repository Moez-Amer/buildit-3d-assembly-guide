begin;

create table public.processed_guides (
                                         id text primary key,
                                         owner_id text,
                                         product text not null,
                                         step_count integer not null check (step_count >= 0),
                                         created_at timestamptz not null default now(),
                                         is_public boolean not null default false,
                                         payload jsonb not null
                                             check (jsonb_typeof(payload) = 'object')
);

create index processed_guides_owner_created_idx
    on public.processed_guides (owner_id, created_at desc);

alter table public.processed_guides
    enable row level security;

revoke all on table public.processed_guides
    from public, anon, authenticated;

grant usage on schema public to service_role;

grant select, insert, update, delete
    on table public.processed_guides
    to service_role;

commit;