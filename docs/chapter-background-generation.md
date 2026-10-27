# Chapter background generation

Chapter generation uses the existing Vercel Workflow installation and server-only Supabase credentials already used by Social Studio. Planning, continuity preparation, Astra writing and successive Aion insertions no longer rely on the browser to start the next stage. Continue, rewrite-last-section and Complete chapter use the same persisted-job mechanism. Passage rewrites and ordinary chat remain unchanged.

Once the request is accepted, changing tabs, switching phone apps, closing the page or an expired browser session does not cancel the server job. The reader checks saved progress on return, focus and reconnect. Existing manual editing remains available when generation finishes.

## Activation

Apply `supabase/migrations/20261027152347_story_background_generation.sql`, then deploy this branch to `story-chat`. Keep the existing `SUPABASE_SERVICE_ROLE_KEY`, public Supabase URL/key, OpenAI key, OpenRouter key and Vercel Workflow configuration. No extra paid service or new API key is required.

The live migration has NOT been applied. Automatic approval review blocked it pending explicit authorization to change the live database. This branch must remain separate until that approval and migration are complete.

## Recovery and ownership

- Every queued request is stored before the workflow starts, with one active job per story. Repeating a request ID returns the same job.
- Clients can read only their own jobs and cannot create, update or finalize them directly. The API verifies the session and story ownership.
- Each model response is checkpointed. A saved in-flight claim and disabled step retries prevent automatic resubmission of an ambiguous paid call after interruption.
- Failed calls retain the latest available draft and diagnostics. Resuming a pending Aion marker skips Astra.
- Results save into the existing story and unfinished-draft fields. A transactional revision check preserves newer edits on another device. Conflicting results remain in the job and can be opened as a recovered draft.
- QA remains diagnostic. Its existing review/author-override behavior is retained, and generation does not add automatic prose repairs.

## Validation and spending

Run `node scripts/test-chapter-background.cjs`, `node scripts/test-chapter-job-api.cjs`, `node scripts/test-chapter-background-sql.cjs` and the TypeScript checker. The tests use mocked model responses and an in-memory PostgreSQL instance, including RLS, denied client writes, idempotent finalization and concurrent-edit preservation. The isolated Next.js production build and Workflow compilation passed. A declaration comparison also confirmed that extracted generation helpers and the manual edit/rewrite handlers retain their existing behaviour.

No paid model call or GPU run was started during implementation. User-triggered generation continues to use the existing provider accounts and hosting usage.

## Related Aion fix already deployed

Commit `342b1f18b68fe58b709fd407bfc08749e6b3a0d4` preserves explicitly labelled author beats as single handoffs, requests low Aion reasoning, and reports input/output/reasoning tokens on truncation. Model IDs and output ceilings are unchanged. New contracts use the corrected grouping; older saved contracts retain their original markers for safe recovery.
