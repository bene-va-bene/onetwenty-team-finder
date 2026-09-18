# RAD RACE ONETWENTY 2027 — Team Finder

Updated 17 September 2026. Read this before continuing or reconstructing the project.
Verify repository and live services before writes. This document is not proof of deployment.

## Current state

The approved frontend now connects to the dedicated Supabase project. Implemented:
public real listings; email-link sign-in; persistent browser sessions; create, preview,
publish, edit, close, reopen and delete owned listings; private photo storage with
server-side re-encoding; verified-user and ownership checks; recorded publication/photo
consent; immutable ten-calendar-month expiry; optimistic revisions for concurrent edits.

The board no longer contains fictional riders. Contact is explicitly a DEMO and sends no mail.
No GitHub remote or Vercel deployment has been verified in this handoff.

**Before public launch, still required:** custom SMTP; real contact relay; two-month reminders;
automatic PERMANENT deletion at ten months; abandoned-draft/orphan-image cleanup; account
deletion; admin/reporting; privacy/imprint; universal HEIC fallback; real iOS/Android tests.
Expired listings are hidden and cannot reopen, but that is NOT the permanent-deletion worker.
Deleting a listing removes its photos and consent rows; its sign-in account remains.

## Local project and install

Bene works in VS Code on his Mac. Deliver coherent replacement packages, not repeated small
manual patches. Do not assume assistant scratch changes are installed in his repository.

Local project:
`/Users/benedikteiche/Library/CloudStorage/GoogleDrive-bene@rad-race.com/Meine Ablage/Events/Onetwenty/2027/team-finder`

Save all editor buffers and stop npm run dev with Ctrl+C. Extract team-finder-backend.zip
into Downloads. Run from the EXISTING project terminal:

~~~bash
node ~/Downloads/team-finder-backend/install.mjs
npm install --save-exact @supabase/supabase-js@2.116.0 sharp@0.35.4
npm run lint
npm run build
npm run dev
~~~

The installer validates the project name, backs up affected files under
~/Documents/TeamFinderBackups/, copies only the explicit file list, and creates .env.local
only if absent. Conflicting Supabase config stops it before changes. It preserves
package.json, package-lock.json, layout.tsx, globals.css and the RAD RACE favicon.
The npm command adds two pinned dependencies and updates the existing lockfile.
Do not replace the entire src/app folder or copy node_modules. Use npm ci after cloning.
Keep .env.local ignored. Review git diff and commit after local checks; never force-push.

## Supabase and email configuration

| Setting | Value |
| --- | --- |
| Organization | RAD RACE — qzpfpoodrrrzuliserpu |
| Project | onetwenty-2027-team-finder |
| Project ref | aqzxhfiaezmwkaqtktvi |
| Region | Frankfurt, eu-central-1 |
| API | https://aqzxhfiaezmwkaqtktvi.supabase.co |
| Dashboard | https://supabase.com/dashboard/project/aqzxhfiaezmwkaqtktvi |
| Added project cost quoted when created | 0 monthly; recheck before new paid resources |

supabase.env.example contains only the URL and publishable key. The installer creates
.env.local at project ROOT, not in src. No service-role/secret key is required by this package.
Never put a secret key in a NEXT_PUBLIC_ variable.

In Authentication → URL Configuration, configure the local test:
- Site URL: http://localhost:3000
- Redirect URLs: add http://localhost:3000
- Keep the standard email-link template using {{ .ConfirmationURL }}.
- Test with the email address belonging to your Supabase organization membership.

Auth dashboard configuration has NOT been inspected or changed by this package.
The default mailer only sends to organization members; currently two test messages/hour.
Configure custom SMTP before public use. Do not disable email verification as a workaround.
Set final HTTPS domain and redirects before deployment. A phone's localhost is the phone,
not your Mac; use a reachable configured origin for device testing.

Auth uses supabase-js's browser-only implicit flow: the standard link returns the session
in a URL fragment, the SDK processes it and persists the session in browser storage.
No SSR auth or cookie proxy is needed. Photo POST uses an Authorization bearer token,
validated server-side with getUser; DB and Storage independently enforce ownership.
Server clients are fresh per request. Public reads use only the publishable key.
Sign-out revokes refresh sessions; already-issued access tokens can last until expiry.

