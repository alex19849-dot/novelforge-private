# Narrative Memory upgrade, architecture audit

Audited story-chat at be18eb4643bc6bbbbe990e88c5ea44c1fc7bfdb7, 30 October 2026.

## Feature map before implementation

| Requested capability | Current implementation | Gap and smallest change |
| --- | --- | --- |
| Planned canon versus completed history | Story Bible is separate from `StoryState` and `chapterLedger`; ledger reads completed chapters | Keep that separation. Never write the Bible from extracted memory. |
| Characters, descriptions, traits, locations, objects, injuries, clothing, world rules | Free-text fact/state/location arrays; `currentScene` type exists | Add typed, source-backed records to each existing chapter ledger entry. `currentScene` and several richer types are not populated by the current extractor. |
| Relationships, attraction, trust, hostility, jealousy, public/private status, emotional developments | `relationshipStates`, `relationshipShift`, `intimacyMilestone`; richer progression type exists | Preserve these legacy summaries, add keyed relationship and intimacy changes with evidence; no numeric character scores. |
| Sexual progression and repeated firsts | Chapter intimacy milestones and extraction instructions already exist | Record evidence-backed milestone keys and original chapter, not a new scene-writing system or automatic escalation ladder. |
| Objective facts versus knowledge, belief and reader knowledge | `characterKnowledge` is free text; prompts prohibit omniscience | Add explicit knowledge statuses, subject, proposition, event time, learned time and evidence. Absence of a record means unknown, not proof the character cannot know. |
| Timeline and when facts are learned | Timeline and chapter ending times exist | Add event/learned times to records; preserve unknown time instead of inventing clocks. |
| Promises, secrets, lies, discoveries, decisions, revelations, conversations and conflicts | Mostly captured as new facts or unresolved thread strings | Classify records and keep source references. |
| Stable open/developing/resolved/abandoned threads | Cumulative unresolved strings and per-chapter unresolved lists | Keyed thread events in chapter ledger; derive current status and introduction/resolution history without a second database. |
| Provenance and evidence | Chapter number and a 500-word ending excerpt only | Require exact source quotes, locate them in the actual supplied chapter, attach source fingerprint/offsets. Reject ungrounded entries. |
| Contradiction detection | Existing Terra QA checks facts, timeline, knowledge, milestones and settled conflicts | Feed it the same relevant source-backed context. Require concrete competing evidence; keep diagnostic/author override behavior. |
| Repetition and motifs | Semantic repeated-beat tracking, cumulative repetition warnings and deterministic prose checks exist | Enrich existing ledger patterns with AVOID/MOTIF status and sources. Retrieve prevention guidance; no duplicate QA loop. |
| Scene-relevant retrieval | Writer sends broad cumulative arrays, recent two endings; planner sends most ledger plus handoff duplicates | Shared deterministic entity/POV/text/recency ranking and bounded context, with legacy fallback. No embedding service required initially. |
| Recency plus relevant older facts | Recent endings/ledger slices exist | Preserve recent anchors and retrieve older keyed facts, milestones, knowledge and threads when relevant. |
| Approved manuscript divergence from Bible | Separate stores, instructions favor approved continuity; no inspectable divergence object | Evidence-backed divergence records, visible alongside source; no silent canon rewriting. |
| Incremental finalisation | Existing workflow runs QA, acceptance then ledger; incremental last-chapter analysis | Extend the same extraction call, after acceptance. No extra model call per chapter. |
| Existing-book backfill | Existing three-chapter batches and background checkpoints | Reuse these with a deliberate memory-build operation, progress and cost estimate; do not scan on open. |
| Edits and historical rewrites | Dirty-from marker, ledger rebuild and historical state projection | Filter memory at the same boundary; preserve manual corrections through rebuilds. Prevent future knowledge leaking into rewrites. |
| Inspect/search/manual corrections | No memory view or correction store | Small Memory view over the ledger and an authoritative correction overlay in existing story-state JSON. |
| Cost and performance | Terra extraction already used; ledger consumes growing global state, output allowance 32K | Same extractor/model/call count. Avoid passing raw memory snapshots back as unbounded state; bounded prompt retrieval. Quote backfill estimates before user starts it. |
| Persistence and concurrency | Existing Supabase `stories.story_state` JSON plus owner-authenticated background jobs and CAS save | Store optional ledger fields in that JSON. Reuse RLS, jobs and edit-conflict protection. No new DB/schema/service. |

