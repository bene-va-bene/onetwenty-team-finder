-- No email is copied out of auth.users. All ownership and consent data stays private.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create table private.listings (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('rider','team')),
  name text not null check (length(trim(name)) between 1 and 60),
  region text not null check (length(trim(region)) between 1 and 100),
  description text not null check (length(trim(description)) between 1 and 700),
  languages text not null check (length(trim(languages)) between 1 and 100),
  age integer check (age between 16 and 99),
  "ridersNeeded" integer check ("ridersNeeded" between 1 and 5),
  "riderGender" text,
  seeking text,
  categories text[] not null check (cardinality(categories) between 1 and 2 and categories <@ array['Men','Women','Mixed']),
  vibes text[] not null check (cardinality(vibes) between 1 and 5 and vibes <@ array['Just for the views','Good times, good pace','Sporty but social','Let’s shred','Race to win']),
  strava text not null default '' check (length(strava) <= 500 and (strava = '' or strava ~ '^https://(www\.)?strava\.com/')),
  instagram text not null default '' check (length(instagram) <= 500 and (instagram = '' or instagram ~ '^https://(www\.)?instagram\.com/')),
  image_path text check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  status text not null default 'draft' check (status in ('draft','active','closed')),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz,
  check (coalesce((type = 'team' and age is null and "riderGender" is null and "ridersNeeded" is not null and cardinality(categories) = 1 and seeking in ('Anyone','Women','Men') and (categories = array['Mixed'] or seeking = categories[1]))
    or (type = 'rider' and "ridersNeeded" is null and seeking is null and "riderGender" in ('Woman','Man') and categories <@ case when "riderGender" = 'Woman' then array['Women','Mixed'] else array['Men','Mixed'] end),false))
);
create index listings_owner on private.listings(owner_id);
create index listings_public on private.listings(published_at desc) where status = 'active';
alter table private.listings enable row level security;
create policy owner_rows on private.listings to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on private.listings from anon, authenticated;

create table private.consents (
  id bigint generated always as identity primary key,
  listing_id uuid not null references private.listings(id) on delete cascade,
  version text not null,
  text text not null,
  photo_consent boolean not null,
  recorded_at timestamptz not null default now()
);
create index consents_listing on private.consents(listing_id);
alter table private.consents enable row level security;
revoke all on private.consents from anon, authenticated;

-- Privileged implementations are confined to a non-exposed schema. Public wrappers
-- are SECURITY INVOKER. Explicit authentication/ownership checks precede every write.
create function private.require_user() returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from auth.users where id = uid and email_confirmed_at is not null and coalesce(is_anonymous,false) = false) then
    raise exception 'Please confirm your email and sign in again.' using errcode = '42501';
  end if;
  return uid;
end $$;

