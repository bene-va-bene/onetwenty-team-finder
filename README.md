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

Next: fix listing-type filter semantics. “I need a team” must show
teams seeking riders; “We need riders” must show riders seeking teams.
This progress section supersedes the initial status above.