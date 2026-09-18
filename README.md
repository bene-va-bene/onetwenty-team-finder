## Current change: private in-app messaging (18 September 2026)

This section supersedes the older contact-email architecture below. New contact messages
stay in the app. Sign-in links and the approved two-monthly listing reminders remain email.
The prior contact email copy is retained only as historical code; it is no longer enqueued.

- Verified sign-in is sufficient: a sender does not need their own listing or public profile.
- One private conversation per listing and contacting account; a chat name is requested on
  first contact, never derived from an email address. Owner identity is the listing name.
- Messages opens the paginated inbox; unread count is visible in the account navigation.
  Open chats poll every 5 seconds, inbox every 10, navigation count every 30. Hidden tabs do
  not poll. There are no email or push notifications for chats.
- Replies continue when a listing is closed, but no new conversations can start on it.
  Both participants can block a conversation; only the blocking participant can undo their
  block. This pauses both directions for that conversation, not all contact from an account.
- Listing deletion cascades conversations and messages, including the other participant’s
  copy. Expired listings/chats become inaccessible immediately; the existing maintenance
  worker physically deletes them. Ten months from first publication remains immutable.
- Unlisted users are protected from account cleanup while they have conversations.
- Each send has a per-sender idempotency key. Server checks verified, non-banned accounts,
  membership, expiry, blocks, 1–1500 characters, 10 messages/minute and 200/day per sender.
  New conversations are additionally limited to 20 recently active conversations per sender.
- Tables are private, RLS enabled and direct client grants revoked. Public SECURITY INVOKER
  RPC wrappers call fixed-search-path private implementations with participant checks.
  No email address or auth user ID is included in chat responses. Messages are rendered as text.
- Old email conversations are not imported. Old `/api/contact` returns 410 and the old
  `enqueue_contact` RPC tells stale clients to refresh. The migration refuses cutover while contact emails are pending, failed or in flight,
  so queued messages cannot silently disappear. Already sent emails cannot be recalled.

Validation: lint and production build passed; transaction-only database tests passed;
Chromium browser interaction checks passed at 390px and 1280px widths using mocked Auth/RPC.
Physical iPhone/Android and two real users on the deployed version remain the final acceptance test.

### Messaging rollout

1. Apply `supabase/migrations/20260918111052_in_app_messages.sql` to the dedicated
   `aqzxhfiaezmwkaqtktvi` project immediately before deploying this revision. This is a
   deliberate contact-channel cutover: old open tabs must refresh. No new secrets or paid
   services are needed. Do not apply to the Tour de Friends project.
2. Deploy this revision with the existing Production environment variables. Keep STRATO
   credentials because the reminder worker still uses them.
3. Test with two real signed-in accounts: one without a listing contacts a listing owner;
   owner replies in Messages; check unread, reload, block/unblock, and mobile layout.
4. Closing a listing must preserve its existing chats. Deleting it must remove the chats.
   Do not change real publication dates to test automatic expiry.

Rollback: code rollback alone does not restore contact email. Restore the previous
`private.enqueue_contact` implementation from the mail migration deliberately if reverting
channels; previous email jobs must not be replayed. Preserve chat tables/data.

### Messaging verification and reproduction

`npm run lint`, `npm run build`; `node --test tests/mail.test.mjs` protects unchanged reminder
behavior and legacy mail internals. `tests/chat.sql` is a transaction ending in ROLLBACK:
run after the migration in a test database; it checks participants vs strangers/anon,
no-listing senders, idempotency, blocks, unread acknowledgements, pagination, rate limits,
closed/expired listings, cleanup protection and deletion cascade. No test emails are sent.

`tests/chat-ui.cjs` is a browser interaction test with mocked Supabase Auth/RPC, not an
end-to-end test of the live database. Install Playwright/Chromium in your test environment;
start dev with NEXT_PUBLIC_SUPABASE_URL=https://chat-test.supabase.co and
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-public-key, then run the script. Default test URL:
http://127.0.0.1:3101 (override CHAT_TEST_URL). Do not replace your normal env file with fixtures.

Reconstruction: preserve the in-app channel, private participant-only access, no required
public profile, non-email chat names, cursor-based message history, idempotency, block checks,
and listing-linked deletion. Preserve the exact approved sign-in/reminder email wording.
Moderation/reporting and operator privacy/legal review remain separate launch tasks.

---

# RAD RACE ONETWENTY 2027 — Team Finder

Updated 18 September 2026. Read this before continuing or reconstructing the project.
Verify repository and live services before writes. This document is not proof of deployment.

## Current state

