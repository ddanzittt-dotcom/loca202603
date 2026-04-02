-- 피처 미디어 메타데이터 테이블
-- 사진/음성 파일의 Storage 경로와 메타정보를 DB에 영속 저장한다.

create table if not exists public.feature_media (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid references public.map_features(id) on delete cascade not null,
  media_type text not null check (media_type in ('photo', 'voice')),
  storage_path text not null,
  public_url text not null,
  mime_type text not null default 'image/jpeg',
  file_ext text not null default 'jpg',
  size_bytes integer not null default 0,
  duration_sec real,  -- 음성 전용
  created_at timestamptz not null default now()
);

create index if not exists idx_feature_media_feature_id on public.feature_media(feature_id);

-- RLS: 지도 소유자만 쓰기, 발행 지도는 누구나 읽기
alter table public.feature_media enable row level security;

-- SELECT: 본인 지도의 미디어 + 발행된 지도의 미디어
create policy "feature_media_select" on public.feature_media for select using (
  exists (
    select 1 from public.map_features mf
    join public.maps m on m.id = mf.map_id
    where mf.id = feature_media.feature_id
      and (m.user_id = auth.uid() or m.is_published = true)
  )
);

-- INSERT: 본인 지도에만
create policy "feature_media_insert" on public.feature_media for insert with check (
  exists (
    select 1 from public.map_features mf
    join public.maps m on m.id = mf.map_id
    where mf.id = feature_media.feature_id
      and m.user_id = auth.uid()
  )
);

-- DELETE: 본인 지도에만
create policy "feature_media_delete" on public.feature_media for delete using (
  exists (
    select 1 from public.map_features mf
    join public.maps m on m.id = mf.map_id
    where mf.id = feature_media.feature_id
      and m.user_id = auth.uid()
  )
);
