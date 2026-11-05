import { REVIEW_MODEL, REVIEW_OUTPUT_LIMIT, reviewCostQuote, checkManuscriptReport, type ReviewInput, type SavedReview } from './manuscript-review';

export async function requestManuscriptReview(input: ReviewInput, approvedBudget: number) {
  const quote = reviewCostQuote(input, '');
  if (!Number.isFinite(approvedBudget) || approvedBudget < quote.maximumUsd) throw new Error('Approve the current review cost before starting.');
  if (!process.env.OPENAI_API_KEY) throw new Error('The manuscript reviewer is not configured.');
  let diagnostic: SavedReview['diagnostic'] = null;
  const started = Date.now();
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: REVIEW_MODEL, input: JSON.stringify(input), reasoning: { effort: 'low' }, text: { format: { type: 'json_object' } }, max_output_tokens: REVIEW_OUTPUT_LIMIT, service_tier: 'default', store: false }), signal: AbortSignal.timeout(240000), redirect: 'error',
    });
    const raw = await response.json();
    const usage = raw.usage;
    if (usage) {
      const count = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
      const i = count(usage.input_tokens), o = count(usage.output_tokens);
      const cached = Math.min(i, count(usage.input_tokens_details?.cached_tokens));
      const written = Math.min(i - cached, count(usage.input_tokens_details?.cache_write_tokens));
      const long = i > 272000;
      diagnostic = { model: REVIEW_MODEL, inputTokens: i, outputTokens: o, reasoningTokens: count(usage.output_tokens_details?.reasoning_tokens), costUsd: ((i - cached - written + written * 1.25 + cached * 0.05) * (long ? 2 : 1) + o * 5 * (long ? 1.5 : 1)) / 1000000, durationMs: Date.now() - started };
    }
    if (!response.ok) throw new Error(`The review provider returned HTTP ${response.status}. No automatic retry was started.`);
    if (raw.status !== 'completed' || raw.incomplete_details) throw new Error('The review did not finish within its output limit. No complete report is available and no automatic retry was started.');
    const output = (raw.output ?? []).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).filter((item: { type: string }) => item.type === 'output_text').map((item: { text?: string }) => item.text ?? '').join('\n');
    return { report: checkManuscriptReport(JSON.parse(output), input), diagnostic };
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError' ? 'The reviewer timed out after four minutes. No automatic retry was started.' : error instanceof Error ? error.message : 'The review failed.';
    return { error: message, diagnostic };
  }
}
