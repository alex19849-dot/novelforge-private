# Automatic calendar publishing

NovelForge holds all future approved posts. At their saved UTC time it submits each one to Buffer with automatic `shareNow` publishing. No future calendar is copied into Buffer's capped queue. The browser can be closed.

`social_publishing_settings` holds the owner, channel mapping, pause switch and fenced worker lease. `social_publications` holds the frozen input, provider reference, attempts, outcome and published link. Both tables have owner-only read policies; only the server can change publishing state. The shared Buffer key is restricted to `SOCIAL_STUDIO_OWNER_ID` at the API boundary.

The durable workflow checks idle calendars at most every five minutes, sleeps until nearer due times, and wakes when approvals or edits notify it. Each run hands over after 144 ticks so event logs remain bounded. Keep `workflows/social-publishing.ts` and `publishSocialCalendar` stable across releases, since continuing runs use that workflow reference on the latest branch deployment. No Vercel Cron or open browser is required.

An atomic database claim rechecks approval, date, content version, worker identity and existing publication before freezing a post as publishing. Explicit unaccepted 429 responses retry with backoff. Accepted requests are polled by provider ID. Unknown mutation outcomes are reconciled against exact channel, text, original media URLs and recent creation time; they are never blindly submitted again. Multiple/no confirmed matches are held for attention. Published means Buffer reports `sent`, not merely that it accepted the request.

Missed times older than 30 minutes are flagged for rescheduling instead of flooding channels after an outage. Pause stops new claims; an already submitted post may finish. Failed requests known not to have been accepted can return to draft. Ambiguous or provider-created failures require a Buffer history check before another submission.

Before first enable, `scripts/connect-social-publishing.mjs` checks connected accounts and existing scheduled copies, then creates private test drafts with a future fallback date, reads them back and deletes them. Cleanup IDs persist in settings. Only a completely successful cleanup permits enable. Run it inside Vercel with `SOCIAL_PUBLISHING_DEPLOYMENT_ID` set to a tested READY deployment, and `SOCIAL_PUBLISHING_ENABLE=1` only when live publishing has been authorized. Never log or export API keys.

Validation:

* `node scripts/test-social-publishing.mjs`: real Postgres-compatible schema/RLS, atomic claim fences and retry/result transitions, plus provider failure semantics.
* After a fixture production build, `node scripts/test-social-publishing-runtime.mjs`: browser/API, durable workflow, real SQL RPCs and mocked Buffer. Covers 429, ambiguous acceptance/reconciliation, no duplicate mutation, pause/resume, edits, rescheduling and publishing history. Uses only fake credentials and ports 3401/3402.

Publishing controls and history live in `PublishingPanel` above the existing calendar. Generation, original artwork, music exports and Story Chat writing remain independent.
