-- Keep existing profile IDs, memberships, chats and rider search behavior.
-- looking remains a compatibility/filter field; for teams it is derived from seeking.
alter table private.listings drop constraint listings_check;
update private.listings set seeking=null,"ridersNeeded"=null
 where type='team' and not looking;
update private.listings set "ridersNeeded"=null where type='team' and "ridersNeeded"=0;
alter table private.listings add constraint listings_check check(coalesce(
 (type='team' and age is null and "riderGender" is null and cardinality(categories)=1
  and ((not looking and seeking is null and "ridersNeeded" is null)
   or (looking and seeking in ('Anyone','Women','Men')
    and (categories=array['Mixed'] or seeking=categories[1])
    and ("ridersNeeded" is null or "ridersNeeded" between 1 and 5))))
 or (type='rider' and "ridersNeeded" is null and seeking is null
  and (("riderGender" is null and cardinality(categories)=0)
   or ("riderGender" in ('Woman','Man') and categories <@ case when "riderGender"='Woman' then array['Women','Mixed'] else array['Men','Mixed'] end))),false));

create or replace function private.save_listing(p_id uuid, p_data jsonb, p_revision integer, p_publish boolean, p_consent boolean, p_photo_consent boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user(); old private.listings; saved private.listings; first_publish timestamptz; photo text; team_seeking text;
begin
  if p_id is null or p_revision is null or p_publish is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid listing request.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into old from private.listings where id = p_id for update;
  if found then
    if old.owner_id <> uid then raise exception 'Listing not found.' using errcode='42501'; end if;
    if old.type <> p_data->>'type' then raise exception 'A profile cannot change between rider and team.'; end if;
    if old.revision <> p_revision then raise exception 'This listing changed in another window. Reload My listings and try again.'; end if;
    if not p_publish and old.status <> 'draft' then raise exception 'Please preview and confirm publication before saving.'; end if;
    if old.expires_at <= now() then raise exception 'This listing has reached its ten-month limit. Please create a new listing.'; end if;
  else
    if p_data->>'type'='rider' and exists(select 1 from private.listings where owner_id=uid and type='rider') then raise exception 'You already have a rider profile. Open My Paddock to edit it.'; end if;
    if p_revision <> 0 then raise exception 'Listing not found.'; end if;
    if (select count(*) from private.listings where owner_id = uid) >= 3 then raise exception 'You can keep up to three listings. Please delete an old one first.'; end if;
  end if;
  if p_publish and not coalesce(p_consent,false) then raise exception 'Please agree to publication.'; end if;
  photo := nullif(p_data->>'image_path','');
  if photo is not null then
    if split_part(photo,'/',1) <> p_id::text or not exists(select 1 from storage.objects where bucket_id='listing-photos' and name=photo) then raise exception 'Photo not found. Please choose it again.'; end if;
    if p_publish and not coalesce(p_photo_consent,false) then raise exception 'Please confirm that you may publish the photo.'; end if;
  end if;
  -- Team search is an optional public signal, never a membership gate.
  -- Honor older clients that explicitly switch looking off.
  team_seeking := case when p_data->>'type'='team' and coalesce((p_data->>'looking')::boolean,true)
    then nullif(trim(p_data->>'seeking'),'') end;
  first_publish := coalesce(old.published_at, case when p_publish then now() end);
  insert into private.listings (id,owner_id,type,name,region,description,languages,age,"ridersNeeded","riderGender",seeking,categories,vibes,strava,instagram,image_path,status,revision,published_at,expires_at,looking)
  values (p_id,uid,p_data->>'type',trim(p_data->>'name'),trim(p_data->>'region'),trim(p_data->>'description'),trim(p_data->>'languages'),
    case when p_data->>'type'='rider' then nullif(p_data->>'age','')::integer end,
    case when team_seeking is not null then nullif(p_data->>'ridersNeeded','')::integer end,
    case when p_data->>'type'='rider' then p_data->>'riderGender' end,
    team_seeking,
    array(select distinct jsonb_array_elements_text(p_data->'categories')),
    array(select distinct jsonb_array_elements_text(p_data->'vibes')),
    coalesce(p_data->>'strava',''),coalesce(p_data->>'instagram',''),photo,
    case when p_publish then 'active' else coalesce(old.status,'draft') end,coalesce(old.revision,0)+1,first_publish,
    coalesce(old.expires_at, (first_publish at time zone 'UTC' + interval '10 months') at time zone 'UTC'),
    case when p_data->>'type'='team' then team_seeking is not null when exists(select 1 from private.team_members where rider_id=p_id and state='accepted') then false else coalesce((p_data->>'looking')::boolean,old.looking,true) end)
  on conflict(id) do update set type=excluded.type,name=excluded.name,region=excluded.region,description=excluded.description,languages=excluded.languages,
    age=excluded.age,"ridersNeeded"=excluded."ridersNeeded","riderGender"=excluded."riderGender",seeking=excluded.seeking,categories=excluded.categories,vibes=excluded.vibes,
    strava=excluded.strava,instagram=excluded.instagram,image_path=excluded.image_path,status=excluded.status,revision=excluded.revision,
    published_at=excluded.published_at,expires_at=excluded.expires_at,updated_at=now(),looking=excluded.looking
  returning * into saved;
  -- A revised photo/text needs a fresh optional feature permission.
  update private.feature_permissions set allowed=false where listing_id=p_id;
  if p_publish then
    insert into private.consents(listing_id,version,text,photo_consent) values(p_id,'2026-10-01-paddock-v1',
      'I agree that my selected profile information will be shown publicly in the RAD RACE ONETWENTY Paddock. If a photo is included, I confirm that I may use it and that it can be shown publicly.',photo is not null and p_photo_consent);
  end if;
  return to_jsonb(saved)-'owner_id';
end $$;

create or replace function private.paddock_search(p_listing uuid,p_looking boolean,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.require_user(); l private.listings; begin
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into l from private.listings where id=p_listing and owner_id=uid for update;
 if not found then raise exception 'Not your profile.' using errcode='42501'; end if;
 if p_revision is null or l.revision<>p_revision then raise exception 'Profile changed. Reload My Paddock.'; end if;
 if l.type='team' then raise exception 'Edit your team to change who you are looking for.'; end if;
 if p_looking is null then raise exception 'Choose a search status.'; end if;
 if l.expires_at<=now() then raise exception 'This profile has expired.'; end if;
 if p_looking and exists(select 1 from private.team_members where rider_id=l.id and state='accepted') then raise exception 'Leave your current team before looking for another.'; end if;
 update private.listings set looking=p_looking,revision=revision+1,updated_at=now() where id=l.id;
end $$;

-- CREATE OR REPLACE retains the existing restricted execution grants.
