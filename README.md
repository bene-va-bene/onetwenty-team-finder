# RAD RACE ONETWENTY 2027 — Team Finder

## Current state

Updated 17 September 2026. This is a local frontend prototype, not a production service.
Next.js 16.3.5, React 19, TypeScript, App Router, npm and CSS Modules.
No new dependencies are required for the frontend package described here.

Working features:
- Public board with four fictional demo listings and event photos, not real user identities.
- Listing-type, Riding Vibe and gender filters; reset; empty state.
- No team-category filter. Categories remain information on listings and in forms.
- Profile dialog; Escape; focus containment and restoration; background scroll lock.
- Rider/team form; multiple Riding Vibes; conditional age and photo consent.
- Public preview excludes email. Back to edit preserves form inputs.
- Square photo crop using pointer drag (mouse/touch) and keyboard-accessible position/zoom sliders.
- Replace/remove photo; cancel replacement retains the previously applied photo.
- JPEG output up to 1200 × 1200 pixels, without upscaling; 40 MB input and 80 MP decoded limits.
- Photo errors; loading state; selecting the same photo again works.
- Contact demo with email/message validation, no transmission; return to edit preserves text.
- Official RAD RACE site favicon, packaged as ICO.

Not implemented: authentication, persistent listings, actual upload, email delivery,
admin moderation, automatic reminders/deletion, legal pages, production deployment.
HEIC/HEIF works only where the browser can decode it. Unsupported decoding gives a
clear error; universal HEIC conversion remains a backend task. Canvas output is a
fresh JPEG and does not copy source EXIF; this is not a substitute for mandatory
server-side validation, orientation verification and metadata removal before publication.
Original images stay in memory only and are not uploaded. No analytics or localStorage.

## Location and workflow

Local project:

```text
/Users/benedikteiche/Library/CloudStorage/GoogleDrive-bene@rad-race.com/Meine Ablage/Events/Onetwenty/2027/team-finder
```

Develop collaboratively with Bene in VS Code on his Mac. He installs complete replacement
files. Do not assume a remote assistant workspace is connected to his repository.
Prefer complete coherent feature packages over repeated tiny manual edits.
Preserve uncommitted and unsaved work. A clean git status does not include unsaved editor buffers.
GitHub remote and Vercel/Supabase connections must be checked, not assumed.

```bash
npm ci
npm run dev
npm run lint
npm run build
```

Use the project's committed package-lock.json. Never copy node_modules or a package.json
from a separate test workspace over this project. Stop the local dev server before the
production build in this workflow; restart afterward.

## Frontend package installation

Copy the individual files from this package into the existing project; do not replace
the entire project or src/app folder. Save open editor buffers first.

| Package file | Destination | Action |
| --- | --- | --- |
| src/app/page.tsx | src/app/page.tsx | Replace |
| src/app/page.module.css | src/app/page.module.css | Replace |
| src/app/CreateListingForm.tsx | src/app/CreateListingForm.tsx | Replace |
| src/app/PhotoPicker.tsx | src/app/PhotoPicker.tsx | Add |
| src/app/favicon.ico | src/app/favicon.ico | Replace Next.js starter icon |
| README.md | README.md at project root | Replace |

No extra package installation is needed. The existing layout and globals are preserved.
Next.js App Router automatically discovers src/app/favicon.ico. Restart the dev server
and hard-reload the browser if its old icon remains cached. Do not add another icon link.
The default page title in layout.tsx still needs checking before release (layout not supplied).

## Product decisions

Mobile-first public noticeboard, English interface. It replaces the old public Sheet;
do not import old personal data without new consent. The service is a finder, not race registration.
Preserve the approved bold, high-contrast RAD RACE look: black, white, yellow-green,
large typography, clear touch controls. Search choices use chips like Riding Vibes,
not dropdowns. Avoid extra filter layers. Region/language filters were discussed but
are not currently implemented or required in the simplified board.

Two listing types:
- Rider seeks a team. “I NEED A TEAM” in search therefore shows team listings.
- Team seeks riders. “WE NEED RIDERS” in search therefore shows rider listings.

Public fields: optional photo, display name, city/region, languages, description,
Riding Vibes, category preferences/team category, rider race-classification gender or
team's sought gender, optional social links, eventual publication date.
Optional age is for individual riders only. Team forms/previews must never show age.
Riders needed is team-only. Email, messages, ownership/auth IDs, consent and moderation
data must never enter public responses or public previews.

Five Riding Vibes, multiple selections in a listing:
1. Just for the views
2. Good times, good pace
3. Sporty but social
4. Let’s shred
5. Race to win