Sources: [email links](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Product rules — preserve these

- English, mobile-first, bold uppercase RAD RACE typography, black/off-white/neon yellow.
- Browse without sign-in. Publish display name, region, type, description, languages,
  optional photo/age/social links, publication date. Never email, auth ID or consent data.
- Age is optional for RIDERS only, never teams. Current input 16–99; confirm event/minor
  policy before launch. No claim that this input alone establishes eligibility.
- Five Riding Vibes: Just for the views; Good times, good pace; Sporty but social;
  Let’s shred; Race to win. Multiple selection in form; overlap matching in search.
- I NEED A TEAM shows teams; WE NEED RIDERS shows riders.
- Vibe and gender search use chips; NO team-category search filter.
- Categories/classification stay in form/profile: Woman → Women/Mixed; Man → Men/Mixed.
  Teams select Men/Women/Mixed. Mixed may seek Women/Men/Anyone. Verify final 2027 rules.
- Sign in before creating; no repeat email confirmation for already verified sessions.
- Close removes from public immediately, allows reopening before original expiry.
- Ten CALENDAR months from first publication, unchanged by edits/reopen. No automatic
  closure for inactivity or event date. Every two months remind active owners; no response
  leaves the listing active. Reminder and permanent-deletion workers are still pending.
- Contact ultimately relays verified messages without publishing recipient email.
  Reply-address disclosure behavior must be explicit when implementing the relay.
- No unsolicited old-sheet imports, paid analytics, chat platform, CMS or new paid services.

## Files

| File | Responsibility |
| --- | --- |
| src/app/page.tsx | Real board, filters, profiles/contact demo, account entry points, focus/scroll lock |
| src/app/CreateListingForm.tsx | Form, preview, editing, publication and upload orchestration |
| src/app/PhotoPicker.tsx | Local square crop, drag/zoom, replace/remove, errors and URL cleanup |
| src/app/SignIn.tsx | Email-link requests and resend feedback |
| src/app/MyListings.tsx | Ownership management, close/reopen/delete confirmation |
| src/app/page.module.css | Existing design plus account/management styles |
| src/app/api/photos/route.ts | Verified upload and active-only public photo rendering |
| src/lib/supabase.ts | Browser singleton and per-request server client factory |
| src/lib/listings.ts | Types, RPC helpers and photo-aware deletion |
| public/rider-placeholder.svg | Local no-photo placeholder |
| src/app/favicon.ico | Official RAD RACE icon from previous package, unchanged |
| supabase/migrations/ | Applied backend schema source |
| tests/rls.sql | Rollback-only ownership/access regression test |
| install.mjs | Backup and explicit update installation |

## Photo lifecycle

Input up to 40 MB and 80 MP decoded browser image. JPG/PNG/WebP supported; HEIC/HEIF only
when the browser decodes them. Do not claim universal HEIC support yet. Canvas exports
at most 1200 square JPEG; object URLs revoked on replace/unmount.
Server accepts at most 2 MiB cropped data, checks auth, decodes with a 40 MP limit, rotates,
resizes to at most 1200 square and re-encodes JPEG quality 85. No original, EXIF/GPS or
face analysis. Public rendering re-decodes stored data to prevent serving arbitrary payloads.

Private bucket listing-photos, keys <listing UUID>/<random UUID>.jpg.
Ownership must exist before upload, so photo creation first reserves an unpublished draft.
Failed upload/save can leave a draft/private unused photo. It is not public and can be
removed through permanent deletion. Successful replacement removes the previous photo;
failed cleanup can leave a private old object. Add scheduled cleanup retries and quotas
before release. Storage MIME/size and ownership policies also apply to direct SDK calls.
Public GET /api/photos checks active, unexpired status on every request and sets no-store.
Owners edit via private blob downloads, including for closed listings.

## Database model

Applied to the dedicated project, in order:
1. 20260917215026_team_finder_core.sql
2. 20260917215837_consent_policy.sql

Do not manually rerun applied migrations on the live project. They reconstruct an EMPTY
project in order. Create future filenames via supabase migration new, not hand-written dates.

private.listings holds ownership and validated fields; email stays in auth.users.
private.consents stores exact consent text/version/time/photo consent and cascades on deletion.
Both tables have RLS and no direct anon/authenticated table grants. Keep private outside
Data API exposed schemas. Public wrappers are SECURITY INVOKER. Narrow private
SECURITY DEFINER implementations use empty fixed search_path, explicit auth and ownership
checks, and revoked PUBLIC execution. Public read deliberately allows anonymous callers
but returns only active/unexpired rows without owner_id. No authorization from user_metadata.

Up to three stored listings/account, including closed and draft, limits accidental/spam growth.
A current revision is required for mutations. Conflicts fail rather than overwrite.
All dates are server-derived. Ten months means UTC calendar months, not 300 days.
Deletion closes first, removes photo objects, then deletes the record. Failure leaves a
closed listing for retry. Publication/photo consent is required and recorded on every publish.

## Verification and combined local test

Passed in the assistant test workspace:
- ESLint and production build: Next.js 16.3.5 / React 19.2.8.
- Live public RPC with publishable key; anonymous My listings denied.
- Two rollback-only synthetic auth users: cross-owner update/save/delete denied, direct private
  reads denied, field validation and revision conflicts enforced, close hides, reopen preserves
  expiry, expired cannot reopen, delete removes own record.
- Supabase security advisor: no findings after migrations.

No test users/listings retained; no email sent. Interactive browser, real email/session and
real-device tests have NOT been claimed as passed.

Local test:
1. Empty real board, responsive UI, correct favicon.
2. Sign in using Supabase member email; open link, reload, My listings stays available.
3. Create rider listing with several vibes and cropped photo; preview then publish.
4. Reload: listing/photo persist; no email on public profile.
5. My listings → Edit: fields/photo preserved; change and publish.
6. Close hides listing/photo; reopen preserves original deletion date.
7. Create team: no age; vacancies and sought gender work.
8. Permanently delete with confirmation; listing and photos gone. Sign out.
9. Contact stays explicitly a demo. Commit changes and lockfile after checks.

## Next packages

1. Production SMTP and actual private contact relay, rate limits, abuse handling,
   idempotent send and explicit reply-address behavior.
2. Daily idempotent two-month reminders and ten-month permanent deletion, all related
   photos/messages, account retention, retry/orphan cleanup. Mandatory before release.
3. HEIC fallback and physical iPhone Safari/Android Chrome tests.
4. Admin, reporting, legal pages, account deletion, Vercel/domain and release checks.

## Reconstruction / continuation prompt

Copy this together with the current README and source files into a new coding conversation:

> Continue RAD RACE ONETWENTY 2027 Team Finder with Bene. Read README.md, package.json,
> app files and migrations first; verify live state before writes. Use only project
> aqzxhfiaezmwkaqtktvi in RAD RACE, Frankfurt; never change the TdF portal.
> Bene installs complete packages in his existing Mac VS Code project. Preserve approved
> CI, backup changed files, provide one combined test and update this README/prompt.
> Assistant scratch edits are not proof of installation/deployment.
>
> Rebuild the English mobile-first board in RAD RACE black/off-white/neon yellow, bold
> uppercase headings, event imagery and official favicon. Browse without login. Public
> fields: display name, region, rider/team, description, languages, optional photo,
> optional rider-only age, optional Strava/Instagram, publication date. No public email
> or auth IDs. Keep gender/category compatibility in form/profile, not category search.
> I NEED A TEAM shows teams; WE NEED RIDERS shows riders. Vibe/gender filters are chips.
> Five multi-select vibes: Just for the views; Good times, good pace; Sporty but social;
> Let’s shred; Race to win. Search matches overlap.
>
> Email-link sign-in uses plain wording and persistent verified sessions; no repeated
> confirmation while signed in. Current auth is browser-only Supabase implicit flow;
> stateless server clients, verified bearer for photo upload. Reconstruct backend by
> applying committed migrations to an empty project in order, configure public env and
> redirects, install pinned packages. Inspect history instead of rerunning live migrations.
> Keep private tables, RLS, explicit owner/verified-user checks and exact recorded consent.
> Never expose service-role keys, trust user_metadata, or mix demo people into live results.
> Preserve optimistic revision conflicts and server-derived immutable publication/expiry.
>
> Keep square photo drag/zoom, replace/remove, readable failures, metadata stripping,
> at-most-1200px JPEG, private original-free storage and active-only no-store photo endpoint.
> Preserve form values on preview/back, Escape/focus trap/return focus and scroll lock.
> HEIC currently depends on browser decoding; implement/test fallback before claiming support.
>
> Users publish/edit/close/reopen/delete. Close hides immediately. Expiry is ten calendar
> months after FIRST publication, never extended by edits/reopen. Every two months remind
> active owners; no inactivity/event-date closure. Finish permanent deletion of listings,
> photos and messages via daily idempotent worker before launch: expiry hiding is not enough.
> Finish production SMTP/contact relay, abuse limits, cleanup, legal/admin/account deletion
> and real-device tests. Contact is currently a labelled demo; do not claim mail is sent.
> Avoid unnecessary paid services, analytics, chat/CMS, and old-sheet imports. Verify costs.
>
> Run security advisor, ownership rollback tests, lint/build and one combined acceptance test.
> Report exact tested scope and remaining configuration. This prompt cannot restore secrets,
> deleted user data, lost assets or database backups. Retain Git history and provider backups.

## Assets

Design reference: https://www.rad-race.com/onetwenty-2026

Official favicon source, converted to real multi-size ICO in previous package:
https://images.squarespace-cdn.com/content/v1/652e5fda918ed33c257c1fdf/22baa902-e7c5-4e34-8de3-a81c2cde6f41/favicon.ico

The hero remains an event asset. The new SVG is a text fallback, not an invented logo.
Verify final 2027 branding and image rights before public launch.
