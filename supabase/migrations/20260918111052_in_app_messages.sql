-- Private, listing-scoped conversations. No email addresses are returned.
create table private.conversations (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references private.listings(id) on delete cascade,
 starter_id uuid not null references auth.users(id) on delete cascade,
 starter_name text not null check(length(trim(starter_name)) between 1 and 60),
 owner_seen bigint not null default 0,
 starter_seen bigint not null default 0,
 owner_blocked boolean not null default false,
 starter_blocked boolean not null default false,
 updated_at timestamptz not null default now(),
 unique(listing_id,starter_id)
);
create index conversations_starter on private.conversations(starter_id);
create table private.chat_messages (
 id bigint generated always as identity primary key,
 conversation_id uuid not null references private.conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 body text not null check(length(trim(body)) between 1 and 1500),
 created_at timestamptz not null default now(),
 unique(sender_id,request_id)
);
create index chat_messages_thread on private.chat_messages(conversation_id,id desc);
create index chat_messages_rate on private.chat_messages(sender_id,created_at);
alter table private.conversations enable row level security;
alter table private.chat_messages enable row level security;
revoke all on private.conversations,private.chat_messages from public,anon,authenticated;

create function private.send_chat(p_listing uuid,p_request uuid,p_body text,p_name text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); l private.listings; c private.conversations; m private.chat_messages;
begin
 -- Serialize each sender, including requests to different conversations.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 perform private.require_user();
 if p_request is null or p_body is null or length(trim(p_body)) not between 1 and 1500 then raise exception 'Write a message of 1–1500 characters.'; end if;
 select * into l from private.listings where id=p_listing and expires_at>now() for share;
 if not found then raise exception 'This listing is no longer available.'; end if;
 if l.owner_id=uid then raise exception 'Open the conversation in Messages to reply.'; end if;
 select * into c from private.conversations where listing_id=l.id and starter_id=uid for update;
 if not found then
  if l.status<>'active' then raise exception 'This listing is no longer available.'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 60 then raise exception 'Enter your name (1–60 characters).'; end if;
  if (select count(*) from private.conversations where starter_id=uid and updated_at>now()-interval '1 day')>=20 then raise exception 'Too many new conversations. Please try tomorrow.'; end if;
  insert into private.conversations(listing_id,starter_id,starter_name) values(l.id,uid,trim(p_name)) returning * into c;
 end if;
 -- The shared sender lock also makes retries with one request ID idempotent.
 select * into m from private.chat_messages where sender_id=uid and request_id=p_request;
 if found then
  if m.conversation_id<>c.id or m.body<>trim(p_body) then raise exception 'Invalid message request.'; end if;
  return c.id;
 end if;
 if c.owner_blocked or c.starter_blocked then raise exception 'Messaging is paused in this conversation.'; end if;
 if not exists(select 1 from auth.users where id=l.owner_id and email_confirmed_at is not null and (banned_until is null or banned_until<now())) then raise exception 'This conversation is unavailable.'; end if;
 if (select count(*) from private.chat_messages where sender_id=uid and created_at>now()-interval '1 minute')>=10 or (select count(*) from private.chat_messages where sender_id=uid and created_at>now()-interval '1 day')>=200 then raise exception 'Too many messages. Please try again later.'; end if;
 insert into private.chat_messages(conversation_id,sender_id,request_id,body) values(c.id,uid,p_request,trim(p_body));
 update private.conversations set updated_at=now() where id=c.id;
 return c.id;
end $$;

create function private.reply_chat(p_thread uuid,p_request uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); c private.conversations; l private.listings; m private.chat_messages; peer uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 perform private.require_user();
 if p_request is null or p_body is null or length(trim(p_body)) not between 1 and 1500 then raise exception 'Write a message of 1–1500 characters.'; end if;
 select l0.* into l from private.listings l0 join private.conversations c0 on c0.listing_id=l0.id where c0.id=p_thread and uid in (l0.owner_id,c0.starter_id) and l0.expires_at>now() for share of l0;
 if not found then raise exception 'This conversation is unavailable.' using errcode='42501'; end if;
 select * into c from private.conversations where id=p_thread for update;
 if not found then raise exception 'This conversation is unavailable.' using errcode='42501'; end if;
 select * into m from private.chat_messages where sender_id=uid and request_id=p_request;
 if found then
  if m.conversation_id<>c.id or m.body<>trim(p_body) then raise exception 'Invalid message request.'; end if;
  return;
 end if;
 if c.owner_blocked or c.starter_blocked then raise exception 'Messaging is paused in this conversation.'; end if;
 peer:=case when uid=c.starter_id then l.owner_id else c.starter_id end;
 if not exists(select 1 from auth.users where id=peer and email_confirmed_at is not null and (banned_until is null or banned_until<now())) then raise exception 'This conversation is unavailable.'; end if;
 if (select count(*) from private.chat_messages where sender_id=uid and created_at>now()-interval '1 minute')>=10 or (select count(*) from private.chat_messages where sender_id=uid and created_at>now()-interval '1 day')>=200 then raise exception 'Too many messages. Please try again later.'; end if;
 insert into private.chat_messages(conversation_id,sender_id,request_id,body) values(c.id,uid,p_request,trim(p_body));
 update private.conversations set updated_at=now() where id=c.id;