Current board selects one vibe at a time. A listing matches when that vibe is included.
Rider category preferences: Woman → Women and/or Mixed; Man → Men and/or Mixed.
Team category: Men / Women / Mixed. Mixed teams may seek Women / Men / Anyone;
Men and Women teams use their corresponding sought gender. Gender filtering includes
teams seeking Anyone. No automatic roster or eligibility certification.
Current gender options reflect the supplied competition categories; do not invent
rules for cases not covered by the event rules. Organizer review remains a release task.

## Event rules and unresolved decisions

Reference: https://www.808project.de/one-twenty/ausschreibung (2027, changes reserved).
Road race Mixed timing requires at least three finishers including a woman and a man;
the relevant time can belong to a later finisher if the first three do not meet that mix.
Do not apply this road-race timing statement automatically to the time trial.

The supplied older rules allow participation from 16, with guardian permission under 18.
The optional prototype age field accepts 16–99. This is not identity verification or
consent to a minor's public profile. Confirm the 2027 rule and the finder policy for
minors before allowing real publication. No production eligibility policy is final yet.

## Photo implementation

PhotoPicker.tsx receives value, onChange and onBusyChange from CreateListingForm.
It keeps a browser-decoded source, crop parameters and object URLs in memory.
Crop side = min(source width, source height) / zoom. X/Y position selects the origin
within available source bounds. The visible crop and canvas output use the same math.
Pointer drag and sliders constrain position; ranges also provide keyboard control.
“Use this photo” exports a fresh JPEG, fills transparent areas white and applies it.
“Cancel crop” retains the previous applied image. Remove clears image and consent.
Applying a different crop/photo resets image consent. Preview is blocked while loading,
cropping or encoding. Object URLs are revoked when replaced or unmounted; stale async
results must not revive removed/closed photos. Do not regress these lifecycle safeguards.

HEIC production handling must support iOS/Android without asking users to convert files
manually. Live Photos should use the still frame. Real-device orientation and format
tests remain required. Browser-emulated mobile tests do not establish iOS/Android support.

## Future authentication and contact

Browse without login. Use passwordless email sign-in for publishing/managing/contacting.
Never call it “Magic Link” or “OTP” in user-facing text; explain the email link plainly.
An already authenticated user sends directly without a new link for each message.
An unauthenticated sender writes first, confirms email once and then the pending message
is forwarded automatically. Keep that pending message server-side with a short expiry,
idempotent delivery and explicit linkage to the verified sender. An active session allows
further messages subject to rate limits. Recipient email must never be exposed by the API.
Decide and disclose how the sender's reply address is shared with the recipient before
real delivery; do not promise full anonymity if reply-to reveals the sender's address.

Contact draft is preserved within an open profile; closing/reopening clears it.
The present “TRY CONTACT FLOW” is a demo, not email verification or delivery.

## Retention rules — final product decision

- Owners may edit, close, reactivate or permanently delete listings.
- Closing immediately removes a listing from public browsing.
- Reminder every two calendar months while still active; no response does not close it.
- Permanently delete ten calendar months after FIRST publication, with no extension.
- Reopening/editing must not restart that clock; new need requires a new listing.
- No separate automatic end-of-event closure.
- Delete the listing, image and associated personal/contact/message data no longer needed.
- Shared account data must be assessed against other active listings before deletion.
- Finalize auth-account cleanup, backup retention and minimal legal/audit retention.
- Reminders show first publication and planned deletion date and offer edit/close actions.
- Scheduled jobs must be retry-safe, authenticated and avoid duplicate mail/deletion races.

## Planned backend and costs

Next.js on existing RAD RACE Vercel team if appropriate; Supabase Postgres/Auth/Storage
in an EU region; transactional email provider still undecided. Verify current plans,
pricing, commercial-use terms and limits before provisioning. Never assume free tiers
are suitable. No paid plan upgrade without agreement. No real-time chat, maps, AI or CMS.

Suggested model, to finalize after current docs/security review:
- profiles: private ownership/account details; minimize duplicate auth email storage.
- listings: public fields, owner, kind, draft/active/closed/hidden status, first published,
  immutable deletion deadline, image reference, category/gender fields, timestamps.
- listing_riding_vibes (or constrained array): the five fixed choices.
- consents: exact versioned text/scope, listing/user, timestamps/withdrawal.
- contact_requests: private sender/recipient, message, verification/delivery state.
- moderation_actions/reports: restricted admin records.
- reminder/delivery bookkeeping: idempotency and last successful work.

RLS on every exposed table; public access limited to public fields of active listings.
Use column-safe public projections; RLS alone does not hide private columns.
Owner-scoped mutations; protected admin claims/table (never editable user metadata).
Secret/service keys server-only. Private original uploads; validated sanitized final
images only. Consents/messages inaccessible to public users. Test anonymous, owner,
other user and admin access, plus auth/session invalidation and storage deletion.
Never use a security-definer function merely to work around denied access.

