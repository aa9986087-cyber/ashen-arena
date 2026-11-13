-- Sword duel record (run once in the Supabase SQL editor): who fought whom and who won.
create table if not exists public.duels (id bigint generated always as identity primary key, a text not null check (char_length(a) between 1 and 14), b text not null check (char_length(b) between 1 and 14), winner text not null, score text not null check (char_length(score) <= 7), created_at timestamptz not null default now());
alter table public.duels enable row level security;
create policy "read duels" on public.duels for select to anon using (true);
create or replace function public.record_duel(p_a text, p_b text, p_winner text, p_score text) returns void language plpgsql security definer set search_path = public as $$ begin if p_winner not in (p_a, p_b) or p_a = p_b then raise exception 'bad'; end if; if exists (select 1 from duels where a = p_a and b = p_b and created_at > now() - interval '20 seconds') then raise exception 'slow'; end if; insert into duels(a, b, winner, score) values (btrim(p_a), btrim(p_b), btrim(p_winner), p_score); end $$;
grant execute on function public.record_duel(text, text, text, text) to anon;