end $$;

create function private.chat_inbox(p_offset integer default 0,p_thread uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=private.require_user();
begin
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.updated_at desc,t.id) from (
 select c.id,l.name as listing_name,case when uid=c.starter_id then l.name else c.starter_name end as peer_name,
 c.updated_at,l.expires_at,c.owner_blocked or c.starter_blocked as blocked,
 case when uid=c.starter_id then c.starter_blocked else c.owner_blocked end as blocked_by_me,
 (select count(*) from private.chat_messages m where m.conversation_id=c.id and m.sender_id<>uid and m.id>case when uid=c.starter_id then c.starter_seen else c.owner_seen end) as unread
 from private.conversations c join private.listings l on l.id=c.listing_id
 where uid in (c.starter_id,l.owner_id) and l.expires_at>now() and (p_thread is null or c.id=p_thread)
 order by c.updated_at desc,c.id limit 30 offset greatest(0,least(coalesce(p_offset,0),10000))
 ) t),'[]');
end $$;
create function private.chat_unread() returns bigint
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=private.require_user(); n bigint;
begin
 select count(*) into n from private.chat_messages m join private.conversations c on c.id=m.conversation_id join private.listings l on l.id=c.listing_id
 where uid in (c.starter_id,l.owner_id) and l.expires_at>now() and m.sender_id<>uid and m.id>case when uid=c.starter_id then c.starter_seen else c.owner_seen end;
 return n;
end $$;
create function private.read_chat(p_thread uuid,p_before bigint default null,p_after bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=private.require_user();
begin
 if not exists(select 1 from private.conversations c join private.listings l on l.id=c.listing_id where c.id=p_thread and uid in (c.starter_id,l.owner_id) and l.expires_at>now()) then raise exception 'This conversation is unavailable.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (
 select m.id,m.body,m.created_at,m.sender_id=uid as mine from private.chat_messages m where m.conversation_id=p_thread and (p_before is null or m.id<p_before) and (p_after is null or m.id>p_after) order by case when p_after is not null then m.id end asc, m.id desc limit 50
 ) t),'[]');
end $$;
create function private.seen_chat(p_thread uuid,p_seen bigint) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); c private.conversations; owner uuid;
begin
 select c0.* into c from private.conversations c0 join private.listings l on l.id=c0.listing_id where c0.id=p_thread and uid in (c0.starter_id,l.owner_id) and l.expires_at>now() for update of c0;
 if not found then raise exception 'This conversation is unavailable.' using errcode='42501'; end if;
 if not exists(select 1 from private.chat_messages where conversation_id=c.id and id=p_seen) then return; end if;
 update private.conversations set starter_seen=case when uid=starter_id then greatest(starter_seen,p_seen) else starter_seen end,owner_seen=case when uid<>starter_id then greatest(owner_seen,p_seen) else owner_seen end where id=c.id;
end $$;
create function private.block_chat(p_thread uuid,p_block boolean) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user();
begin
 update private.conversations c set starter_blocked=case when uid=c.starter_id then coalesce(p_block,false) else c.starter_blocked end,owner_blocked=case when uid<>c.starter_id then coalesce(p_block,false) else c.owner_blocked end
 from private.listings l where l.id=c.listing_id and c.id=p_thread and uid in (c.starter_id,l.owner_id) and l.expires_at>now();
 if not found then raise exception 'This conversation is unavailable.' using errcode='42501'; end if;
end $$;