Admin scope: list/search/filter, hide/close/delete, remove images, inspect reports,
simple totals and protected CSV export. Resolve legal operator, imprint, privacy,
provider agreements, retention/minors rules before production release.

## Next packages

1. Finish local acceptance test below and commit this package; verify GitHub backup.
2. Check services/costs, connect private repository and create secure Supabase foundation.
3. Real listing lifecycle, photo storage/conversion/cleanup and public queries.
4. Verified email contact, abuse controls and admin moderation.
5. Reminder/deletion jobs, legal pages, Vercel/domain, real iOS/Android release tests.

## One combined acceptance test

1. Open desktop and ~390 px mobile layout. No inert Menu button or sideways overflow.
2. Filter teams/riders, gender and vibe; clear filters. No team-category filter.
3. Open a profile: Tab/Shift+Tab stay inside; Escape returns focus and scroll position.
4. Contact demo: enter email/message, continue, go back; no message is sent.
5. Create a rider listing: required basics, gender/category and multiple vibes.
6. Select landscape/portrait photo; drag, zoom, adjust sliders; apply crop.
7. Replace it, cancel: old applied photo remains. Replace/apply: photo consent resets.
8. Remove: preview and photo consent disappear. Select same file again: works.
9. Unsupported/corrupt/oversized input: readable error, existing photo stays intact.
10. Preview, back: fields, selections and applied crop preserved; no public email.
11. Switch to team: no age; rider count and sought gender present.
12. Favicon is RAD RACE. Run lint and production build once, then commit the package.

## Rebuild / continuation prompt

Copy the following into a new coding conversation together with this README and the
source files (or grant access to the repository). A prompt describes behavior but cannot
recover secrets, deleted user data or original files; retain Git history and provider backups.

> Rebuild or continue RAD RACE ONETWENTY 2027 Team Finder using this entire README as
> the product specification. First inspect current source, Git status, dependency lockfile
> and connected services. Preserve unsaved/uncommitted work. Live code/config override
> stale implementation status; explicit user product decisions override old code.
> We collaborate in Bene's VS Code on his Mac. Deliver coherent sets of complete files,
> one combined test and one commit per feature package. Do not force-push or overwrite
> unrelated work. Keep this README current, including this reconstruction prompt.
>
> Use Next.js App Router, TypeScript, React and CSS Modules. Preserve the approved
> RAD RACE visual direction from https://www.rad-race.com/onetwenty-2026. Mobile-first,
> English, bold high contrast, touch-friendly chips, no unnecessary filter layers.
> Public browsing is anonymous. Two kinds of listing: rider seeks team and team seeks
> riders. Search “I need a team” shows teams and “We need riders” shows riders.
> Filters are kind, vibe and gender, NOT team category. Use the five exact Riding Vibes
> in this README with multiple selections in the form. Categories and sought gender
> remain public listing information. Age is optional for riders only, never teams.
>
> Build profile, create/edit/public preview and contact flows. Preserve draft inputs on
> back-navigation, trap/restore dialog focus, support Escape and lock background scroll.
> Photos are optional: camera/library, square touch crop, zoom and position sliders,
> replace/remove, retry errors; final output at most 1200 square. Support HEIC/HEIF in
> production through verified conversion, correct orientation and server-side metadata
> stripping. Never publish originals. Match preview crop to output and free object URLs.
>
> Email/private messages/consents/admin information must not be public. Use EU Supabase
> with tested RLS and server-only secrets. Email-link sign-in is explained in plain words.
> Verify an unauthenticated sender once, then send their pending message exactly once;
> authenticated users don't reconfirm per message. Add rate limits and abuse handling.
> Provide simple moderation, not a full CMS. No analytics, maps or realtime messaging.
>
> Owners can close/reopen/delete. Remind active listings every two months without
> deactivating for nonresponse. Permanently delete after ten months from first publication,
> without extending on edit/reopen; remove associated images and obsolete private data.
> Implement retry-safe jobs. Confirm minors policy, legal operator/privacy and provider
> agreements before release. Verify current hosting/email costs; prefer existing plans.
> Use Vercel as requested, not a different hosting product. Clearly distinguish demos
> from working backend behavior. Follow the next packages and validate with the combined
> acceptance test; never claim real-device or backend verification from a UI mockup.

## Asset provenance

Favicon: original light-mode icon linked by https://www.rad-race.com on 17 September 2026.
Source: https://images.squarespace-cdn.com/content/v1/652e5fda918ed33c257c1fdf/22baa902-e7c5-4e34-8de3-a81c2cde6f41/favicon.ico
The CDN supplied a raster image; it was container-converted to a genuine multi-size ICO
without redrawing the mark. Demo photos are referenced from the event's Squarespace CDN.
They illustrate fictional listings; they do not identify the named demo riders. Replace
demo data/images before release. Confirm authorized production use of all event assets.
