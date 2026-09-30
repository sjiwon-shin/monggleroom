-- 몽글룸 2단계: 방문자 수, 오늘의 기분, 다이어리, 사진첩, 비밀 방명록, 단짝, 몽글 산책
-- 01_tables.sql 을 실행한 뒤에 이 파일을 한 번 실행하세요.

alter table public.homes add column if not exists mood text not null default '' check (char_length(mood) <= 20);
alter table public.homes add column if not exists today_count int not null default 0;
alter table public.homes add column if not exists total_count int not null default 0;
alter table public.homes add column if not exists count_day date not null default ((now() at time zone 'Asia/Seoul')::date);

alter table public.notes add column if not exists secret boolean not null default false;
drop policy if exists "read notes" on public.notes;
create policy "read notes" on public.notes for select to anon, authenticated using (secret = false);

create table if not exists public.diary (
id bigserial primary key,
home_id text not null references public.homes(id) on delete cascade,
body text not null check (char_length(body) between 1 and 1000),
mood text not null default '' check (char_length(mood) <= 20),
created_at timestamptz not null default now()
);
create index if not exists diary_home_idx on public.diary (home_id, created_at desc);

create table if not exists public.photos (
id bigserial primary key,
home_id text not null references public.homes(id) on delete cascade,
image text not null check (char_length(image) <= 400000),
caption text not null default '' check (char_length(caption) <= 100),
created_at timestamptz not null default now()
);
create index if not exists photos_home_idx on public.photos (home_id, created_at desc);

create table if not exists public.friends (
a text not null references public.homes(id) on delete cascade,
b text not null references public.homes(id) on delete cascade,
status text not null default 'wait' check (status in ('wait', 'ok')),
created_at timestamptz not null default now(),
primary key (a, b)
);

grant select on public.diary, public.photos to anon, authenticated;
revoke all on public.friends from anon, authenticated;
alter table public.diary enable row level security;
alter table public.photos enable row level security;
alter table public.friends enable row level security;
drop policy if exists "read diary" on public.diary;
create policy "read diary" on public.diary for select to anon, authenticated using (true);
drop policy if exists "read photos" on public.photos;
create policy "read photos" on public.photos for select to anon, authenticated using (true);

create or replace function public.owns(p_home text, p_key text) returns boolean
language sql security definer set search_path = public stable as $$
select exists (select 1 from home_secrets where id = p_home and owner_key = p_key);
$$;

drop function if exists public.update_home(text, text, text, text, text, text);
create or replace function public.update_home(p_id text, p_key text, p_name text, p_avatar text, p_status text, p_theme text, p_mood text)
returns void language plpgsql security definer set search_path = public as $$
begin
if not owns(p_id, p_key) then raise exception 'BAD_KEY'; end if;
update homes set name = p_name, avatar = p_avatar, status = coalesce(p_status, ''), theme = coalesce(p_theme, 'mint'), mood = coalesce(p_mood, '') where id = p_id;
end $$;

create or replace function public.check_key(p_home text, p_key text) returns boolean
language sql security definer set search_path = public as $$ select owns(p_home, p_key); $$;

create or replace function public.visit(p_home text) returns table(today int, total int)
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; t int; tt int;
begin
update homes set
today_count = case when count_day = d then today_count + 1 else 1 end,
count_day = d, total_count = total_count + 1
where id = p_home returning today_count, total_count into t, tt;
return query select t, tt;
end $$;

create or replace function public.add_diary(p_home text, p_key text, p_body text, p_mood text) returns void
language plpgsql security definer set search_path = public as $$
begin
if not owns(p_home, p_key) then raise exception 'BAD_KEY'; end if;
insert into diary (home_id, body, mood) values (p_home, p_body, coalesce(p_mood, ''));
end $$;

