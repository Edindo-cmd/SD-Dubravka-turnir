create extension if not exists pgcrypto;

create table if not exists public.admins (
  email text primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  match_number integer unique not null,
  home_name text not null,
  away_name text not null,
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  status text not null default 'scheduled' check (status in ('scheduled','live','finished','postponed')),
  scheduled_at timestamptz,
  evening_title text,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_name text not null,
  player_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.admins enable row level security;
alter table public.matches enable row level security;
alter table public.goals enable row level security;

drop policy if exists "admin reads own record" on public.admins;
create policy "admin reads own record" on public.admins for select
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "public reads matches" on public.matches;
create policy "public reads matches" on public.matches for select using (true);

drop policy if exists "admins manage matches" on public.matches;
create policy "admins manage matches" on public.matches for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads goals" on public.goals;
create policy "public reads goals" on public.goals for select using (true);

drop policy if exists "admins manage goals" on public.goals;
create policy "admins manage goals" on public.goals for all
using (public.is_admin()) with check (public.is_admin());

insert into public.admins(email, display_name)
values ('elizde89@gmail.com', 'Edo')
on conflict (email) do update set display_name = excluded.display_name;

insert into public.matches(match_number,home_name,away_name) values
(1,'Kafadar Gnojnice','Barber shop Sema'),
(2,'Bobanovo','Barber shop Šule'),
(3,'Hercegovina Kup','Turnir Stolac'),
(4,'Dubrave','Turnir Dračevice'),
(5,'KMF Moderna','Vukovi sa Zeca'),
(6,'Caffe Pink Caffe Label G&L Company','Kairo'),
(7,'Bijelo Polje','Narentas'),
(8,'KMF Akademac','KMF Nevesinje'),
(9,'Alumina','Za Almina, Enisa i Dalilu'),
(10,'Bingo Pumpa','Caja Prom'),
(11,'F.K Blagaj','SD Dubravka')
on conflict (match_number) do update set
home_name=excluded.home_name,
away_name=excluded.away_name;

create or replace view public.matches_public as
select id, match_number, home_name, away_name, home_score, away_score, status, scheduled_at, evening_title
from public.matches;

create or replace view public.scorers_public as
select player_name, team_name, sum(quantity)::integer as goals
from public.goals
group by player_name, team_name;

grant select on public.matches_public to anon, authenticated;
grant select on public.scorers_public to anon, authenticated;