The approved frontend now connects to the dedicated Supabase project. Implemented:
public real listings; email-link sign-in; persistent browser sessions; create, preview,
publish, edit, close, reopen and delete owned listings; private photo storage with
server-side re-encoding; verified-user and ownership checks; recorded publication/photo
consent; immutable ten-calendar-month expiry; optimistic revisions for concurrent edits.

The board contains real listings. The new mail package implements verified contact relay,
a private outbox, two-calendar-month reminders and a daily expiry purge. Its migration is
applied to the dedicated project; installing/configuring the app and deploying the daily
schedule are still required. SMTP sign-in through STRATO was tested successfully by Bene.
No GitHub remote or Vercel deployment has been verified in this handoff.

**Before public launch, still required:** configure/test app SMTP (separate from Auth SMTP),
deploy and monitor the daily worker; abandoned-draft/orphan-image cleanup; user-requested
account deletion; admin/reporting; privacy/imprint; universal HEIC fallback; physical-device tests.
Manual deletion removes photos, consents and associated mail jobs. Expiry cleanup also removes
the sign-in account when it has no remaining listings or contact references. Shared account
data needed by another current listing is retained until that use ends. Ten-month-old accounts
with no listings/contact references are also queued for deletion. The dedicated project must
never host unrelated application accounts. Already delivered emails in people's mailboxes and
provider backups cannot be recalled or erased by this application.

## Local project and install

Bene works in VS Code on his Mac. Deliver coherent replacement packages, not repeated small
manual patches. Do not assume assistant scratch changes are installed in his repository.

Local project:
`/Users/benedikteiche/Library/CloudStorage/GoogleDrive-bene@rad-race.com/Meine Ablage/Events/Onetwenty/2027/team-finder`

Save all editor buffers and stop npm run dev with Ctrl+C. Extract team-finder-mail.zip
into Downloads. Run from the EXISTING project terminal:

~~~bash
node ~/Downloads/team-finder-mail/install.mjs
npm install --save-exact nodemailer@10.0.10 server-only@0.0.1
npm install --save-dev --save-exact @types/nodemailer@8.0.2
npm run lint
npm run build
node --test tests/mail.test.mjs
npm run dev
~~~

The mail installer requires the previous backend, validates the project name and Supabase
project, backs up affected files under ~/Documents/TeamFinderBackups/, and copies only the
explicit file list. It does not overwrite .env.local or package/lock/layout/global CSS/favicon.
Existing vercel.json is merged with the maintenance schedule; a conflicting schedule stops
installation. npm adds pinned dependencies and updates the existing lockfile.
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

Keep the existing public Supabase URL/key in .env.local at project ROOT, not in src.
Add the four settings from mail.env.example to that file. The service-role key and SMTP
password are SERVER ONLY. Never prefix these secrets with NEXT_PUBLIC_, put them in the
README, browser code, Git or chat. If a dotenv value contains $, escape it as \$; quote
passwords containing #. Restart npm run dev after environment changes.

| Mail setting | Value |
| --- | --- |
| Sender and SMTP user | teamfinder@rad-race.com |
| Sender name | RAD RACE Team Finder |
| SMTP host / port | smtp.strato.de / 465, implicit TLS |
| SMTP_PASSWORD | password for that dedicated STRATO mailbox |
| APP_URL | http://localhost:3000 locally; final HTTPS origin in production |
| SUPABASE_SERVICE_ROLE_KEY | dedicated project's server-only service-role key |
| CRON_SECRET | at least 32 random characters; generate via node:crypto |

Supabase Auth custom SMTP is already configured and user-tested. That configuration does
not configure Next.js: the app needs SMTP_PASSWORD separately for contact/reminder messages.
STRATO inbox rule: no conditions, Verwerfen, no following rules. Bene tested an incoming
mail and found inbox/trash/spam empty. Replies to teamfinder@rad-race.com are discarded.
Contact emails use Reply-To = verified sender email; reminders explain that replies are
discarded. No IMAP connection or Sent-folder copy is created by the app. Resend is not used.

In Authentication → URL Configuration, configure the local test:
- Site URL: http://localhost:3000
- Redirect URLs: add http://localhost:3000
- Keep the standard email-link template using {{ .ConfirmationURL }}.
- Test with your personal address, never the mailbox that discards incoming messages.

Auth configuration was entered by Bene, who confirmed delivery and sign-in. Keep email
verification enabled. The assistant did not receive the SMTP password.
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
  leaves the listing active. The daily worker must be deployed and monitored to execute this.
- Contact relays verified messages without publishing recipient email. The sender explicitly
  agrees to share their verified email with the recipient; a recipient's reply discloses their
  own address to the sender. Existing verified sessions do not require another email link.
