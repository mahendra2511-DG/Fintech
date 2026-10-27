-- Capstone project sites: live database on Supabase (run ONCE in Supabase → SQL Editor → New query → Run).
-- One table holds the data of every project site (each site uses its own key prefix, e.g. "proxima:hr:").
-- Only the server (service role key in Vercel) can read or write it. Students' browsers never touch it directly.

create table if not exists public.kv (
  k   text primary key,
  typ text not null,            -- string | set | hash | list
  v   jsonb not null,
  exp timestamptz               -- expiry time (null = keep)
);
create index if not exists kv_exp_idx on public.kv (exp) where exp is not null;
alter table public.kv enable row level security;   -- no policies: the public (anon) key cannot see anything
revoke all on public.kv from anon, authenticated;

-- Runs a list of Redis-style commands in one call, e.g. [["HSET","p:u:1","name","Asha"],["SADD","p:users","1"]]
create or replace function public.kv_exec(cmds jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c jsonb; op text; key text; res jsonb; outp jsonb := '[]'::jsonb;
  have boolean; ctyp text; cv jsonb; cexp timestamptz;
  i int; n int; m text; f text; x bigint; ex int; nx boolean; keep boolean; s int; e int; len int;
begin
  if random() < 0.003 then delete from kv where exp is not null and exp < now(); end if;
  for c in select value from jsonb_array_elements(cmds) loop
    op := upper(c->>0); key := c->>1; res := 'null'::jsonb;
    have := false; ctyp := null; cv := null; cexp := null;
    if key is not null then
      select typ, v, exp into ctyp, cv, cexp from kv where kv.k = key for update;
      have := found;
      if have and cexp is not null and cexp < now() then delete from kv where kv.k = key; have := false; ctyp := null; cv := null; cexp := null; end if;
    end if;

    if op = 'GET' then
      if have and ctyp = 'string' then res := cv; end if;

    elsif op = 'SET' then
      ex := null; nx := false; keep := false; i := 3;
      while i < jsonb_array_length(c) loop
        if upper(c->>i) = 'EX' then ex := (c->>(i+1))::int; i := i + 2;
        elsif upper(c->>i) = 'PX' then ex := greatest(1, (c->>(i+1))::int / 1000); i := i + 2;
        elsif upper(c->>i) = 'NX' then nx := true; i := i + 1;
        elsif upper(c->>i) = 'KEEPTTL' then keep := true; i := i + 1;
        else i := i + 1; end if;
      end loop;
      if nx and have then res := 'null'::jsonb;
      else
        insert into kv(k, typ, v, exp) values (key, 'string', to_jsonb(c->>2),
          case when ex is not null then now() + make_interval(secs => ex) when keep and have then cexp else null end)
        on conflict (k) do update set typ = excluded.typ, v = excluded.v, exp = excluded.exp;
        res := '"OK"'::jsonb;
      end if;

    elsif op = 'DEL' then
      n := 0;
      for i in 1 .. jsonb_array_length(c) - 1 loop
        delete from kv where kv.k = c->>i and (exp is null or exp >= now());
        if found then n := n + 1; end if;
      end loop;
      res := to_jsonb(n);

    elsif op = 'EXISTS' then
      res := to_jsonb(case when have then 1 else 0 end);

    elsif op = 'EXPIRE' then
      if have then update kv set exp = now() + make_interval(secs => (c->>2)::int) where kv.k = key; res := '1'::jsonb; else res := '0'::jsonb; end if;

    elsif op = 'TTL' then
      res := to_jsonb(case when not have then -2 when cexp is null then -1 else ceil(extract(epoch from cexp - now()))::int end);

    elsif op in ('INCR', 'INCRBY', 'DECR', 'DECRBY') then
      x := case op when 'INCR' then 1 when 'DECR' then -1 when 'INCRBY' then (c->>2)::bigint else -(c->>2)::bigint end;
      if have and ctyp = 'string' then x := coalesce(nullif(cv #>> '{}', '')::bigint, 0) + x; end if;
      insert into kv(k, typ, v, exp) values (key, 'string', to_jsonb(x::text), case when have then cexp else null end)
      on conflict (k) do update set typ = excluded.typ, v = excluded.v, exp = excluded.exp;
      res := to_jsonb(x);

    elsif op in ('SADD', 'PFADD') then
      if not (have and ctyp = 'set') then cv := '{}'::jsonb; end if;
      n := 0;
      for i in 2 .. jsonb_array_length(c) - 1 loop
        m := c->>i; if not (cv ? m) then cv := cv || jsonb_build_object(m, 1); n := n + 1; end if;
      end loop;
      if n > 0 or not have then
        insert into kv(k, typ, v, exp) values (key, 'set', cv, case when have then cexp else null end)
        on conflict (k) do update set typ = excluded.typ, v = excluded.v, exp = excluded.exp;
      end if;
      res := to_jsonb(case when op = 'PFADD' then least(n, 1) else n end);

    elsif op = 'SREM' then
      n := 0;
      if have and ctyp = 'set' then
        for i in 2 .. jsonb_array_length(c) - 1 loop m := c->>i; if cv ? m then cv := cv - m; n := n + 1; end if; end loop;
        update kv set v = cv where kv.k = key;
      end if;
      res := to_jsonb(n);

    elsif op = 'SISMEMBER' then
      res := to_jsonb(case when have and ctyp = 'set' and cv ? (c->>2) then 1 else 0 end);

    elsif op = 'SMEMBERS' then
      res := '[]'::jsonb;
      if have and ctyp = 'set' then select coalesce(jsonb_agg(t), '[]'::jsonb) into res from jsonb_object_keys(cv) t; end if;

    elsif op in ('SCARD', 'PFCOUNT') then
      res := '0'::jsonb;
      if have and ctyp = 'set' then select to_jsonb(count(*)) into res from jsonb_object_keys(cv); end if;

    elsif op in ('HSET', 'HMSET') then
      if not (have and ctyp = 'hash') then cv := '{}'::jsonb; end if;
      n := 0; i := 2;
      while i + 1 < jsonb_array_length(c) loop
        f := c->>i; if not (cv ? f) then n := n + 1; end if;
        cv := cv || jsonb_build_object(f, c->>(i+1)); i := i + 2;
      end loop;
      insert into kv(k, typ, v, exp) values (key, 'hash', cv, case when have then cexp else null end)
      on conflict (k) do update set typ = excluded.typ, v = excluded.v, exp = excluded.exp;
      res := case when op = 'HMSET' then '"OK"'::jsonb else to_jsonb(n) end;

    elsif op = 'HSETNX' then
      if not (have and ctyp = 'hash') then cv := '{}'::jsonb; end if;
      f := c->>2;
      if cv ? f then res := '0'::jsonb;
      else
        cv := cv || jsonb_build_object(f, c->>3);
        insert into kv(k, typ, v, exp) values (key, 'hash', cv, case when have then cexp else null end)
        on conflict (k) do update set typ = excluded.typ, v = excluded.v, exp = excluded.exp;
        res := '1'::jsonb;
      end if;

    elsif op = 'HGET' then
      if have and ctyp = 'hash' and cv ? (c->>2) then res := to_jsonb(cv->>(c->>2)); end if;

    elsif op = 'HDEL' then
      n := 0;
      if have and ctyp = 'hash' then
        for i in 2 .. jsonb_array_length(c) - 1 loop f := c->>i; if cv ? f then cv := cv - f; n := n + 1; end if; end loop;
        update kv set v = cv where kv.k = key;
      end if;
      res := to_jsonb(n);

    elsif op = 'HGETALL' then
      res := '[]'::jsonb;
      if have and ctyp = 'hash' then
        select coalesce(jsonb_agg(z), '[]'::jsonb) into res from (
          select z from jsonb_each_text(cv) as p(fk, fv), lateral (values (to_jsonb(fk)), (to_jsonb(fv))) as q(z)) w;
      end if;

    elsif op = 'HINCRBY' then
      if not (have and ctyp = 'hash') then cv := '{}'::jsonb; end if;
      f := c->>2; x := coalesce(nullif(cv->>f, '')::bigint, 0) + (c->>3)::bigint;
      cv := cv || jsonb_build_object(f, x::text);
      insert into kv(k, typ, v, exp) values (key, 'hash', cv, case when have then cexp else null end)
      on conflict (k) do update set typ = excluded.typ, v = excluded.v, exp = excluded.exp;
      res := to_jsonb(x);

    elsif op in ('LPUSH', 'RPUSH') then
      if not (have and ctyp = 'list') then cv := '[]'::jsonb; end if;
      for i in 2 .. jsonb_array_length(c) - 1 loop
        if op = 'LPUSH' then cv := jsonb_build_array(c->>i) || cv; else cv := cv || jsonb_build_array(c->>i); end if;
      end loop;
      insert into kv(k, typ, v, exp) values (key, 'list', cv, case when have then cexp else null end)
      on conflict (k) do update set typ = excluded.typ, v = excluded.v, exp = excluded.exp;
      res := to_jsonb(jsonb_array_length(cv));

    elsif op in ('LRANGE', 'LTRIM') then
      if have and ctyp = 'list' then len := jsonb_array_length(cv); else len := 0; cv := '[]'::jsonb; end if;
      s := (c->>2)::int; e := (c->>3)::int;
      if s < 0 then s := greatest(len + s, 0); end if;
      if e < 0 then e := len + e; end if;
      select coalesce(jsonb_agg(value order by ord), '[]'::jsonb) into res
        from jsonb_array_elements(cv) with ordinality as t(value, ord) where ord - 1 between s and e;
      if op = 'LTRIM' then
        if have then update kv set v = res where kv.k = key; end if;
        res := '"OK"'::jsonb;
      end if;

    elsif op = 'LLEN' then
      res := to_jsonb(case when have and ctyp = 'list' then jsonb_array_length(cv) else 0 end);

    else
      raise exception 'kv_exec: unsupported command %', op;
    end if;
    outp := outp || jsonb_build_array(res);
  end loop;
  return outp;
end $$;

revoke all on function public.kv_exec(jsonb) from public, anon, authenticated;
grant execute on function public.kv_exec(jsonb) to service_role;

notify pgrst, 'reload schema';   -- make the new function visible to the API at once

select 'Capstone database ready ✅' as status;
