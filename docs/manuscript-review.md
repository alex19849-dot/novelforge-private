# Manuscript review

Open the Story Chat menu and choose **Review manuscript**. Prepare the review to see its scope and cost, then explicitly approve the displayed model-charge allowance to start. One Terra 6.1 request receives all saved chapters together with the Story Bible. Unsaved drafts and other books in a series are excluded. No manuscript, writer, planner, generation job or memory row is changed by a review or a finding decision.

A separate `manuscript_review_jobs` table stores the input snapshot, source hash, approval, report, diagnostics and dismissals. Its schema is recorded in `docs/manuscript-review.sql`; it is applied through the hosted database migration mechanism. RLS allows owner reads, denies anonymous access and direct client writes; authenticated API routes enforce ownership. The worker uses the existing server-only service client. Only report data is returned by its API; full private review input is not returned in job summaries.

The Workflow background job survives tab departure. The paid step has retries disabled and an atomic database claim prevents ambiguous interrupted submissions from being sent again. A failed or incomplete provider response is marked failed, with available usage retained and no automatic model retry. A failed request can still be billed. A new review requires a fresh cost approval. Request-ID idempotency and a unique active-review index prevent duplicate starts. Source-key checks reject an outdated cost approval; saved reports are flagged as stale after chapter, POV, title or Bible changes. Dismiss/restore uses an optimistic version check so another device's decisions are not silently overwritten.

All quotation references are checked against the exact indicated source paragraph. Invalid evidence is visible as needing verification, with copy-guidance disabled. An exact quotation establishes wording/location only; interpretation remains the author's judgment. Numerical chapter targets are not stored with accepted chapters, so code reports counts without inventing length failures. No automatic corrections are applied. Verified, current suggestions can be copied into the existing passage guidance workflow.

This is one screening run, not a promise of exhaustive proofreading or a four-pass line-by-line audit. Findings are limited to80 and output to12,000 tokens; truncation is not presented as a completed report. Up to800,000 UTF-8 bytes of input are accepted; oversize input fails before a job/model call, never silently reviews a subset. All supplied chapters appear in the measured-length list. No findings means no proposals, not that the book is proven flawless.

Configured prices checked5 November2026: standard input$1/M,30-minute cache-write input$1.25/M, cached read$0.05/M, output$5/M. The model-charge ceiling uses input bytes plus2,048 framing tokens, and the higher long-context write/output rates ($2.50/M and$7.50/M) for the entire request, rounded upward. The indicative estimate uses bytes/4 and standard output rates and is not exact usage. Diagnostics estimate cost from provider token usage, including reported cache writes and long-context multipliers. Rates must be maintained when provider pricing changes; the displayed allowance is based on these configured rates and excludes tax/conversion. No account-wide billing cap is created.

Verification scripts (use installed TypeScript, React/jsdom and PGlite development tools):

- `scripts/test-manuscript-review.cjs`: evidence, source versions, counts, size/cost bounds, provider failure handling and one-call enforcement.
- `scripts/test-manuscript-review-api.cjs`: owner isolation, approval/version/idempotency guards, saved decisions, worker claim and no story writes.
- `scripts/test-manuscript-review-ui.cjs`: cost confirmation, background departure/reopen, saved dismissals and stale-source warning.
- `scripts/test-manuscript-review-db.cjs`: actual SQL, unique active review, RLS ownership, privileges and cascade.

All these checks are synthetic/mocked, with no paid model calls or private manuscript submissions. The existing two earlier model tests remain the limited empirical evidence for the reviewer; this whole-book integration has not been benchmarked on a paid manuscript review by the assistant.