- No unsolicited old-sheet imports, paid analytics, chat platform, CMS or new paid services.

## Files

| File | Responsibility |
| --- | --- |
| src/app/page.tsx | Real board, filters, profiles, account entry points, focus/scroll lock |
| src/app/ContactForm.tsx | Verified contact, disclosure, stable retry ID and delivery feedback |
| src/lib/server/mail.ts | Server-only credentials, private RPC, plain-text SMTP, safe failure states |
| src/app/api/contact/route.ts | Verified bearer, bounded JSON, enqueue, immediate delivery attempt |
| src/app/api/maintenance/route.ts | Secret-protected daily expiry/account cleanup and reminder sending |
| vercel.json | Daily production cron, 05:00 UTC |
| scripts/run-maintenance.mjs | Manual authenticated worker run using local env, no secrets printed |
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
3. 20260918065232_mail_lifecycle.sql

Do not manually rerun applied migrations on the live project. MCP-assigned live migration
timestamps may differ; match their names and contents. These reconstruct an EMPTY
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

## Mail queue and daily lifecycle

private.mail_jobs stores listing FK, sender FK, message, unique request UUID, reminder
milestone, attempts/state and expiry. No recipient address is copied into queue rows.
Only verified users can enqueue contacts. No anonymous access to queue/worker RPCs.
The server resolves recipient/sender emails only at claim time. Fixed subject and structured
addresses prevent header injection; messages are plain text, with no tracking/attachments.
No message content, SMTP diagnostics or credentials are logged.

Limits in one DB transaction: 5 messages/hour and 20/day per sender, one/minute to a listing,
50/day per listing. Account/listing locks serialize requests, unique request ID deduplicates
network retries. Recipients' emails are never returned to the frontend. Sent message bodies
are cleared immediately; remaining metadata and unsent content expire with the target listing
or ten months after contact, whichever is earlier. Listing deletion cascades all its mail jobs.

Jobs: pending → sending → sent / failed / uncertain. Row locking prevents two workers
claiming the same job. Definite pre-acceptance failures retry after at least one hour, at most
three attempts; actual retry is on next worker run (normally daily). Sending abandoned for
15 minutes becomes uncertain. Unknown SMTP outcomes are NOT automatically retried because
SMTP offers no exactly-once guarantee. A stable Message-ID helps traceability but does not
guarantee recipient-side deduplication. Failed/uncertain jobs need operator review; no admin
UI for that exists yet. SMTP acceptance is not proof of inbox delivery, and discarding inbox
mail also discards bounce notifications. Close prevents queued delivery, but cannot recall a
message already handed to SMTP during a simultaneous close/delete.

Reminders use UTC calendar anniversaries at months 2,4,6,8. Only active, unexpired listings
qualify. Unique listing/milestone prevents duplicates. After downtime only the latest due
milestone is created, not all missed reminders. Keep online requires no action; edit/close
links lead to /?manage=1. GET links never mutate or delete data. Dates are shown in the mail.

Retention: public access stops at expires_at. The daily worker removes all objects under the
listing prefix through Storage API, checks the bucket is empty, then deletes listing,
consents and messages. Failures leave the hidden listing for retry. Upload policy locks the
listing and blocks uploads after expiry. Account cleanup blocks new writes before Auth's
hard-delete API; require_user consults auth.users so a deleted/retiring user cannot mutate
even with a still-unexpired JWT. Accounts with other listings or contact references remain.

Worker uses CRON_SECRET bearer, constant-time comparison, a two-minute lease and bounded
60-second execution. It prioritizes deletion, then mail. Deletions normally occur on the next
daily run, up to about 24 hours after expiry; outages/backlogs can delay them. Responses have
only counts. Any errors/time-budget exhaustion return 503 and require checking/re-running
the worker. Mail send failures do not prevent expiry cleanup. Large backlogs need extra runs;
do not promise an exact ten-month-to-the-second erasure or unmonitored guaranteed delivery.

### Activating the worker

After local tests, set all four server variables in Vercel Production plus existing public
Supabase variables. Use the final HTTPS APP_URL and Auth redirects. Deploy vercel.json.
Vercel attaches Authorization: Bearer CRON_SECRET to /api/maintenance. Cron does not run on
your laptop and this package does NOT deploy a Vercel project. Before launch confirm the
schedule appears, run it once, inspect status/counts and arrange monitoring of failures.
From the local project, `node scripts/run-maintenance.mjs` calls APP_URL using .env.local.
That run performs real due cleanup/reminders; use a test project for simulated old dates.
Do not alter real users' publication dates to test expiry. No emails have been sent by the
assistant. Production mail/cron end-to-end validation remains required.