create function private.read_listings(p_mine boolean, p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_mine then perform private.require_user(); end if;
  return coalesce((select jsonb_agg(to_jsonb(l) - 'owner_id' order by l.created_at desc) from private.listings l
    where (p_id is null or l.id = p_id) and
    (case when p_mine then l.owner_id = auth.uid() else l.status = 'active' and l.expires_at > now() end)), '[]'::jsonb);
end $$;

create function private.owns_listing(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.listings where id = p_id and owner_id = auth.uid());
$$;
create function private.can_read_photo(p_path text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.listings where (image_path = p_path and status = 'active' and expires_at > now())
    or (id::text = split_part(p_path,'/',1) and owner_id = auth.uid()));
$$;

create function private.save_listing(p_id uuid, p_data jsonb, p_revision integer, p_publish boolean, p_consent boolean, p_photo_consent boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user(); old private.listings; saved private.listings; first_publish timestamptz; photo text;
begin
  if p_id is null or p_revision is null or p_publish is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid listing request.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into old from private.listings where id = p_id for update;
  if found then
    if old.owner_id <> uid then raise exception 'Listing not found.' using errcode='42501'; end if;
    if old.revision <> p_revision then raise exception 'This listing changed in another window. Reload My listings and try again.'; end if;
    if not p_publish and old.status <> 'draft' then raise exception 'Please preview and confirm publication before saving.'; end if;
    if old.expires_at <= now() then raise exception 'This listing has reached its ten-month limit. Please create a new listing.'; end if;
  else
    if p_revision <> 0 then raise exception 'Listing not found.'; end if;
    if (select count(*) from private.listings where owner_id = uid) >= 3 then raise exception 'You can keep up to three listings. Please delete an old one first.'; end if;
  end if;
  if p_publish and not coalesce(p_consent,false) then raise exception 'Please agree to publication.'; end if;
  photo := nullif(p_data->>'image_path','');
  if photo is not null then
    if split_part(photo,'/',1) <> p_id::text or not exists(select 1 from storage.objects where bucket_id='listing-photos' and name=photo) then raise exception 'Photo not found. Please choose it again.'; end if;
    if p_publish and not coalesce(p_photo_consent,false) then raise exception 'Please confirm that you may publish the photo.'; end if;
  end if;
  first_publish := coalesce(old.published_at, case when p_publish then now() end);
  insert into private.listings (id,owner_id,type,name,region,description,languages,age,"ridersNeeded","riderGender",seeking,categories,vibes,strava,instagram,image_path,status,revision,published_at,expires_at)
  values (p_id,uid,p_data->>'type',trim(p_data->>'name'),trim(p_data->>'region'),trim(p_data->>'description'),trim(p_data->>'languages'),
    case when p_data->>'type'='rider' then nullif(p_data->>'age','')::integer end,
    case when p_data->>'type'='team' then (p_data->>'ridersNeeded')::integer end,
    case when p_data->>'type'='rider' then p_data->>'riderGender' end,
    case when p_data->>'type'='team' then p_data->>'seeking' end,
    array(select distinct jsonb_array_elements_text(p_data->'categories')),
    array(select distinct jsonb_array_elements_text(p_data->'vibes')),
    coalesce(p_data->>'strava',''),coalesce(p_data->>'instagram',''),photo,
    case when p_publish then 'active' else coalesce(old.status,'draft') end,coalesce(old.revision,0)+1,first_publish,
    coalesce(old.expires_at, (first_publish at time zone 'UTC' + interval '10 months') at time zone 'UTC'))
  on conflict(id) do update set type=excluded.type,name=excluded.name,region=excluded.region,description=excluded.description,languages=excluded.languages,
    age=excluded.age,"ridersNeeded"=excluded."ridersNeeded","riderGender"=excluded."riderGender",seeking=excluded.seeking,categories=excluded.categories,vibes=excluded.vibes,
    strava=excluded.strava,instagram=excluded.instagram,image_path=excluded.image_path,status=excluded.status,revision=excluded.revision,
    published_at=excluded.published_at,expires_at=excluded.expires_at,updated_at=now()
  returning * into saved;
  if p_publish then
    insert into private.consents(listing_id,version,text,photo_consent) values(p_id,'2026-09-17-v1',
      'I agree that my selected profile information will be shown publicly in the Team Finder. If a photo is included, I confirm that I may use it and that it can be shown publicly.',photo is not null and p_photo_consent);
  end if;
  return to_jsonb(saved)-'owner_id';
end $$;

create function private.set_listing_status(p_id uuid,p_status text,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); saved private.listings;
begin
  if p_status is null or p_revision is null or p_status not in ('active','closed') then raise exception 'Invalid status.'; end if;
  select * into saved from private.listings where id=p_id and owner_id=uid for update;
  if not found then raise exception 'Listing not found.' using errcode='42501'; end if;
  if saved.revision<>p_revision then raise exception 'Listing changed. Reload My listings and try again.'; end if;
  if p_status='active' and (saved.published_at is null or saved.expires_at<=now()) then raise exception 'Use the form to publish a draft. Expired listings cannot be reopened.'; end if;
  update private.listings set status=p_status,revision=revision+1,updated_at=now() where id=p_id returning * into saved;
  return to_jsonb(saved)-'owner_id';
end $$;
create function private.delete_listing(p_id uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); saved private.listings;
begin
  select * into saved from private.listings where id=p_id and owner_id=uid for update;
  if not found then raise exception 'Listing not found.' using errcode='42501'; end if;
  if p_revision is null or saved.revision<>p_revision or saved.status<>'closed' then raise exception 'Close and reload the listing before deleting.'; end if;
  if exists(select 1 from storage.objects where bucket_id='listing-photos' and split_part(name,'/',1)=p_id::text) then raise exception 'Photo cleanup is incomplete. Please retry deletion.'; end if;
  delete from private.listings where id=p_id;
end $$;

create function public.list_public_listings() returns jsonb language sql stable security invoker set search_path='' as $$ select private.read_listings(false); $$;
create function public.my_listings() returns jsonb language sql stable security invoker set search_path='' as $$ select private.read_listings(true); $$;
create function public.save_listing(p_id uuid,p_data jsonb,p_revision integer,p_publish boolean,p_consent boolean,p_photo_consent boolean) returns jsonb
 language sql security invoker set search_path='' as $$ select private.save_listing(p_id,p_data,p_revision,p_publish,p_consent,p_photo_consent); $$;
create function public.set_listing_status(p_id uuid,p_status text,p_revision integer) returns jsonb
 language sql security invoker set search_path='' as $$ select private.set_listing_status(p_id,p_status,p_revision); $$;
create function public.delete_listing(p_id uuid,p_revision integer) returns void
 language sql security invoker set search_path='' as $$ select private.delete_listing(p_id,p_revision); $$;
create function public.public_listing(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.read_listings(false,p_id)->0; $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.read_listings(boolean,uuid),private.can_read_photo(text) to anon,authenticated;
grant execute on function private.require_user(),private.owns_listing(uuid),private.save_listing(uuid,jsonb,integer,boolean,boolean,boolean),private.set_listing_status(uuid,text,integer),private.delete_listing(uuid,integer) to authenticated;
revoke all on function public.list_public_listings(),public.public_listing(uuid),public.my_listings(),public.save_listing(uuid,jsonb,integer,boolean,boolean,boolean),public.set_listing_status(uuid,text,integer),public.delete_listing(uuid,integer) from public,anon,authenticated;
grant execute on function public.list_public_listings(),public.public_listing(uuid) to anon,authenticated;
grant execute on function public.my_listings(),public.save_listing(uuid,jsonb,integer,boolean,boolean,boolean),public.set_listing_status(uuid,text,integer),public.delete_listing(uuid,integer) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('listing-photos','listing-photos',false,2097152,array['image/jpeg']);
create policy photo_read on storage.objects for select to anon,authenticated using(bucket_id='listing-photos' and private.can_read_photo(name));
create policy photo_insert on storage.objects for insert to authenticated with check(bucket_id='listing-photos' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and private.owns_listing((split_part(name,'/',1))::uuid));
create policy photo_delete on storage.objects for delete to authenticated using(bucket_id='listing-photos' and private.owns_listing((split_part(name,'/',1))::uuid));