create function public.send_chat(p_listing uuid,p_request uuid,p_body text,p_name text default '') returns uuid language sql security invoker set search_path='' as $$ select private.send_chat(p_listing,p_request,p_body,p_name); $$;
revoke all on function private.send_chat(uuid,uuid,text,text),public.send_chat(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.send_chat(uuid,uuid,text,text),public.send_chat(uuid,uuid,text,text) to authenticated;

create function public.reply_chat(p_thread uuid,p_request uuid,p_body text) returns void language sql security invoker set search_path='' as $$ select private.reply_chat(p_thread,p_request,p_body); $$;
revoke all on function private.reply_chat(uuid,uuid,text),public.reply_chat(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.reply_chat(uuid,uuid,text),public.reply_chat(uuid,uuid,text) to authenticated;

create function public.chat_inbox(p_offset integer default 0,p_thread uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.chat_inbox(p_offset,p_thread); $$;
revoke all on function private.chat_inbox(integer,uuid),public.chat_inbox(integer,uuid) from public,anon,authenticated;
grant execute on function private.chat_inbox(integer,uuid),public.chat_inbox(integer,uuid) to authenticated;

create function public.chat_unread() returns bigint language sql security invoker set search_path='' as $$ select private.chat_unread(); $$;
revoke all on function private.chat_unread(),public.chat_unread() from public,anon,authenticated;
grant execute on function private.chat_unread(),public.chat_unread() to authenticated;

create function public.read_chat(p_thread uuid,p_before bigint default null,p_after bigint default null) returns jsonb language sql security invoker set search_path='' as $$ select private.read_chat(p_thread,p_before,p_after); $$;
revoke all on function private.read_chat(uuid,bigint,bigint),public.read_chat(uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function private.read_chat(uuid,bigint,bigint),public.read_chat(uuid,bigint,bigint) to authenticated;

create function public.seen_chat(p_thread uuid,p_seen bigint) returns void language sql security invoker set search_path='' as $$ select private.seen_chat(p_thread,p_seen); $$;
revoke all on function private.seen_chat(uuid,bigint),public.seen_chat(uuid,bigint) from public,anon,authenticated;
grant execute on function private.seen_chat(uuid,bigint),public.seen_chat(uuid,bigint) to authenticated;

create function public.block_chat(p_thread uuid,p_block boolean) returns void language sql security invoker set search_path='' as $$ select private.block_chat(p_thread,p_block); $$;
revoke all on function private.block_chat(uuid,boolean),public.block_chat(uuid,boolean) from public,anon,authenticated;
grant execute on function private.block_chat(uuid,boolean),public.block_chat(uuid,boolean) to authenticated;

-- Preserve accounts that still participate in a conversation.
create or replace function private.purge_listing(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 perform private.require_worker();
 select owner_id into uid from private.listings where id=p_id and expires_at<=now();
 if not found then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 perform 1 from private.listings where id=p_id for update;
 if exists(select 1 from storage.objects where bucket_id='listing-photos' and split_part(name,'/',1)=p_id::text) then raise exception 'Storage cleanup incomplete'; end if;
 delete from private.listings where id=p_id and expires_at<=now();
 if not exists(select 1 from private.listings where owner_id=uid) and not exists(select 1 from private.mail_jobs where sender_id=uid) and not exists(select 1 from private.conversations where starter_id=uid) then
  insert into private.account_cleanup values(uid) on conflict do nothing;
 end if;
end $$;
create or replace function private.cleanup_accounts() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 perform private.require_worker();
 for uid in select u.id from auth.users u where u.created_at<now()-interval '10 months' and not exists(select 1 from private.listings l where l.owner_id=u.id) and not exists(select 1 from private.mail_jobs j where j.sender_id=u.id) and not exists(select 1 from private.conversations c where c.starter_id=u.id) limit 100 loop
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if not exists(select 1 from private.listings where owner_id=uid) and not exists(select 1 from private.mail_jobs where sender_id=uid) and not exists(select 1 from private.conversations where starter_id=uid) then insert into private.account_cleanup values(uid) on conflict do nothing; end if;
 end loop;
 return coalesce((select jsonb_agg(user_id) from private.account_cleanup),'[]');
end $$;

-- Cut over contact delivery. Existing email replies cannot be imported into chats.
create or replace function private.enqueue_contact(p_listing uuid,p_request uuid,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_user();
 raise exception 'Messages have moved into the app. Please refresh the Team Finder.';
end $$;
-- Do not discard a queued message or switch channels while delivery is in flight.
lock table private.mail_jobs in share row exclusive mode;
do $$ begin
 if exists(select 1 from private.mail_jobs where kind='contact' and state in ('pending','failed','sending')) then
  raise exception 'Contact mail is still queued or in flight. Complete delivery before switching channels.';
 end if;
end $$;

-- Maintenance only claims reminder emails after cutover.
create or replace function private.mail_claim(p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.mail_jobs; l private.listings; recipient text; sender text;
begin
 perform private.require_worker();
 update private.mail_jobs mj set state='cancelled',body=null where state in ('pending','failed') and exists(select 1 from private.listings lst where lst.id=mj.listing_id and (lst.status<>'active' or lst.expires_at<=now()));
 select * into j from private.mail_jobs where kind='reminder' and (p_id is null or id=p_id) and state in ('pending','failed') and attempts<3 and retry_at<=now() and expires_at>now()
 order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 select * into l from private.listings where id=j.listing_id;
 select email into recipient from auth.users where id=l.owner_id and email_confirmed_at is not null and (banned_until is null or banned_until<now());
 if j.sender_id is not null then select email into sender from auth.users where id=j.sender_id and email_confirmed_at is not null and (banned_until is null or banned_until<now()); end if;
 if l.status<>'active' or l.expires_at<=now() or recipient is null or (j.kind='contact' and sender is null) then
  update private.mail_jobs set state='cancelled',body=null where id=j.id; return null;
 end if;
 update private.mail_jobs set state='sending',attempts=attempts+1,attempted_at=now() where id=j.id;
 return jsonb_build_object('id',j.id,'kind',j.kind,'listing_id',l.id,'name',l.name,'to',recipient,'replyTo',sender,'body',j.body,'published_at',l.published_at,'expires_at',l.expires_at);
end $$;
