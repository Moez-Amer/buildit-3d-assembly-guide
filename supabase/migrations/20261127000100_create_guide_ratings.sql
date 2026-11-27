-- Ratings of finished guides: a copy of the ratings table in server/data/buildit.db (server/rating-store.js writes it),
-- so the team sees every rating in one place. One row per person and guide; saving again changes it.
-- user_id is the server's random account id, never an email address.
begin;

create table public.guide_ratings (
    guide_id text not null,
    user_id text not null,
    stars smallint not null check (stars between 1 and 5),
    comment text not null default '' check (char_length(comment) <= 500),
    product text,
    company text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (guide_id, user_id)
);

create index guide_ratings_user_idx on public.guide_ratings (user_id);

-- only the server (service role) reads and writes it; the public API keys see nothing
alter table public.guide_ratings enable row level security;
revoke all on table public.guide_ratings from public, anon, authenticated;
grant select, insert, update, delete on table public.guide_ratings to service_role;

-- all ratings combined, one row per guide (Table Editor → guide_rating_summary)
create view public.guide_rating_summary
    with (security_invoker = true)
as
select
    guide_id,
    max(product) as product,
    max(company) as company,
    count(*) as ratings,
    round(avg(stars), 2) as average,
    count(*) filter (where stars = 5) as five,
    count(*) filter (where stars = 4) as four,
    count(*) filter (where stars = 3) as three,
    count(*) filter (where stars = 2) as two,
    count(*) filter (where stars = 1) as one,
    count(*) filter (where comment <> '') as comments,
    max(updated_at) as last_rated
from public.guide_ratings
group by guide_id;

revoke all on table public.guide_rating_summary from public, anon, authenticated;
grant select on table public.guide_rating_summary to service_role;

commit;
