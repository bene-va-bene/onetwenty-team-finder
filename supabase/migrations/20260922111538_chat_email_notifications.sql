-- Only messages created after rollout are queued. Message content never enters email jobs.
create table private.chat_email_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 last_sent_at timestamptz,
 claim uuid,
 claimed_at timestamptz,
 attempts integer not null default 0,
 retry_at timestamptz not null default now()
);
create table private.chat_email_queue (
 message_id bigint primary key references private.chat_messages(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 claim uuid
);
create index chat_email_queue_recipient on private.chat_email_queue(recipient_id);
alter table private.chat_email_settings enable row level security;
alter table private.chat_email_queue enable row level security;
revoke all on private.chat_email_settings,private.chat_email_queue from public,anon,authenticated;

create function private.queue_chat_email() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 select case when new.sender_id=l.owner_id then c.starter_id else l.owner_id end into recipient
 from private.conversations c join private.listings l on l.id=c.listing_id where c.id=new.conversation_id;
 insert into private.chat_email_settings(user_id) values(recipient) on conflict do nothing;
 insert into private.chat_email_queue(message_id,recipient_id) values(new.id,recipient);
 return new;
end $$;
revoke all on function private.queue_chat_email() from public,anon,authenticated;
create trigger queue_chat_email after insert on private.chat_messages for each row execute function private.queue_chat_email();

create function private.chat_email_preference(p_enabled boolean default null) returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); result boolean;
begin
 insert into private.chat_email_settings(user_id) values(uid) on conflict do nothing;
 if p_enabled is not null then
  update private.chat_email_settings set enabled=p_enabled where user_id=uid;
  -- No backlog on re-enabling. Already-in-flight delivery may finish.
  delete from private.chat_email_queue where recipient_id=uid and claim is null;
 end if;
 select enabled into result from private.chat_email_settings where user_id=uid;
 return result;
end $$;
create function public.chat_email_preference(p_enabled boolean default null) returns boolean language sql security invoker set search_path='' as $$ select private.chat_email_preference(p_enabled) $$;
revoke all on function private.chat_email_preference(boolean),public.chat_email_preference(boolean) from public,anon,authenticated;
grant execute on function private.chat_email_preference(boolean),public.chat_email_preference(boolean) to authenticated;

create function private.chat_email_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.chat_email_settings; token uuid; address text;
begin
 perform private.require_worker();
 -- A worker lost after SMTP might have delivered. Consume its batch instead of duplicating it.
 for s in select * from private.chat_email_settings where claim is not null and claimed_at<now()-interval '15 minutes' for update skip locked loop
  delete from private.chat_email_queue where claim=s.claim;
  update private.chat_email_settings set claim=null,claimed_at=null,last_sent_at=now(),attempts=0 where user_id=s.user_id;
 end loop;
 delete from private.chat_email_queue q using private.chat_email_settings st,private.chat_messages m,private.conversations c,private.listings l,auth.users u
 where q.claim is null and st.user_id=q.recipient_id and m.id=q.message_id and c.id=m.conversation_id and l.id=c.listing_id and u.id=q.recipient_id
 and (not st.enabled or c.owner_blocked or c.starter_blocked or l.expires_at<=now() or u.email_confirmed_at is null or u.email is null or u.banned_until>now()
 or m.id<=case when q.recipient_id=l.owner_id then c.owner_seen else c.starter_seen end);
 select st.* into s from private.chat_email_settings st
 where st.enabled and st.claim is null and st.retry_at<=now() and (st.last_sent_at is null or st.last_sent_at<=now()-interval '30 minutes')
 and exists(select 1 from private.chat_email_queue q join private.chat_messages m on m.id=q.message_id where q.recipient_id=st.user_id and q.claim is null and m.created_at<=now()-interval '2 minutes')
 order by st.retry_at,st.user_id limit 1 for update skip locked;
 if not found then return null; end if;
 token:=gen_random_uuid();
 update private.chat_email_queue q set claim=token from private.chat_messages m where q.recipient_id=s.user_id and q.claim is null and m.id=q.message_id and m.created_at<=now()-interval '2 minutes';
 update private.chat_email_settings set claim=token,claimed_at=now(),attempts=attempts+1 where user_id=s.user_id;
 select email into address from auth.users where id=s.user_id;
 return jsonb_build_object('id',token,'to',address);
end $$;

-- Final eligibility check immediately before SMTP (reads/blocks/opt-out after claiming).
create function private.chat_email_ready(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform private.require_worker();
 return exists(select 1 from private.chat_email_settings s join auth.users u on u.id=s.user_id
 join private.chat_email_queue q on q.recipient_id=s.user_id and q.claim=s.claim
 join private.chat_messages m on m.id=q.message_id join private.conversations c on c.id=m.conversation_id join private.listings l on l.id=c.listing_id
 where s.claim=p_id and s.enabled and s.claimed_at>now()-interval '15 minutes' and u.email_confirmed_at is not null and u.email is not null and (u.banned_until is null or u.banned_until<=now())
 and not c.owner_blocked and not c.starter_blocked and l.expires_at>now() and m.id>case when s.user_id=l.owner_id then c.owner_seen else c.starter_seen end);
end $$;
create function private.chat_email_finish(p_id uuid,p_state text) returns void language plpgsql security definer set search_path='' as $$
declare s private.chat_email_settings;
begin
 perform private.require_worker();
 if p_state not in ('sent','failed','uncertain','skipped') then raise exception 'Invalid delivery state'; end if;
 select * into s from private.chat_email_settings where claim=p_id for update;
 if not found then return; end if;
 if p_state='failed' and s.attempts<3 and s.enabled then
  update private.chat_email_queue set claim=null where claim=p_id;
  update private.chat_email_settings set claim=null,claimed_at=null,retry_at=now()+interval '5 minutes'*s.attempts where user_id=s.user_id;
 else
  delete from private.chat_email_queue where claim=p_id;
  update private.chat_email_settings set claim=null,claimed_at=null,attempts=0,retry_at=now(),last_sent_at=case when p_state in ('sent','uncertain') then now() else last_sent_at end where user_id=s.user_id;
 end if;
end $$;
create function public.chat_email_claim() returns jsonb language sql security invoker set search_path='' as $$ select private.chat_email_claim() $$;
create function public.chat_email_ready(p_id uuid) returns boolean language sql security invoker set search_path='' as $$ select private.chat_email_ready(p_id) $$;
create function public.chat_email_finish(p_id uuid,p_state text) returns void language sql security invoker set search_path='' as $$ select private.chat_email_finish(p_id,p_state) $$;
revoke all on function private.chat_email_claim(),public.chat_email_claim(),private.chat_email_ready(uuid),public.chat_email_ready(uuid),private.chat_email_finish(uuid,text),public.chat_email_finish(uuid,text) from public,anon,authenticated;
grant execute on function private.chat_email_claim(),public.chat_email_claim(),private.chat_email_ready(uuid),public.chat_email_ready(uuid),private.chat_email_finish(uuid,text),public.chat_email_finish(uuid,text) to service_role;
