# Author style learning and routine checks

Added 18 November 2026. This is persistent editorial preference memory, not model training.

- Main prose remains gpt-6-astra. AION retains its existing planner/specialist roles.
- The new analyst/checker is pinned to gpt-5.4-mini-2026-03-17, directly through the existing OpenAI project key.
- Memory > Your writing style collects bounded changes from saved-chapter manual edits, in-place passage rewrites and applied review corrections. Draft edits and bulk replacements over 5,000 changed characters are not inferred as preferences. Collection makes no model call. Reversed edits withdraw pending evidence.
- Analysis is explicitly started by the author, using up to eight recent pending examples. Transferable suggestions need two distinct evidence IDs. Suggestions require approval before appearing in planner, main writer, specialist writer or passage-editor prompts. Story-specific facts are not intended to become style rules.
- Rules belong to the signed-in account and apply across its books. They do not replace character voice profiles, story canon or current author direction. Context is capped separately from narrative memory so continuity is not reduced. Removed/ignored preferences do not enter generation context.
- Routine checks inspect one saved chapter, bounded Bible context and relevant narrative memory. Exact source quotes are validated. Checks return issues and editing directions, never mutate prose or trigger a rewrite.
- All analyst requests require approval of a freshly calculated standard-rate cost ceiling. No automatic calls, provider retries, batch jobs or silent fallback to Astra. Six started analyses/checks per UTC day and a concurrent-run lease bound accidental spend. Token diagnostics remain estimates, not evidence that the data-sharing discount was applied. Complimentary eligibility and remaining organisation allowance must be checked in OpenAI's usage dashboard.
- Corrections are capped at 100 pending items per account. The author can pause collection, discard pending examples, approve or remove preferences. Discard is a status change, not manuscript deletion.
- Storage: author_style_profiles and author_style_edits. RLS isolates accounts. Authenticated direct access is read-only; authenticated server routes validate ownership before privileged writes. New tables do not alter manuscript, existing continuity, job or Social Studio schemas.

Validation: production Next build; strict TypeScript reported no errors in modified/new feature code (pre-existing Social Studio strict errors remain outside scope); pure helper, mock-provider API and PGlite schema/RLS tests. No live OpenAI calls were made during implementation. On toolchains whose TypeScript package no longer exports the compiler API, point NOVELFORGE_TEST_TYPESCRIPT at an API-compatible TypeScript installation to run the standalone CJS tests.

Known limits: approved preferences guide generation rather than guarantee compliance. Ambiguous edits can produce poor suggestions, so author approval is required. Only newly captured corrections are available; existing manuscripts were not automatically analysed. A routine chapter check is not a full-manuscript editorial review. Undo does not automatically revoke a preference already explicitly approved by the author; remove it in the panel.
