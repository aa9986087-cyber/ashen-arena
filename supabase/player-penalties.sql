-- One-time owner decisions. No device keys, balances or private backups are exposed to clients.
create schema if not exists private;
create table if not exists private.player_penalties (
  id text not null,
  pid text not null,
  original_name text not null,
  skill_nodes integer not null check (skill_nodes between 0 and 25),
  shop_levels integer not null check (shop_levels between 0 and 100),
  heroes integer not null default 0 check (heroes between 0 and 6),
  reset_coins boolean not null default true,
  before_stats jsonb not null,
  before_scores jsonb not null default '[]',
  before_weekly jsonb not null default '[]',
  issued_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key (id, pid)
);
alter table private.player_penalties add column if not exists heroes integer not null default 0 check (heroes between 0 and 6);
alter table private.player_penalties enable row level security;
revoke all on private.player_penalties from public, anon, authenticated;

-- save_profile already checks the device's secret key. Reject pre-correction saves,
-- including renamed profiles, until the new client has migrated that same device ID.
create or replace function private.guard_profile_penalty()
returns trigger language plpgsql security definer set search_path = '' as $$
declare decision private.player_penalties;
begin
  select * into decision from private.player_penalties
    where pid = new.pid order by issued_at desc, id desc limit 1;
  if found then
    if new.stats->>'penalty' is distinct from decision.id then
      raise exception 'client_update_required';
    end if;
    update private.player_penalties set acknowledged_at = coalesce(acknowledged_at, now())
      where id = decision.id and pid = decision.pid and acknowledged_at is null;
  end if;
  return new;
end $$;
revoke all on function private.guard_profile_penalty() from public, anon, authenticated;
drop trigger if exists player_penalty_guard on public.profiles;
create trigger player_penalty_guard before insert or update on public.profiles
  for each row execute function private.guard_profile_penalty();

-- The old name-only score RPC cannot resurrect these records. Their updated client
-- uses the device-key-checked RPC below. Other players keep the existing score path.
create or replace function private.guard_penalized_score()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from private.player_penalties d
    join public.profiles p on p.pid = d.pid
    where (new.name = d.original_name or new.name = p.name)
      and current_setting('ashen.penalty_pid', true) is distinct from d.pid
  ) then
    raise exception 'client_update_required';
  end if;
  return new;
end $$;
revoke all on function private.guard_penalized_score() from public, anon, authenticated;
drop trigger if exists player_penalty_guard on public.scores;
create trigger player_penalty_guard before insert or update on public.scores
  for each row execute function private.guard_penalized_score();
drop trigger if exists player_penalty_guard on public.weekly_scores;
create trigger player_penalty_guard before insert or update on public.weekly_scores
  for each row execute function private.guard_penalized_score();

create or replace function public.submit_penalized_score(
  p_pid text, p_key text, p_penalty text,
  p_kills integer, p_lvl integer, p_t integer, p_bosses integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare player_name text; expected_hash text; decision_id text; accepted boolean;
begin
  if p_key is null or char_length(p_key) < 16 then raise exception 'denied'; end if;
  select name, key_hash into player_name, expected_hash from public.profiles where pid = p_pid;
  if not found or expected_hash is distinct from
    encode(sha256(convert_to('#ashen-profile' || p_key, 'UTF8')), 'hex') then
    raise exception 'denied';
  end if;
  select id into decision_id from private.player_penalties
    where pid = p_pid order by issued_at desc, id desc limit 1;
  if not found or p_penalty is distinct from decision_id then raise exception 'denied'; end if;
  perform set_config('ashen.penalty_pid', p_pid, true);
  accepted := public.submit_score(player_name, p_kills, p_lvl, p_t, p_bosses);
  perform set_config('ashen.penalty_pid', '', true);
  return accepted;
end $$;
revoke all on function public.submit_penalized_score(text, text, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.submit_penalized_score(text, text, text, integer, integer, integer, integer) to anon;

-- Return only the authenticated device's rules. No target list or raw device IDs in public game files.
create or replace function public.get_player_penalty(p_pid text, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare expected_hash text; decision jsonb;
begin
  if p_key is null or char_length(p_key) < 16 then raise exception 'denied'; end if;
  select key_hash into expected_hash from public.profiles where pid = p_pid;
  if not found then return null; end if;
  if expected_hash is distinct from encode(sha256(convert_to('#ashen-profile' || p_key, 'UTF8')), 'hex') then
    raise exception 'denied';
  end if;
  select jsonb_build_object('id',id,'skill_nodes',skill_nodes,'shop_levels',shop_levels,
    'heroes',heroes,'reset_coins',reset_coins) into decision from private.player_penalties
    where pid=p_pid order by issued_at desc,id desc limit 1;
  return decision;
end $$;
revoke all on function public.get_player_penalty(text,text) from public,anon,authenticated;
grant execute on function public.get_player_penalty(text,text) to anon;
