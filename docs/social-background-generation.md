# Social Studio background generation

The calendar's Generate 30 days and Generate missing artwork/videos buttons enqueue durable Vercel Workflows. Closing the page, navigating away, or allowing a Supabase user session to expire does not stop an accepted job. The existing one-off poster editor remains available separately.

## Deployment setup

- Apply `supabase/migrations/20261026162316_social_background_generation.sql` after the existing calendar migrations.
- Configure server-only `SUPABASE_SERVICE_ROLE_KEY` in Vercel Preview and Production. Never prefix it with `NEXT_PUBLIC_` or expose it to clients.
- Keep the existing `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` settings.
- Keep Vercel System Environment Variables enabled. Workflow uses `VERCEL_DEPLOYMENT_ID` to select its managed durable backend. No custom cron, public callback token, or separate worker host is needed.
- Redeploy after changing environment variables. Existing deployments keep their original environment.

## Processing and recovery

1. An authenticated API request stores the book catalogue, direction and task queue before starting a workflow. Only the authenticated owner's posts can be selected. One active job per user prevents concurrent overlapping batches.
2. The workflow generates copy in six batches of five days. OpenAI Responses background mode returns a response ID immediately. Checkpointed steps poll the provider using durable sleeps, independently of the browser.
3. Each finished batch is validated and saved. Existing dates/platforms, past posting times and cancelled rows are handled without overwriting approved or edited content. Retried writes reuse deterministic campaign IDs and database uniqueness constraints.
4. Media tasks reuse the existing artwork prompts and quality inspection. Feed media is shared between matching Facebook and Instagram posts. Sharp exports the existing dimensions; FFmpeg renders silent eight-second MP4 artwork animations on the server. This is animated artwork, not generative live-action video or a music-licensing service.
5. Stored response IDs and deterministic media paths let persistence retries reuse generated artwork. The workflow never sends image base64 through its event log or to the calendar browser.
6. Automatic retries handle transient database/provider polling failures. An ambiguous paid submission is not blindly reissued. A failed task records a clear error while other tasks continue. Saved items remain available.
7. The calendar reads saved progress on return. Pause stops after the current item. Starting again fills missing dates/media. Version checks prevent background work from overwriting a draft changed during generation.

Workflow runs are pinned to their deployment. Do not delete an old deployment while its jobs are running. The jobs API reconciles a worker that has failed or been cancelled so the calendar is not left showing it as running indefinitely.

## Boundaries

Approval and publishing behavior is unchanged: these background jobs generate drafts and assets. They do not automatically publish, add TikTok music, or enable the future Buffer rolling queue. AI generation uses the existing API billing; platform workflow/compute/storage usage is additional usage under the existing hosting plans.