create or replace function public.delete_diary(p_home text, p_key text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
if not owns(p_home, p_key) then raise exception 'BAD_KEY'; end if;
delete from diary where id = p_id and home_id = p_home;
end $$;

create or replace function public.add_photo(p_home text, p_key text, p_image text, p_caption text) returns void
language plpgsql security definer set search_path = public as $$
begin
if not owns(p_home, p_key) then raise exception 'BAD_KEY'; end if;
if (select count(*) from photos where home_id = p_home) >= 60 then raise exception 'TOO_MANY'; end if;
if p_image not like 'data:image/jpeg;base64,%' then raise exception 'BAD_IMAGE'; end if;
insert into photos (home_id, image, caption) values (p_home, p_image, coalesce(p_caption, ''));
end $$;

create or replace function public.delete_photo(p_home text, p_key text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
if not owns(p_home, p_key) then raise exception 'BAD_KEY'; end if;
delete from photos where id = p_id and home_id = p_home;
end $$;

create or replace function public.secret_notes(p_home text, p_key text)
returns setof notes language plpgsql security definer set search_path = public as $$
begin
if not owns(p_home, p_key) then raise exception 'BAD_KEY'; end if;
return query select * from notes where home_id = p_home and secret order by created_at desc limit 100;
end $$;

create or replace function public.friend_request(p_from text, p_key text, p_to text) returns text
language plpgsql security definer set search_path = public as $$
begin
if not owns(p_from, p_key) then raise exception 'BAD_KEY'; end if;
if p_from = p_to then raise exception 'SELF'; end if;
if exists (select 1 from friends where (a = p_from and b = p_to or a = p_to and b = p_from) and status = 'ok') then return 'already'; end if;
if exists (select 1 from friends where a = p_to and b = p_from) then
update friends set status = 'ok' where a = p_to and b = p_from; return 'ok';
end if;
insert into friends (a, b) values (p_from, p_to) on conflict do nothing;
return 'wait';
end $$;

create or replace function public.friend_answer(p_home text, p_key text, p_from text, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
if not owns(p_home, p_key) then raise exception 'BAD_KEY'; end if;
if p_ok then update friends set status = 'ok' where a = p_from and b = p_home;
else delete from friends where a = p_from and b = p_home; end if;
end $$;

create or replace function public.friend_remove(p_home text, p_key text, p_other text) returns void
language plpgsql security definer set search_path = public as $$
begin
if not owns(p_home, p_key) then raise exception 'BAD_KEY'; end if;
delete from friends where (a = p_home and b = p_other) or (a = p_other and b = p_home);
end $$;

create or replace function public.list_friends(p_home text)
returns table(id text, name text, avatar text, mood text)
language sql security definer set search_path = public stable as $$
select h.id, h.name, h.avatar, h.mood from friends f
join homes h on h.id = case when f.a = p_home then f.b else f.a end
where (f.a = p_home or f.b = p_home) and f.status = 'ok'
order by h.name;
$$;

create or replace function public.friend_requests(p_home text, p_key text)
returns table(id text, name text, avatar text)
language plpgsql security definer set search_path = public as $$
begin
if not owns(p_home, p_key) then raise exception 'BAD_KEY'; end if;
return query select h.id, h.name, h.avatar from friends f join homes h on h.id = f.a
where f.b = p_home and f.status = 'wait' order by f.created_at desc;
end $$;

create or replace function public.friend_state(p_me text, p_other text) returns text
language sql security definer set search_path = public stable as $$
select coalesce((select case when status = 'ok' then 'ok' when a = p_me then 'sent' else 'received' end
from friends where (a = p_me and b = p_other) or (a = p_other and b = p_me) limit 1), 'none');
$$;

create or replace function public.random_home(p_not text) returns text
language sql security definer set search_path = public volatile as $$
select id from homes where id <> coalesce(p_not, '') order by random() limit 1;
$$;

grant execute on function public.update_home(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.check_key(text, text) to anon, authenticated;
grant execute on function public.visit(text) to anon, authenticated;
grant execute on function public.add_diary(text, text, text, text) to anon, authenticated;
grant execute on function public.delete_diary(text, text, bigint) to anon, authenticated;
grant execute on function public.add_photo(text, text, text, text) to anon, authenticated;
grant execute on function public.delete_photo(text, text, bigint) to anon, authenticated;
grant execute on function public.secret_notes(text, text) to anon, authenticated;
grant execute on function public.friend_request(text, text, text) to anon, authenticated;
grant execute on function public.friend_answer(text, text, text, boolean) to anon, authenticated;
grant execute on function public.friend_remove(text, text, text) to anon, authenticated;
grant execute on function public.list_friends(text) to anon, authenticated;
grant execute on function public.friend_requests(text, text) to anon, authenticated;
grant execute on function public.friend_state(text, text) to anon, authenticated;
grant execute on function public.random_home(text) to anon, authenticated;
revoke execute on function public.owns(text, text) from anon, authenticated, public;
