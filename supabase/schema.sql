-- Resale Finder – database schema.
-- Run this in the Supabase SQL editor first, then run supabase/seed.sql.

-- The practice listings the search runs against.
create table if not exists public.listings (
  id           text primary key,
  title        text not null,
  brand        text not null,
  price        numeric(10, 2) not null check (price >= 0),
  size         text,
  image_url    text not null,
  marketplace  text not null,
  listing_url  text not null,
  description  text,
  created_at   timestamptz not null default now()
);

-- Listings a visitor has saved. There are no accounts, so each browser gets an
-- anonymous visitor id (a server-set cookie) and saves are keyed by it.
create table if not exists public.saved_listings (
  visitor_id   uuid not null,
  listing_id   text not null references public.listings (id) on delete cascade,
  saved_at     timestamptz not null default now(),
  note         text,                      -- the visitor's own note, e.g. "ask seller about the pilling"
  primary key (visitor_id, listing_id)
);
-- If you ran an earlier version of this file, this adds the column without dropping anything.
alter table public.saved_listings add column if not exists note text;

-- Listings a visitor has opened. The API only ever returns the 10 most recent.
create table if not exists public.recently_viewed (
  visitor_id   uuid not null,
  listing_id   text not null references public.listings (id) on delete cascade,
  viewed_at    timestamptz not null default now(),
  primary key (visitor_id, listing_id)
);

create index if not exists listings_brand_idx        on public.listings (lower(brand));
create index if not exists listings_price_idx        on public.listings (price);
create index if not exists saved_listings_visitor_idx on public.saved_listings (visitor_id, saved_at desc);
create index if not exists recently_viewed_visitor_idx on public.recently_viewed (visitor_id, viewed_at desc);

-- Lock the tables down. Row Level Security is on with no policies, so the public
-- anon key can read/write nothing; only the service-role key used by the Next.js
-- Route Handlers (server-side only) can touch these tables.
alter table public.listings        enable row level security;
alter table public.saved_listings  enable row level security;
alter table public.recently_viewed enable row level security;
