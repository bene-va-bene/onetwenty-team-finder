-- Isolated fixtures, always rolled back. No email is sent.
begin;
select set_config('test.captain',gen_random_uuid()::text,true),set_config('test.rider',gen_random_uuid()::text,true),set_config('test.stranger',gen_random_uuid()::text,true),set_config('test.team',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,created_at) select current_setting('test.'||v)::uuid,v||'.'||current_setting('test.team')||'@example.invalid',now(),now() from unnest(array['captain','rider','stranger']) v;
update private.chat_email_settings set enabled=false;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.captain'),'role','authenticated')::text,true);
select public.save_listing(current_setting('test.team')::uuid,'{"type":"team","name":"Paddock fixture","region":"","description":"","languages":"","ridersNeeded":0,"seeking":"Anyone","categories":["Mixed"],"vibes":[],"looking":false}',0,true,true,false);
select public.save_listing(current_setting('test.other')::uuid,'{"type":"team","name":"Other fixture","region":"","description":"","languages":"","ridersNeeded":0,"seeking":"Anyone","categories":["Mixed"],"vibes":[],"looking":false}',0,true,true,false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.rider'),'role','authenticated')::text,true);
do $$ begin
 begin perform public.paddock_request(current_setting('test.team')::uuid,'Bene',false); raise exception 'FAIL missing consent'; exception when others then if sqlerrm not like 'Please agree%' then raise; end if; end;
end $$;
select public.paddock_request(current_setting('test.team')::uuid,'Bene',true);
select public.paddock_request(current_setting('test.team')::uuid,'Different name',true);
select set_config('test.profile',public.paddock_home()->'rider'->>'id',true);
do $$ begin
 if public.paddock_home()->'rider'->>'name'<>'Bene' then raise exception 'FAIL canonical profile'; end if;
 if public.paddock_join_status(current_setting('test.team')::uuid)->>'state'<>'pending' then raise exception 'FAIL pending'; end if;
 if jsonb_array_length(public.paddock_roster(current_setting('test.team')::uuid))<>0 then raise exception 'FAIL pending exposed'; end if;
 begin perform public.paddock_decide(current_setting('test.team')::uuid,current_setting('test.profile')::uuid,true); raise exception 'FAIL self approval'; exception when insufficient_privilege then null; end;
 begin perform * from private.team_members; raise exception 'FAIL private memberships'; exception when insufficient_privilege then null; end;
 begin perform public.save_listing(gen_random_uuid(),'{"type":"rider","name":"Duplicate"}',0,true,true,false); raise exception 'FAIL duplicate rider'; exception when others then if sqlerrm not like 'You already have%' then raise; end if; end;
end $$;
select public.paddock_request(current_setting('test.other')::uuid,'',false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.stranger'),'role','authenticated')::text,true);
do $$ begin
 if jsonb_array_length(public.paddock_home()->'requests')<>0 then raise exception 'FAIL foreign requests'; end if;
 begin perform public.paddock_decide(current_setting('test.team')::uuid,current_setting('test.profile')::uuid,true); raise exception 'FAIL stranger approval'; exception when insufficient_privilege then null; end;
 begin perform public.paddock_leave(current_setting('test.team')::uuid,current_setting('test.profile')::uuid); raise exception 'FAIL stranger removal'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.paddock_events set created_at=now()-interval '3 minutes' where team_id in(current_setting('test.team')::uuid,current_setting('test.other')::uuid);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare j jsonb; begin
 j:=public.chat_email_claim();
 if j is null or not (j->>'activity')::boolean or not public.chat_email_ready((j->>'id')::uuid) then raise exception 'FAIL team mail claim'; end if;
 perform public.chat_email_finish((j->>'id')::uuid,'sent');
 if public.chat_email_claim() is not null then raise exception 'FAIL duplicate notification'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.captain'),'role','authenticated')::text,true);
select public.paddock_decide(current_setting('test.team')::uuid,current_setting('test.profile')::uuid,true);
select public.paddock_decide(current_setting('test.team')::uuid,current_setting('test.profile')::uuid,true);
do $$ begin
 if jsonb_array_length(public.paddock_roster(current_setting('test.team')::uuid))<>1 then raise exception 'FAIL accepted roster'; end if;
 if public.paddock_rider_team(current_setting('test.profile')::uuid)->>'id'<>current_setting('test.team') then raise exception 'FAIL rider team'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.rider'),'role','authenticated')::text,true);
do $$ declare r jsonb; begin
 if public.paddock_join_status(current_setting('test.other')::uuid)->>'state'<>'cancelled' then raise exception 'FAIL other pending'; end if;
 begin perform public.paddock_request(current_setting('test.other')::uuid,'',false); raise exception 'FAIL second team'; exception when others then if sqlerrm not like 'You are already%' then raise; end if; end;
 r:=public.paddock_home()->'rider';
 if (r->>'looking')::boolean then raise exception 'FAIL search status'; end if;
 perform public.paddock_feature((r->>'id')::uuid,true);
 perform public.set_listing_status((r->>'id')::uuid,'closed',(r->>'revision')::int);
 if jsonb_array_length(public.paddock_roster(current_setting('test.team')::uuid))<>0 then raise exception 'FAIL hidden roster'; end if;
 if (public.paddock_home()->'features'->0->>'allowed')::boolean then raise exception 'FAIL hidden permission'; end if;
 perform public.paddock_leave(current_setting('test.team')::uuid,(r->>'id')::uuid);
 if public.paddock_home()->'membership'<>'null'::jsonb then raise exception 'FAIL leave'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if public.paddock_list('team','Paddock fixture')->>'total'<>'1' then raise exception 'FAIL complete hidden'; end if;
 if public.paddock_list('team','Paddock fixture',true)->>'total'<>'0' then raise exception 'FAIL search filter'; end if;
 if public.paddock_list('team','Paddock fixture')::text like '%owner_id%' then raise exception 'FAIL owner leak'; end if;
 begin perform public.paddock_home(); raise exception 'FAIL anon home'; exception when insufficient_privilege then null; end;
 begin perform public.paddock_request(current_setting('test.team')::uuid,'Anon',true); raise exception 'FAIL anon join'; exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from private.listings where id=current_setting('test.team')::uuid;
do $$ begin
 if exists(select 1 from private.team_members where team_id=current_setting('test.team')::uuid) or exists(select 1 from private.paddock_events where team_id=current_setting('test.team')::uuid) then raise exception 'FAIL cascade'; end if;
end $$;
rollback;
select 'PASS canonical profile, consent, complete teams, captain approval, access controls, single membership, mail grouping, privacy and cascade' as result;
