-- Generic revision support only. Target identities and existing decisions stay private in the database.
alter table private.player_penalties add column if not exists revision integer not null default 1 check (revision >= 1);
alter table private.player_penalties add column if not exists reset_skill_points boolean not null default false;
alter table private.player_penalties add column if not exists shop_types integer not null default 0 check (shop_types between 0 and 6);
alter table private.player_penalties add column if not exists acknowledged_revision integer not null default 0;
alter table private.player_penalties add column if not exists client_receipt jsonb;
update private.player_penalties set acknowledged_revision=1 where acknowledged_at is not null and acknowledged_revision=0;

create or replace function public.get_player_penalty(p_pid text, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare expected_hash text; decision jsonb;
begin
  if p_key is null or char_length(p_key)<16 then raise exception 'denied'; end if;
  select key_hash into expected_hash from public.profiles where pid=p_pid;
  if not found then return null; end if;
  if expected_hash is distinct from encode(sha256(convert_to('#ashen-profile'||p_key,'UTF8')),'hex') then raise exception 'denied'; end if;
  select jsonb_build_object('id',id,'skill_nodes',skill_nodes,'shop_levels',shop_levels,'heroes',heroes,
    'reset_coins',reset_coins,'revision',revision,'reset_skill_points',reset_skill_points,'shop_types',shop_types,
    'skill_node_limit',greatest(0,coalesce((before_stats->>'tr')::integer,25)-skill_nodes))
    into decision from private.player_penalties where pid=p_pid order by issued_at desc,id desc limit 1;
  return decision;
end $$;
revoke all on function public.get_player_penalty(text,text) from public,anon,authenticated;
grant execute on function public.get_player_penalty(text,text) to anon;

-- A private audit of the migration's saved after-state, not a claim of authoritative server-side balances.
create or replace function public.ack_player_penalty(p_pid text,p_key text,p_penalty text,p_revision integer,p_receipt jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare expected_hash text; decision private.player_penalties;
begin
  if p_key is null or char_length(p_key)<16 then raise exception 'denied'; end if;
  select key_hash into expected_hash from public.profiles where pid=p_pid;
  if not found or expected_hash is distinct from encode(sha256(convert_to('#ashen-profile'||p_key,'UTF8')),'hex') then raise exception 'denied'; end if;
  select * into decision from private.player_penalties where pid=p_pid and id=p_penalty for update;
  if not found or p_revision is distinct from decision.revision then raise exception 'denied'; end if;
  if decision.acknowledged_revision>=p_revision then return true; end if;
  if p_receipt is null or jsonb_typeof(p_receipt) is distinct from 'object' or octet_length(p_receipt::text)>20000
    or p_receipt->>'revision' is distinct from p_revision::text
    or jsonb_typeof(p_receipt->'report') is distinct from 'object'
    or (decision.reset_skill_points and p_receipt#>>'{report,skill_points}' is distinct from '0')
    or jsonb_typeof(p_receipt#>'{report,tree_nodes}') is distinct from 'number'
    or jsonb_typeof(p_receipt#>'{report,shop_ranks}') is distinct from 'number'
    or jsonb_typeof(p_receipt#>'{report,shop_types}') is distinct from 'number' then raise exception 'bad receipt'; end if;
  if (p_receipt#>>'{report,tree_nodes}')::numeric not between 0 and greatest(0,coalesce((decision.before_stats->>'tr')::integer,25)-decision.skill_nodes)
    or (p_receipt#>>'{report,shop_ranks}')::numeric not between 0 and 40
    or (decision.shop_types>0 and (p_receipt#>>'{report,shop_types}')::numeric not between 0 and greatest(0,6-decision.shop_types))
    or (decision.shop_types=0 and (p_receipt#>>'{report,shop_ranks}')::numeric>greatest(0,40-decision.shop_levels)) then raise exception 'incomplete receipt'; end if;
  update private.player_penalties set client_receipt=p_receipt,acknowledged_revision=p_revision,acknowledged_at=now()
    where pid=p_pid and id=p_penalty;
  return true;
end $$;
revoke all on function public.ack_player_penalty(text,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ack_player_penalty(text,text,text,integer,jsonb) to anon;

create or replace function private.guard_profile_penalty()
returns trigger language plpgsql security definer set search_path = '' as $$
declare decision private.player_penalties;
begin
  select * into decision from private.player_penalties where pid=new.pid order by issued_at desc,id desc limit 1;
  if found then
    if new.stats->>'penalty' is distinct from decision.id
      or (decision.revision>1 and (new.stats->>'penalty_revision' is distinct from decision.revision::text
        or decision.acknowledged_revision<decision.revision)) then raise exception 'client_update_required'; end if;
    update private.player_penalties set acknowledged_at=coalesce(acknowledged_at,now())
      where id=decision.id and pid=decision.pid and acknowledged_at is null;
  end if;
  return new;
end $$;
revoke all on function private.guard_profile_penalty() from public,anon,authenticated;

create or replace function private.guard_penalized_score()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from private.player_penalties d join public.profiles p on p.pid=d.pid
    where (new.name=d.original_name or new.name=p.name)
      and (current_setting('ashen.penalty_pid',true) is distinct from d.pid or (d.revision>1 and d.acknowledged_revision<d.revision)))
    then raise exception 'client_update_required'; end if;
  return new;
end $$;
revoke all on function private.guard_penalized_score() from public,anon,authenticated;
