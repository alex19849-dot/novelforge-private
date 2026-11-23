# Guidance formatting recovery, 23 November 2026

Runtime logs confirmed four guidance-validation failures and one JSON escape failure in `/api/story-chat`. Raw rejected guidance was not stored in the log, so its exact missing heading is unknown. Existing validation demanded exact unpunctuated headings and an EXCLUSIONS section even where no exclusion was applicable.

The guidance provider now normalises common heading decoration, heading colons, inline purpose/ending, ENDPOINT, TIMING and POINT OF VIEW aliases before validating the actual fields. It accepts a guidance draft without an inapplicable EXCLUSIONS heading and retains any supplied exclusions. Chapter/section identity, POV, time, purpose, ending, scene instructions and applicable continuity are still required; empty purpose and ending sections are rejected.

JSON parsing first uses strict JSON. A second local pass handles escaped apostrophes/markdown punctuation, raw control characters inside strings and outer code fences. It does not fabricate missing fields or complete truncated JSON. Schema/type checks remain in place. No provider repair request, automatic retry or new paid call is introduced. Complete author-supplied briefs still bypass generation unchanged.

Validation: `node scripts/test-guidance-format-recovery.cjs` passes offline, covering decorated/colon/inline headings, aliases, missing optional exclusions, JSON escape repair, unfinished JSON, genuinely incomplete guidance, questions, chapter 1/prologue/epilogue and zero-call author-supplied guidance. Writer rules, specialist routing, model IDs, heat, saved chapters and other application features are unchanged. No paid sample was generated.
