# Adaptive Social Studio

The existing calendar, catalogue endpoint, background copy/artwork/music generation and Buffer publisher are retained. Strategy controls affect future generated drafts, never approved content. General reader posts have no book association or cover dependency. The original manual artwork tool remains available.

## Content and approval

`social-strategy.ts` creates weighted, varied platform assignments across eight families. The initial mix is 65% discovery and 35% direct promotion. Catalogue exposure uses weighted rotation, with a temporary book-priority date and a small evidence-based multiplier. General humour/questions/debates/choices/original social lines are independent of a book. Facebook/Instagram graphics and TikTok music videos retain their existing render path. Matching concepts share one brief so feed assets can be reused.

New drafts store versioned metadata: family, objective, angle, visual layout, caption style, questions/covers, book specificity, topic and exact supporting source phrases. Book-specific generation is rejected if source anchors do not match that book's blurb/tropes. Prompts prohibit unsupported claims, invented quotations and book mixing; approval remains necessary. Original social lines are explicitly not book extracts. Blocked topics are supplied as semantic exclusions and checked literally, with recent captions and opening/trigram similarity checks before saving. No extra model call is used to score or classify historical posts.

Human edits clear labels that can no longer be trusted. Actual cover presence can be corrected in the editor. Publication freezes caption, hashtags, media/book attributes and metadata in `social_publications.content_snapshot` when the atomic claim succeeds. Old posts are unclassified for family/angle/layout; exact platform/book/media data can still contribute to baselines.

## Automatic collection

The publisher attempts to queue analytics at startup and approximately hourly (every 12 ticks). An independent, short durable workflow collects metrics at most once per day, with hourly manual-refresh throttling and a fenced 15-minute lease. Paused publishing does not queue daily analytics; manual refresh still works. The collection reads only existing provider IDs for this owner, in batches of 20, for published posts from the last 31 days. Maximum 120 posts per collection; larger calendars fail visibly rather than silently dropping posts. Snapshot history is paginated and capped explicitly at 12,000 entries / 90 days.

Buffer's personal-key post metrics API was verified against this account on 30 October 2026. It is experimental and may change or report incomplete data. Missing metrics are unknown, not zero. Raw reported values and provider ingestion timestamps persist in `social_metric_snapshots`; unchanged provider timestamps deduplicate. Collection problems are isolated from publishing and shown in the UI. No Metricool upgrade, new credential, scraping or AI analysis is required. Plan/model/API quotas still apply to normal generation and provider requests.

## Scoring and use

Only snapshots at least 24 hours old relative to publication enter comparisons. Compare identical platform, actual media type, age bucket (1–3, 3–7, 7–14, 14–31 days) and metric. At least five other distinct posts with that metric are required for a median baseline. Each post contributes once per report, even when many snapshots exist. Reach/views/impressions are never added together or compared across networks. Discovery blends relative exposure with available reactions/comments/shares/saves. Click performance is separate and uses reported link/post clicks, not sales, Amazon purchases or royalties. Follower/watch metrics are stored if provided but are not invented when absent.

Robust relative log ratios are capped, weighted with a 30-day recency half-life, and shrunk toward neutral with eight prior-equivalent samples. Family, angle, layout, caption, book, question/cover flags and UK hour are observational patterns, not causal claims. Adjustment requires 12 comparable posts per platform plus five attribute examples across three publication dates. One viral post cannot move the strategy. Direct promotion shifts at most five percentage points from the author's selected baseline; discovery weights move gently and maintain exploration. Disabled families are excluded. Learned book/layout/caption/angle preferences and qualified posting hours feed subsequent planning. Reports older than seven days are ignored for generation. No already-approved post is rewritten or rescheduled by learning.

`social_learning_state` persists reports, coverage and collection state; `social_strategy_settings` persists human controls. All new tables have owner-only SELECT policies and server-only writes. Credentials stay in Vercel.

## Validation and release

- `node scripts/test-social-strategy.mjs`: mix, exclusions, normalisation, separate goals, evidence thresholds, source anchors, fatigue, actual SQL RLS/leases and frozen metadata.
- `node scripts/test-social-publishing.mjs` and `node scripts/test-social-publishing-handoff.mjs`: existing publishing protections.
- Fixture build then `node scripts/test-social-publishing-runtime.mjs`: actual routes, durable workflows, PGlite-backed SQL and mocked providers; verifies publishing, analytics/control persistence and 90 new labelled drafts from six copy calls without auto-approval.
- Apply the additive migration before deploying. After the tested deployment is READY, run the explicit `upgrade-social-strategy.mjs` command inside the same Vercel environment with `SOCIAL_STRATEGY_UPGRADE=1` and its deployment ID. This fences and moves the existing publisher, performs its early continuation check, and starts analytics without changing calendar rows.
