# Launch review — 21 September 2026

## Verified

- Bene confirmed the two-real-account chat test, including a user without a listing.
- `/privacy` now describes the implemented account, public listing, consent, photo,
  chat, blocking, reminder and deletion behaviour. Linked from footer, sign-in and
  publication form; imprint links to the current RAD RACE imprint.
- Support/report/privacy requests go to the existing public `info@rad-race.com`,
  never the STRATO sender mailbox that discards incoming messages.
- Production `vercel.json` schedules `/api/maintenance` daily at 05:00 UTC
  (07:00 German summer time / 06:00 winter time).
- Read-only database check at 2026-09-21 08:53 UTC: worker lock `until_at`
  was 2026-09-21 05:00:29.671613 UTC, consistent with that scheduled run reaching
  the database and releasing its lease. No expired listings; no pending, failed,
  uncertain or sending mail jobs. Two historical contact jobs were already sent.
- This timestamp is not a complete execution history or proof of HTTP 200.
  The handler now logs `maintenance.completed` with aggregate counts/duration,
  or `maintenance.failed`. No user content or credentials are logged.
- Lint and production build passed with the new privacy route.

## Operator confirmation still required before treating legal review as complete

The published notice explains the verified application behaviour. It is not a
legal sign-off. Check the actual RAD RACE provider agreements/accounts:

1. Applicable DPAs with Vercel, Supabase, STRATO and image delivery provider;
   international transfer safeguards and subprocessors. Published provider DPAs
   alone do not prove the organisation has completed every contractual step.
2. Actual configured log and backup retention, the corresponding privacy wording,
   and any appointed data-protection contact. Do not claim all copies disappear
   at the listing deadline.
3. Confirm info@rad-race.com is monitored for Teamfinder privacy and abuse reports.
4. Legal review of the stated legal bases, public profile/photo consent and
   international processing. The external imprint currently still refers to TMG;
   the operator should review that main-site text too.

## Operational follow-up

In Vercel project Settings → Cron Jobs → /api/maintenance → View Logs, inspect
the next scheduled run. Expect HTTP 200, `maintenance.completed`, errors=0,
timeBudgetReached=false and moreWorkPossible=false. A 503 needs investigation;
cron itself does not guarantee retry or delivery. An empty queue now cannot prove
future SMTP delivery. Do not trigger real service mail merely as an unsolicited test.

Unpublished photo-upload drafts currently have no publication expiry. Users can
delete them under My listings; explain this accurately until a separate draft
cleanup policy has been agreed and implemented. Closing preserves chats; deleting
a listing removes its conversations for both participants. Account deletion is
handled via support; there is no self-service account-deletion button yet.

## Sources

- https://www.rad-race.com/imprint
- https://www.rad-race.com/privacy-policy
- https://gdpr-info.eu/art-13-gdpr/
- https://vercel.com/legal/dpa
- https://supabase.com/legal/customer-resources/data-processing-addendum
- https://www.strato.de/datenschutz/
- https://www.squarespace.com/privacy
- https://vercel.com/docs/cron-jobs/manage-cron-jobs
