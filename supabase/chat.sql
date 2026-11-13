-- Public chat for Ashen Arena (run once in the Supabase SQL editor).
create table if not exists public.chat (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 14),
  msg text not null check (char_length(msg) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists chat_created_idx on public.chat (created_at desc);
alter table public.chat enable row level security;
drop policy if exists "chat readable by all" on public.chat;
create policy "chat readable by all" on public.chat for select to anon, authenticated using (true);
revoke insert, update, delete on public.chat from anon, authenticated;

-- Sending goes through this function: one message per name every 3 s, max 30 msgs / 10 s overall,
-- and messages older than 2 days are cleaned up.
create or replace function public.send_chat(p_name text, p_msg text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare n text := btrim(p_name); m text := btrim(regexp_replace(p_msg, '\s+', ' ', 'g'));
begin
  if n = '' or char_length(n) > 14 then raise exception 'bad name'; end if;
  if m = '' then raise exception 'empty'; end if;
  m := left(m, 200);
  if exists (select 1 from chat where name = n and created_at > now() - interval '3 seconds') then
    raise exception 'slow down';
  end if;
  if (select count(*) from chat where created_at > now() - interval '10 seconds') > 30 then
    raise exception 'busy';
  end if;
  insert into chat(name, msg) values (n, m);
  delete from chat where created_at < now() - interval '2 days';
end $$;
revoke all on function public.send_chat(text, text) from public;
grant execute on function public.send_chat(text, text) to anon, authenticated;
