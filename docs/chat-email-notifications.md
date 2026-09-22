# Chat email notifications

New in-app messages trigger a generic English email with a link to `APP_URL/?messages=1`. No chat content, sender name or peer email is included. Existing SMTP settings and CRON_SECRET are reused; no new environment variables are needed.

- Default enabled; each verified account can change its own preference in Messages, including accounts without listings.
- Vercel Pro cron `/api/notifications` runs every five minutes. Messages must be at least two minutes old, so first alerts normally arrive within 2–7 minutes, plus SMTP delivery time.
- Alerts are grouped per recipient across conversations, at most one successful/uncertain delivery per 30 minutes. Only new messages create new alerts; an unchanged unread backlog is not mailed repeatedly.
- Read, blocked, expired/deleted and unverified/banned recipient cases are suppressed. A final check before SMTP catches changes since claiming; an email already in flight cannot be recalled.
- No pre-rollout chat backlog is queued. Turning alerts back on discards pending pre-existing messages.
- A private per-message queue avoids skipping messages that commit out of ID order. A recipient row lock and a unique claim prevent overlapping workers from sending the same batch.
- Definite SMTP failures retry with 5/10-minute backoff, at most three attempts. Ambiguous acceptance and stale 15-minute claims are consumed without retry, preferring a missed alert over a duplicate. Later new messages can create a fresh alert.
- Queue entries are removed on completion/suppression and cascade with messages/accounts. Preferences and last-delivery metadata cascade with accounts.
- Service-role RPCs return delivery information only to the worker. RLS is enabled with no direct client policies or table grants; the only authenticated preference RPC uses the verified current user.
- Logs contain counts and elapsed time only. HTTP 503 indicates errors; retained queue work is processed by later cron runs. The daily cleanup and listing reminders remain separate.

## Verification

`node --test tests/mail.test.mjs` checks mocked SMTP delivery and error classification (no real email).
`tests/chat-email.sql` runs rollback-only fixture checks for permissions, read/block suppression, preferences, throttling, retry limits, lease recovery and cascade deletion. Execute against the dedicated Team Finder project only. It temporarily disables existing recipients inside the rollback transaction to isolate fixtures.

After deploy, check Vercel cron logs for `notifications.completed`. For a manual end-to-end check, use two test accounts, leave a new incoming message unread and allow up to seven minutes before checking the recipient mailbox. Reply from within the app. For a logged-out recipient, the notification opens sign-in, then the inbox. Auth should allow the production `/?messages=1` redirect; a one-hour local navigation hint also preserves the destination when Auth falls back to Site URL in the same browser.
