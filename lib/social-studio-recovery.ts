import "server-only";
import { randomUUID } from "node:crypto";
import { jobAdmin } from "./social-job-db";
import { renderStudioPoster } from "./social-studio-poster-server";
/** Only service-side, explicitly authorised recoveries are eligible. Never retry
 * every failure or every minute: claim this one marker before scheduling work. */
export async function claimStudioRecovery(owner: string) {
  const db = jobAdmin();
  const found = await db
    .from("social_creative_prompts")
    .select("id,prompt,recipe")
    .eq("user_id", owner)
    .eq("poster_state", "failed")
    .eq("status", "ready")
    .eq("recipe->>recover_once", "direct_image_v2_pending")
    .order("created_at", { ascending: true })
    .limit(1);
  if (found.error) throw Error("Poster recovery queue could not be checked.");
  const row = found.data?.[0];
  if (!row) return null;
  const recipe = {
    ...row.recipe,
    recover_once: "direct_image_v2_claimed",
    recovery_claimed_at: new Date().toISOString(),
  };
  const claim = await db
    .from("social_creative_prompts")
    .update({ recipe })
    .eq("id", row.id)
    .eq("user_id", owner)
    .eq("poster_state", "failed")
    .eq("recipe->>recover_once", "direct_image_v2_pending")
    .select("id");
  if (claim.error) throw Error("Poster recovery could not be claimed.");
  if (!claim.data?.length) return null;
  return {
    promptId: row.id,
    prompt: row.prompt,
    requestId: randomUUID(),
    platforms: ["facebook", "tiktok", "youtube"],
  };
}
export async function runStudioRecovery(
  owner: string,
  body: NonNullable<Awaited<ReturnType<typeof claimStudioRecovery>>>,
) {
  const response = await renderStudioPoster(owner, body);
  // This creates saved preview assets only. It never inserts social_posts,
  // enables the publisher, or sends a post to any social platform.
  if (!response.ok)
    console.warn("One-time Studio preview recovery needs attention", {
      promptId: body.promptId,
      status: response.status,
    });
}
