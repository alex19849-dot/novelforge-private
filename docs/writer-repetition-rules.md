# Shared writer repetition rules

## 2026-11-23

- Added one `REPETITION_STYLE_INSTRUCTION` in `lib/prose-writer.ts`.
- Included it in Astra chapter start, continuation and section rewrite prompts; Aion scene insertion and continuation; normal and Aion selected-passage rewrites; and the direct Aion passage editor.
- Removed duplicated local clause-chain, inventory and stock-exchange instructions in favour of that shared block.
- Covered comma-and chains, duplicated emotional explanations, repeated routine business, recap inventories, stock dialogue exchanges and recurring gestures/reactions. Prior generated prose remains continuity evidence, not permission to reproduce accidental style habits.
- Explicitly retained substantial interiority, character voice, events, requested detail, heat, scene length and endpoint.
- Removed fixed-age editorial boilerplate from the two rewrite prompts and the adult-content-safeguards phrase from chapter planning. No new content instructions were added.
- Model selection, prices, output limits, routing, persistence, background jobs, UI and existing draft text are unchanged.
- Validation: `node scripts/test-shared-writer-repetition.cjs` passed using intercepted provider calls. It inspects actual prompts and checks writer IDs and call counts. No real model/database calls or spending.
- Limitation: this verifies instruction delivery, not guaranteed compliance by a probabilistic model. No paid prose sample was generated.
