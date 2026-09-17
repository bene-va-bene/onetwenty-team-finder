# RAD RACE ONETWENTY 2027 — Team Finder

Mobile-first Team Finder for RAD RACE ONETWENTY 2027.

The app replaces the previous public Google Sheet. Riders and teams can publish a listing, find compatible people and contact each other without exposing private email addresses.

## Current status

Last updated: 17 September 2026

Current development stage:

- Next.js project created
- Next.js updated to secure version 16.3.5
- local development environment running
- product concept agreed
- frontend prototype not yet implemented
- Supabase not yet connected
- Vercel not yet connected
- no production data exists

## Project location

Local project:

```text
/Users/benedikteiche/Library/CloudStorage/GoogleDrive-bene@rad-race.com/Meine Ablage/Events/Onetwenty/2027/team-finder

## Progress — 17 September 2026

Implemented:
- Responsive listing overview with fictional sample data and filters.
- Profile overlay with Escape handling and background scroll lock.
- Create-listing form with multiple Riding Vibes and local photo preview.
- Public listing preview; “Back to edit” preserves form inputs.
- Photo consent required only when a photo is selected.
- Production build passes.

Still a frontend prototype: no authentication, database, email delivery
or publication. Image cropping, HEIC conversion and metadata removal
are not implemented.

Listing-type filters corrected and verified:
- “I need a team” shows teams seeking riders.
- “We need riders” shows riders seeking teams.

Next: improve keyboard navigation in dialogs and add remaining
listing filters (region and language).

## Latest decisions — 17 September 2026

These decisions override earlier conflicting descriptions:

- Search filters: listing type, Riding Vibe and gender.
- Gender filters use toggle buttons styled like Riding Vibes.
- No team-category filter in the search.
- Team categories remain visible in forms, profiles and previews.
- Riders select their race-classification gender and suitable team categories.
- Teams select Men, Women or Mixed.
- Mixed teams can seek Women, Men or Anyone.
- Age is optional for individual riders only; absent from team forms and previews.
- Preview → Back to edit preserves form inputs.
- Production build passes.

Still a frontend prototype: no publication, authentication, database,
email delivery or processed image uploads.