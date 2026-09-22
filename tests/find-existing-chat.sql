-- Run in a rollback-only transaction, after the messaging migration.
begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.sender',gen_random_uuid()::text,true),set_config('test.stranger',gen_random_uuid()::text,true),set_config('test.listing',gen_random_uuid()::text,true),set_config('test.request',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,created_at) select current_setting('test.'||v)::uuid,v||'.'||current_setting('test.listing')||'@example.invalid',now(),now()-interval '11 months' from unnest(array['owner','sender','stranger']) v;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
select public.save_listing(current_setting('test.listing')::uuid,'{"type":"rider","name":"Chat fixture","region":"Test","description":"Test","languages":"EN","riderGender":"Woman","categories":["Mixed"],"vibes":["Let’s shred"]}',0,true,true,false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.sender'),'role','authenticated')::text,true);
select set_config('test.thread',public.send_chat(current_setting('test.listing')::uuid,current_setting('test.request')::uuid,'Hello','Rider without a listing')::text,true);

do $$ begin
 if public.find_existing_chat(current_setting('test.listing')::uuid) is distinct from current_setting('test.thread')::uuid then raise exception 'FAIL existing conversation'; end if;
 if public.find_existing_chat(gen_random_uuid()) is not null then raise exception 'FAIL missing listing'; end if;
 -- An attempted second name must not rename or duplicate an existing conversation.
 if public.send_chat(current_setting('test.listing')::uuid,gen_random_uuid(),'Second message','Different name')<>current_setting('test.thread')::uuid then raise exception 'FAIL duplicate thread'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.stranger'),'role','authenticated')::text,true);
do $$ begin if public.find_existing_chat(current_setting('test.listing')::uuid) is not null then raise exception 'FAIL stranger leak'; end if; end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
do $$ begin
 if public.find_existing_chat(current_setting('test.listing')::uuid) is not null then raise exception 'FAIL owner ambiguous lookup'; end if;
 if public.chat_inbox()->0->>'peer_name'<>'Rider without a listing' then raise exception 'FAIL original name changed'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 begin perform public.find_existing_chat(current_setting('test.listing')::uuid); raise exception 'FAIL anonymous access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.listings set expires_at=now()-interval '1 minute' where id=current_setting('test.listing')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.sender'),'role','authenticated')::text,true);
do $$ begin if public.find_existing_chat(current_setting('test.listing')::uuid) is not null then raise exception 'FAIL expired'; end if; end $$;
rollback;
select 'Existing-chat lookup and name preservation passed; fixtures rolled back' as result;