## Smallest architecture change

1. Extend each existing chapter ledger entry with a versioned, fingerprinted set of typed records and exact passage references. Derive current state from chronological record updates; do not persist a competing global fact database.
2. Extend the existing ledger schema/extraction call, preserving legacy fields for compatibility. Keep corrections outside model output and copy them forward explicitly.
3. Use one shared bounded context selector in planning, prose, specialist prose, QA and passage rewrites. Keep Bible and exact current draft separate.
4. Add an inspectable Memory view with search, source passages, manual overrides, coverage and explicit background build/rebuild. Reuse the existing three-chapter job loop and guard against concurrent edits.

## Verification and limits

Use synthetic chapters and mocked provider responses for provenance, chronology, knowledge isolation, resolved threads, correction precedence, invalidation, retrieval budgets, compatibility and workflow integration. Run TypeScript and the real deployment build. No paid manuscript backfill or creative generation during implementation. Quote matching proves that evidence exists, not that a model's interpretation is infallible; corrections and QA remain necessary. Existing legacy notes must never be presented as newly verified source-backed facts.

## Author-requested prose trial added during implementation

The author subsequently requested GPT-6.1 Terra for prose, then explicitly requested replacing Astra while testing it. Active story-chat prose generation, continuation/rewrite and ordinary reader passage rewrites now use `gpt-6.1-terra`, not a selector or Astra fallback. Existing Aion specialist assignments and Aion planning remain unchanged. No paid prose call was run during implementation. Official model documentation checked 30 October: https://developers.openai.com/api/docs/models/gpt-6.1-terra (Responses API, low reasoning supported; standard input $1/M, cached input $0.05/M, output $5/M; long-context adjustments included in estimates). Account access and creative quality are not established by documentation or mocked tests.

## Upgrade implementation and verification

- Structured records extend existing ledger entries; exact unique source quotes are checked against chapter text and receive offsets plus a content fingerprint. The extractor still uses its existing Terra 5.6 call, after acceptance, with no additional extraction call.
- Projection keeps per-character knowledge separate, distinguishes belief/ignorance/reader knowledge, retains learned chapters separately from source/event times, and derives thread introduction/reference/resolution state. Historical rewrites and dirty boundaries exclude later records.
- Shared retrieval supplies bounded relevance-ranked context to the active chapter planner, main and specialist prose, QA and passage rewrite paths. Fully backfilled stories do not duplicate global legacy fact arrays. Legacy notes are explicitly unverified until backfilled. Recent chapter anchors remain available.
- Existing QA receives the same source-backed context and instructions to cite competing evidence. It remains diagnostic with author override. Evidence matching does not independently prove semantic entailment or guarantee that every contradiction is caught.
- Memory view adds search, categories, source quotes, editable author overrides (including knowledge status/timing), ignored records and override removal. Corrections are saved outside model output and retained during rebuilding.
- Existing background jobs gain an explicit, cost-confirmed memory-build operation. It uses three-chapter batches, preserves drafts and prose, checkpoints completed work, and resumes at the first missing/stale chapter after failure. Opening a manuscript never launches it. Estimates use configured token rates and are not hard spending caps. No backfill run by the assistant.
- No database migration, extra database, embeddings service or new model call per completed chapter. The active story-chat editor is the integration boundary; unrelated legacy standalone APIs are unchanged.
- Tests use synthetic prose and mocked model output for evidence grounding, invalid/ambiguous sources, knowledge/time isolation, thread lifecycle, manual precedence, bounded retrieval, resumable backfill, auth/CAS protections and existing continuation/handoff paths. TypeScript and the complete deployment build are required before release.
