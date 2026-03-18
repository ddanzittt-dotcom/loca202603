create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  nickname text,
  avatar_url text,
  bio text,
  slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null default 'New map',
  description text default '',
  theme text default '#635BFF',
  visibility text not null default 'private' check (visibility in ('public', 'unlisted', 'private')),
  slug text unique,
  tags text[] default '{}',
  category text not null default 'personal' check (category in ('personal', 'stamp', 'media', 'infra')),
  config jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.map_publications (
  id uuid primary key default gen_random_uuid(),
  map_id uuid references public.maps(id) on delete cascade not null unique,
  caption text default '',
  likes_count integer not null default 0,
  saves_count integer not null default 0,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.map_features (
  id uuid primary key default gen_random_uuid(),
  map_id uuid references public.maps(id) on delete cascade not null,
  type text not null check (type in ('pin', 'route', 'area')),
  title text not null default 'New feature',
  emoji text,
  note text default '',
  tags text[] default '{}',
  lat double precision,
  lng double precision,
  points jsonb,
  highlight boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_memos (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid references public.map_features(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  user_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references public.profiles(id) on delete cascade not null,
  following_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id)
);

create table if not exists public.view_logs (
  id uuid primary key default gen_random_uuid(),
  map_id uuid references public.maps(id) on delete cascade not null,
  viewer_id uuid references public.profiles(id) on delete set null,
  source text not null default 'link',
  created_at timestamptz not null default now()
);

create index if not exists idx_maps_user_id on public.maps(user_id);
create index if not exists idx_maps_visibility on public.maps(visibility);
create index if not exists idx_maps_slug on public.maps(slug);
create index if not exists idx_map_features_map_id on public.map_features(map_id);
create index if not exists idx_map_features_type on public.map_features(type);
create index if not exists idx_feature_memos_feature_id on public.feature_memos(feature_id);
create index if not exists idx_publications_map_id on public.map_publications(map_id);
create index if not exists idx_profiles_slug on public.profiles(slug);
create index if not exists idx_follows_follower_id on public.follows(follower_id);
create index if not exists idx_follows_following_id on public.follows(following_id);
create index if not exists idx_view_logs_map_id on public.view_logs(map_id);
create index if not exists idx_view_logs_created_at on public.view_logs(created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_maps_updated_at on public.maps;
create trigger set_maps_updated_at
before update on public.maps
for each row execute function public.set_updated_at();

drop trigger if exists set_map_publications_updated_at on public.map_publications;
create trigger set_map_publications_updated_at
before update on public.map_publications
for each row execute function public.set_updated_at();

drop trigger if exists set_map_features_updated_at on public.map_features;
create trigger set_map_features_updated_at
before update on public.map_features
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.maps enable row level security;
alter table public.map_publications enable row level security;
alter table public.map_features enable row level security;
alter table public.feature_memos enable row level security;
alter table public.follows enable row level security;
alter table public.view_logs enable row level security;

drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
  on public.profiles
  for select
  using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles
  for update
  using (auth.uid() = id);

drop policy if exists "maps_select_visible_or_owner" on public.maps;
create policy "maps_select_visible_or_owner"
  on public.maps
  for select
  using (visibility in ('public', 'unlisted') or user_id = auth.uid());

drop policy if exists "maps_insert_owner" on public.maps;
create policy "maps_insert_owner"
  on public.maps
  for insert
  with check (user_id = auth.uid());

drop policy if exists "maps_update_owner" on public.maps;
create policy "maps_update_owner"
  on public.maps
  for update
  using (user_id = auth.uid());

drop policy if exists "maps_delete_owner" on public.maps;
create policy "maps_delete_owner"
  on public.maps
  for delete
  using (user_id = auth.uid());

drop policy if exists "publications_select_visible_or_owner" on public.map_publications;
create policy "publications_select_visible_or_owner"
  on public.map_publications
  for select
  using (
    exists (
      select 1
      from public.maps
      where maps.id = map_publications.map_id
        and (maps.visibility in ('public', 'unlisted') or maps.user_id = auth.uid())
    )
  );

drop policy if exists "publications_insert_owner" on public.map_publications;
create policy "publications_insert_owner"
  on public.map_publications
  for insert
  with check (
    exists (
      select 1
      from public.maps
      where maps.id = map_publications.map_id
        and maps.user_id = auth.uid()
    )
  );

drop policy if exists "publications_update_owner" on public.map_publications;
create policy "publications_update_owner"
  on public.map_publications
  for update
  using (
    exists (
      select 1
      from public.maps
      where maps.id = map_publications.map_id
        and maps.user_id = auth.uid()
    )
  );

drop policy if exists "publications_delete_owner" on public.map_publications;
create policy "publications_delete_owner"
  on public.map_publications
  for delete
  using (
    exists (
      select 1
      from public.maps
      where maps.id = map_publications.map_id
        and maps.user_id = auth.uid()
    )
  );

drop policy if exists "features_select_visible_or_owner" on public.map_features;
create policy "features_select_visible_or_owner"
  on public.map_features
  for select
  using (
    exists (
      select 1
      from public.maps
      where maps.id = map_features.map_id
        and (maps.visibility in ('public', 'unlisted') or maps.user_id = auth.uid())
    )
  );

drop policy if exists "features_insert_owner" on public.map_features;
create policy "features_insert_owner"
  on public.map_features
  for insert
  with check (
    exists (
      select 1
      from public.maps
      where maps.id = map_features.map_id
        and maps.user_id = auth.uid()
    )
  );

drop policy if exists "features_update_owner" on public.map_features;
create policy "features_update_owner"
  on public.map_features
  for update
  using (
    exists (
      select 1
      from public.maps
      where maps.id = map_features.map_id
        and maps.user_id = auth.uid()
    )
  );

drop policy if exists "features_delete_owner" on public.map_features;
create policy "features_delete_owner"
  on public.map_features
  for delete
  using (
    exists (
      select 1
      from public.maps
      where maps.id = map_features.map_id
        and maps.user_id = auth.uid()
    )
  );

drop policy if exists "memos_select_visible_or_owner" on public.feature_memos;
create policy "memos_select_visible_or_owner"
  on public.feature_memos
  for select
  using (
    exists (
      select 1
      from public.map_features
      join public.maps on maps.id = map_features.map_id
      where map_features.id = feature_memos.feature_id
        and (maps.visibility in ('public', 'unlisted') or maps.user_id = auth.uid())
    )
  );

drop policy if exists "memos_insert_authenticated" on public.feature_memos;
create policy "memos_insert_authenticated"
  on public.feature_memos
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.map_features
      join public.maps on maps.id = map_features.map_id
      where map_features.id = feature_memos.feature_id
        and (maps.visibility in ('public', 'unlisted') or maps.user_id = auth.uid())
    )
  );

drop policy if exists "memos_delete_self" on public.feature_memos;
create policy "memos_delete_self"
  on public.feature_memos
  for delete
  using (auth.uid() = user_id);

drop policy if exists "follows_select_public" on public.follows;
create policy "follows_select_public"
  on public.follows
  for select
  using (true);

drop policy if exists "follows_insert_self" on public.follows;
create policy "follows_insert_self"
  on public.follows
  for insert
  with check (auth.uid() = follower_id);

drop policy if exists "follows_delete_self" on public.follows;
create policy "follows_delete_self"
  on public.follows
  for delete
  using (auth.uid() = follower_id);

drop policy if exists "view_logs_insert_all" on public.view_logs;
create policy "view_logs_insert_all"
  on public.view_logs
  for insert
  with check (true);

drop policy if exists "view_logs_select_owner" on public.view_logs;
create policy "view_logs_select_owner"
  on public.view_logs
  for select
  using (
    exists (
      select 1
      from public.maps
      where maps.id = view_logs.map_id
        and maps.user_id = auth.uid()
    )
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'loca-user'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
