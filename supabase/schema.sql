create extension if not exists pgcrypto;

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.admins (
  email text primary key,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  name text not null,
  is_placeholder boolean not null default false,
  created_at timestamptz not null default now(),
  unique(season_id, name)
);

create table if not exists public.evenings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  title text not null,
  event_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  match_number integer,
  round_name text not null default 'Prvo kolo',
  round_order integer not null default 1,
  home_team_id uuid references public.teams(id) on delete set null,
  away_team_id uuid references public.teams(id) on delete set null,
  home_label text,
  away_label text,
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  status text not null default 'scheduled' check (status in ('scheduled','live','finished','postponed')),
  scheduled_at timestamptz,
  evening_id uuid references public.evenings(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  number integer,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  player_name_override text,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  check (player_id is not null or length(trim(coalesce(player_name_override,''))) > 0)
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

alter table public.seasons enable row level security;
alter table public.admins enable row level security;
alter table public.teams enable row level security;
alter table public.evenings enable row level security;
alter table public.matches enable row level security;
alter table public.players enable row level security;
alter table public.goals enable row level security;

drop policy if exists "public read seasons" on public.seasons;
create policy "public read seasons" on public.seasons for select using (true);
drop policy if exists "admin write seasons" on public.seasons;
create policy "admin write seasons" on public.seasons for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin read admins" on public.admins;
create policy "admin read admins" on public.admins for select using (
  public.is_admin() or lower(email)=lower(coalesce(auth.jwt()->>'email',''))
);
drop policy if exists "admin write admins" on public.admins;
create policy "admin write admins" on public.admins for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read teams" on public.teams;
create policy "public read teams" on public.teams for select using (true);
drop policy if exists "admin write teams" on public.teams;
create policy "admin write teams" on public.teams for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read evenings" on public.evenings;
create policy "public read evenings" on public.evenings for select using (true);
drop policy if exists "admin write evenings" on public.evenings;
create policy "admin write evenings" on public.evenings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read matches" on public.matches;
create policy "public read matches" on public.matches for select using (true);
drop policy if exists "admin write matches" on public.matches;
create policy "admin write matches" on public.matches for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read players" on public.players;
create policy "public read players" on public.players for select using (true);
drop policy if exists "admin write players" on public.players;
create policy "admin write players" on public.players for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read goals" on public.goals;
create policy "public read goals" on public.goals for select using (true);
drop policy if exists "admin write goals" on public.goals;
create policy "admin write goals" on public.goals for all using (public.is_admin()) with check (public.is_admin());

insert into public.admins(email, display_name)
values ('elizde89@gmail.com', 'Edo')
on conflict (email) do update set display_name = excluded.display_name;

do $$
declare
  sid uuid;
begin
  insert into public.seasons(name, is_active)
  values ('Turnir SD Dubravka', true)
  on conflict (name) do update set is_active = true
  returning id into sid;

  update public.seasons set is_active = (id = sid);

  insert into public.teams(season_id, name, is_placeholder) values
    (sid,'Kafadar Gnojnice',false),
    (sid,'Barber shop Sema',false),
    (sid,'R1',true),
    (sid,'Bobanovo',false),
    (sid,'Barber shop Šule',false),
    (sid,'R2',true),
    (sid,'Hercegovina Kup',false),
    (sid,'Turnir Stolac',false),
    (sid,'Dubrave',false),
    (sid,'Turnir Dračevice',false),
    (sid,'KMF Moderna',false),
    (sid,'Vukovi sa Zeca',false),
    (sid,'R3',true),
    (sid,'Caffe Pink Caffe Label G&L Company',false),
    (sid,'Kairo',false),
    (sid,'Bijelo Polje',false),
    (sid,'Narentas',false),
    (sid,'KMF Akademac',false),
    (sid,'KMF Nevesinje',false),
    (sid,'R4',true),
    (sid,'Alumina',false),
    (sid,'Za Almina, Enisa i Dalilu',false),
    (sid,'R5',true),
    (sid,'Bingo Pumpa',false),
    (sid,'Caja Prom',false),
    (sid,'F.K Blagaj',false),
    (sid,'SD Dubravka',false)
  on conflict (season_id, name) do nothing;

  if not exists (select 1 from public.matches where season_id=sid) then
    insert into public.matches(season_id,match_number,home_team_id,away_team_id)
    values
      (sid,1,(select id from public.teams where season_id=sid and name='Kafadar Gnojnice'),(select id from public.teams where season_id=sid and name='Barber shop Sema')),
      (sid,2,(select id from public.teams where season_id=sid and name='Bobanovo'),(select id from public.teams where season_id=sid and name='Barber shop Šule')),
      (sid,3,(select id from public.teams where season_id=sid and name='Hercegovina Kup'),(select id from public.teams where season_id=sid and name='Turnir Stolac')),
      (sid,4,(select id from public.teams where season_id=sid and name='Dubrave'),(select id from public.teams where season_id=sid and name='Turnir Dračevice')),
      (sid,5,(select id from public.teams where season_id=sid and name='KMF Moderna'),(select id from public.teams where season_id=sid and name='Vukovi sa Zeca')),
      (sid,6,(select id from public.teams where season_id=sid and name='Caffe Pink Caffe Label G&L Company'),(select id from public.teams where season_id=sid and name='Kairo')),
      (sid,7,(select id from public.teams where season_id=sid and name='Bijelo Polje'),(select id from public.teams where season_id=sid and name='Narentas')),
      (sid,8,(select id from public.teams where season_id=sid and name='KMF Akademac'),(select id from public.teams where season_id=sid and name='KMF Nevesinje')),
      (sid,9,(select id from public.teams where season_id=sid and name='Alumina'),(select id from public.teams where season_id=sid and name='Za Almina, Enisa i Dalilu')),
      (sid,10,(select id from public.teams where season_id=sid and name='Bingo Pumpa'),(select id from public.teams where season_id=sid and name='Caja Prom')),
      (sid,11,(select id from public.teams where season_id=sid and name='F.K Blagaj'),(select id from public.teams where season_id=sid and name='SD Dubravka'));
  end if;
end $$;
