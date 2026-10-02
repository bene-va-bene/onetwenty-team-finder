-- Synthetic fixtures only. Roll back every change; no mail worker is invoked.
begin;
select set_config('test.captain',gen_random_uuid()::text,true),set_config('test.team',gen_random_uuid()::text,true),set_config('test.looking_team',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,created_at) values(current_setting('test.captain')::uuid,current_setting('test.team')||'@example.invalid',now(),now());
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.captain'),'role','authenticated')::text,true);
select public.save_listing(current_setting('test.team')::uuid,'{"type":"team","name":"Optional signal fixture","region":"","description":"","languages":"","categories":["Mixed"],"vibes":[]}',0,true,true,false);
select public.save_listing(current_setting('test.looking_team')::uuid,'{"type":"team","name":"Active signal fixture","region":"","description":"","languages":"","categories":["Mixed"],"vibes":[],"seeking":"Women"}',0,true,true,false);
do $$ declare t jsonb; begin
 t:=public.public_listing(current_setting('test.team')::uuid);
 if (t->>'looking')::boolean or t->>'seeking' is not null or t->>'ridersNeeded' is not null then raise exception 'FAIL absent signal'; end if;
 t:=public.public_listing(current_setting('test.looking_team')::uuid);
 if not (t->>'looking')::boolean or t->>'seeking'<>'Women' or t->>'ridersNeeded' is not null then raise exception 'FAIL optional count'; end if;
 begin perform public.paddock_search(current_setting('test.team')::uuid,true,1); raise exception 'FAIL obsolete team toggle'; exception when others then if sqlerrm not like 'Edit your team%' then raise; end if; end;
 perform public.save_listing(current_setting('test.looking_team')::uuid,'{"type":"team","name":"Active signal fixture","region":"","description":"","languages":"","categories":["Mixed"],"vibes":[],"seeking":"Anyone","ridersNeeded":5}',1,true,true,false);
 -- Clearing a selection also clears its old count, even if a stale client sends it.
 t:=public.save_listing(current_setting('test.looking_team')::uuid,'{"type":"team","name":"Active signal fixture","region":"","description":"","languages":"","categories":["Mixed"],"vibes":[],"seeking":"","ridersNeeded":5}',2,true,true,false);
 if (t->>'looking')::boolean or t->>'seeking' is not null or t->>'ridersNeeded' is not null then raise exception 'FAIL cleared signal'; end if;
 -- Older clients explicitly turning looking off must not leave a signal behind.
 t:=public.save_listing(current_setting('test.looking_team')::uuid,'{"type":"team","name":"Active signal fixture","region":"","description":"","languages":"","categories":["Mixed"],"vibes":[],"looking":false,"seeking":"Anyone","ridersNeeded":0}',3,true,true,false);
 if (t->>'looking')::boolean or t->>'seeking' is not null then raise exception 'FAIL legacy off'; end if;
end $$;
reset role;
do $$ declare u uuid; r uuid; i integer; begin
 for i in 1..7 loop
  u:=gen_random_uuid();
  insert into auth.users(id,email,email_confirmed_at,created_at) values(u,u||'@example.invalid',now(),now());
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  perform public.paddock_request(current_setting('test.team')::uuid,'Fixture rider '||i,true);
  r:=(public.paddock_home()->'rider'->>'id')::uuid;
  if i=1 then
   if public.send_chat(current_setting('test.team')::uuid,gen_random_uuid(),'Initiative request','Fixture rider') is null then raise exception 'FAIL initiative contact'; end if;
  end if;
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('test.captain'),'role','authenticated')::text,true);
  perform public.paddock_decide(current_setting('test.team')::uuid,r,true);
 end loop;
 if jsonb_array_length(public.paddock_roster(current_setting('test.team')::uuid))<>7 then raise exception 'FAIL unrestricted roster'; end if;
 if (public.public_listing(current_setting('test.team')::uuid)->>'looking')::boolean then raise exception 'FAIL membership changes signal'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if public.paddock_list('team','Optional signal fixture')->>'total'<>'1' then raise exception 'FAIL public team'; end if;
 if public.paddock_list('team','Optional signal fixture',true)->>'total'<>'0' then raise exception 'FAIL looking filter'; end if;
end $$;
rollback;
select 'PASS optional/cleared signals, compatibility, initiative contact, seven accepted members and filters' as result;
