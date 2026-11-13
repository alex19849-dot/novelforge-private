# Social publishing reliability

Deployed 13 November 2026. Existing approved posts and old missed / ambiguous posts are unchanged.

- Supabase Cron invokes `social_private.check_publisher()` every two minutes, independently of Vercel Workflow. The endpoint is fixed to the public production app, and accepts a five-minute HMAC signature. The signing key lives in Vault and a sensitive production-only Vercel environment variable. Never place a provider key or service role key in pg_net headers.
- Recovery preserves enabled / paused state. A stale heartbeat (eight minutes) or a changed worker version causes a compare-and-swap lease rotation. Database claim and generation fences prevent concurrent workers submitting the same post.
- On deployments that must rotate the worker, bump `PUBLISHER_VERSION`. Durable workflows otherwise continue on the deployment that originally started them.
- The independent check also queues analytics when due. Existing collection-token fencing and hourly claim limits remain active.
- Future scheduled times after `reliability_from` have a six-hour outage recovery window. Older dates retain the original thirty-minute window. This does not retry terminal failures or ambiguous submissions.
- An accepted provider ID survives optional GraphQL warnings. Unknown write outcomes are never automatically resent. Read-only reconciliation continues for up to 24 hours / 120 checks, then visibly needs attention.
- Analytics fetches current configured platforms only, paginates history, isolates failed aliases / batches, saves successful measurements and completes a coverage-labelled report. Previous snapshots remain available; missing values are never zero-filled.

Operational verification: inspect settings heartbeat, maintenance_checked_at and worker_version; learning status, coverage and last_collected_at; Cron job_run_details and pg_net HTTP response status. The enabled flag alone is not evidence of health. A provider disconnect or outage beyond the recovery window still needs attention.

Tests: `node --experimental-strip-types scripts/test-social-reliability.mjs`, `test-social-publishing.mjs`, `test-social-publishing-handoff.mjs`, `test-social-strategy.mjs`, plus the Next production build. Tests use fixtures and do not publish social posts.
