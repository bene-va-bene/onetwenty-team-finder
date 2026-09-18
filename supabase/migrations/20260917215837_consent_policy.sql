-- Consent records are intentionally never accessible through a user-facing table API.
create policy consent_deny_direct_access on private.consents to authenticated using (false) with check (false);