## Verification and combined local test

Passed in the assistant test workspace:
- ESLint and production build: Next.js 16.3.5 / React 19.2.8.
- Live public RPC with publishable key; anonymous My listings denied.
- Two rollback-only synthetic auth users: cross-owner update/save/delete denied, direct private
  reads denied, field validation and revision conflicts enforced, close hides, reopen preserves
  expiry, expired cannot reopen, delete removes own record.
- Mail lifecycle rollback test: rate limits, duplicate requests/claims, private recipient,
  reminder milestone, closed cancellation, expired upload rejection, photo-cleanup gate,
  deletion cascades and retiring-account gate pass.
- Mock SMTP tests: Reply-To/plain text, ambiguous DATA failure, explicit rejection,
  database outage after acceptance and reminder links pass. No network mail sent.
- Supabase security advisor: no schema/RLS findings; account-wide leaked-password protection
  warning remains (this app uses email links). Do not claim all Auth hardening is complete.

No synthetic test users/listings retained; assistant sent no mail. Bene confirmed the prior
backend CRUD/photo flows and STRATO sign-in end-to-end. New relay/cron and physical-device
tests are not yet user-verified.

Local test:
1. Empty real board, responsive UI, correct favicon.
2. Sign in using your personal email; open link, reload, My listings stays available.
3. Create rider listing with several vibes and cropped photo; preview then publish.
4. Reload: listing/photo persist; no email on public profile.
5. My listings → Edit: fields/photo preserved; change and publish.
6. Close hides listing/photo; reopen preserves original deletion date.
7. Create team: no age; vacancies and sought gender work.
8. Permanently delete with confirmation; listing and photos gone. Sign out.
9. Using two addresses you control, publish from A and send a message from verified B.
   Check sender brand, Reply-To B, recipient address absent from browser network responses;
   reply from A and verify it arrives at B. Double click must produce one message.
10. Close A's listing and check it cannot receive new messages. Run the authenticated worker
    once and inspect counts. Do not send to unrelated riders for a test.
11. Verify reminder/expiry scenarios using tests/mail-lifecycle.sql (rollback-only synthetic
    fixtures) in a test DB or controlled operator session; never send fixture emails.
12. Update Git/lockfile after checks. Configure production cron separately before release.

## Next packages

1. Install/configure and user-test the current mail package; deploy/monitor daily cron.
2. Add abuse reporting/admin handling, user-requested account deletion and orphan/draft cleanup.
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
> active owners; no inactivity/event-date closure. Deploy and verify the daily permanent
> deletion worker before launch: expiry hiding alone is not enough.
> SMTP sign-in is verified through STRATO teamfinder@rad-race.com. Use only STRATO, no Resend.
> Contact/outbox and daily lifecycle are implemented in the mail package; check installation,
> server env, Vercel cron deployment and actual delivery before claiming they are operational.
> Use server-only SMTP password/service-role key, CRON_SECRET, fixed TLS465 sender and APP_URL.
> Preserve private recipient, explicit sender-email disclosure, verified Reply-To, DB rate limits,
> unique request IDs, bounded queue worker and no automatic retry of ambiguous SMTP outcomes.
> Preserve calendar reminders, storage-before-row deletion and gated unused-account cleanup.
> Finish abuse handling, orphan cleanup, legal/admin/account deletion and physical-device tests.
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


## Approved email copy — 18 September 2026

The approved contact/reminder text lives in src/lib/server/mail.ts, using plain-text links, original publication/deletion dates and verified sender Reply-To. Both messages end with “much love” followed by “RAD RACE”. Contact subject: “Someone wants to ride with you.” Reminder subject: “Still looking for your crew?”

The approved sign-in HTML is supabase/templates/sign-in.html. In the dedicated Supabase project aqzxhfiaezmwkaqtktvi, manually copy its full contents to BOTH Authentication email templates: Magic Link and Confirm signup. Subject for both: “Your link. Your team. Let’s go.” Keep {{ .ConfirmationURL }} unchanged. Copying this local file does not update hosted templates. Verify new-account and existing-account sign-in after saving. Other authentication templates are outside this change.

Reconstruction prompt addition: Preserve the approved email wording in these source files exactly; do not reintroduce discarded headings or replace “much love”. Configure both hosted sign-in templates from the versioned HTML, retaining Supabase’s confirmation URL. Verify contact Reply-To and immutable reminder deletion dates. Do not include secrets in documentation.

Installation status: package prepared and tested locally; user must run installer on Mac and save the two Supabase templates separately.
