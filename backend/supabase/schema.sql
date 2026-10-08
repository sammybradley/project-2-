-- Resale Finder – Supabase schema.
-- Paste this into the Supabase dashboard (SQL Editor → New query → Run), then
-- load the practice listings with `npm run seed:supabase` in backend/.

-- The listings. image_url and listing_url are derived by the backend, so they
-- aren't stored.
create table if not exists public.listings (
  id          text primary key,
  title       text not null,
  brand       text not null,
  price       numeric not null check (price >= 0),
  size        text,
  marketplace text not null,
  description text
);

-- One row per (visitor, listing) the visitor has saved. There are no accounts:
-- visitor_id is the anonymous rf_visitor cookie the backend issues.
create table if not exists public.saved (
  visitor_id text not null,
  listing_id text not null references public.listings (id) on delete cascade,
  saved_at   timestamptz not null default now(),
  note       text check (note is null or char_length(note) <= 300),
  primary key (visitor_id, listing_id)
);
create index if not exists saved_by_visitor on public.saved (visitor_id, saved_at desc);

-- Recently opened listings. Re-opening one bumps viewed_at; the backend keeps
-- only the 10 newest per visitor.
create table if not exists public.recent (
  visitor_id text not null,
  listing_id text not null references public.listings (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (visitor_id, listing_id)
);
create index if not exists recent_by_visitor on public.recent (visitor_id, viewed_at desc);

-- Only the backend (using the service-role key, which bypasses RLS) may touch
-- these tables. With RLS on and no policies, the public anon key can do nothing.
alter table public.listings enable row level security;
alter table public.saved    enable row level security;
alter table public.recent   enable row level security;
