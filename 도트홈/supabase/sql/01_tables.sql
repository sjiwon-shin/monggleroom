-- ─────────────────────────────────────────────────────────
--  도트홈 — 데이터베이스 설정
--  Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run 하세요.
-- ─────────────────────────────────────────────────────────

-- 홈 (공개 정보)
create table if not exists public.homes (
  id          text primary key,
  name        text not null check (char_length(name) between 1 and 20),
  avatar      text not null check (char_length(avatar) <= 60),
  status      text not null default '' check (char_length(status) <= 60),
  theme       text not null default 'mint' check (char_length(theme) <= 20),
  created_at  timestamptz not null default now()
);

-- 홈 주인의 열쇠 (아무도 읽을 수 없음 — 아래 함수만 확인)
create table if not exists public.home_secrets (
  id         text primary key references public.homes(id) on delete cascade,
  owner_key  text not null
);

-- 방명록
create table if not exists public.notes (
  id          bigserial primary key,
  home_id     text not null references public.homes(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 20),
  avatar      text not null check (char_length(avatar) <= 60),
  message     text not null check (char_length(message) between 1 and 200),
  created_at  timestamptz not null default now()
);
create index if not exists notes_home_idx on public.notes (home_id, created_at desc);

-- 새 프로젝트에서 "Automatically expose new tables" 를 끈 경우를 대비해 권한을 직접 줍니다.
-- (home_secrets 는 주지 않음 — 아무도 읽을 수 없어야 함)
grant usage on schema public to anon, authenticated;
grant select on public.homes to anon, authenticated;
grant select, insert on public.notes to anon, authenticated;
grant usage, select on sequence public.notes_id_seq to anon, authenticated;
revoke all on public.home_secrets from anon, authenticated;

alter table public.homes        enable row level security;
alter table public.home_secrets enable row level security;
alter table public.notes        enable row level security;

-- 누구나 홈과 방명록을 볼 수 있고, 방명록을 남길 수 있음
drop policy if exists "read homes" on public.homes;
create policy "read homes" on public.homes for select to anon, authenticated using (true);

drop policy if exists "read notes" on public.notes;
create policy "read notes" on public.notes for select to anon, authenticated using (true);

drop policy if exists "write notes" on public.notes;
create policy "write notes" on public.notes for insert to anon, authenticated with check (true);

-- 홈 만들기 / 고치기 / 방명록 지우기는 열쇠를 확인하는 함수로만
create or replace function public.create_home(p_id text, p_key text, p_name text, p_avatar text, p_status text, p_theme text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(p_id) < 6 or char_length(p_key) < 16 then raise exception 'BAD_KEY'; end if;
  insert into homes (id, name, avatar, status, theme) values (p_id, p_name, p_avatar, coalesce(p_status, ''), coalesce(p_theme, 'mint'));
  insert into home_secrets (id, owner_key) values (p_id, p_key);
end $$;

create or replace function public.update_home(p_id text, p_key text, p_name text, p_avatar text, p_status text, p_theme text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from home_secrets where id = p_id and owner_key = p_key) then raise exception 'BAD_KEY'; end if;
  update homes set name = p_name, avatar = p_avatar, status = coalesce(p_status, ''), theme = coalesce(p_theme, 'mint') where id = p_id;
end $$;

create or replace function public.delete_note(p_home text, p_key text, p_note bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from home_secrets where id = p_home and owner_key = p_key) then raise exception 'BAD_KEY'; end if;
  delete from notes where id = p_note and home_id = p_home;
end $$;

grant execute on function public.create_home(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.update_home(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.delete_note(text, text, bigint) to anon, authenticated;
