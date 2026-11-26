import { jobUser, jobAdmin, jobJson } from "../../../../lib/social-job-server";
import { createScenePlan } from "../../../../lib/social-scene-plan-server";
import { recommendSceneMusic } from "../../../../lib/social-scene-music";
import { queueSceneSlides } from "../../../../lib/social-scene-slides-server";
import { recoverBackgroundDispatches } from "../../../../lib/background-queue";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  const user = await jobUser(request);
  if (!user) return jobJson({ error: "Sign in to Social Studio first." }, 401);
  try {
    const body = await request.json();
    if (!["plan", "generate", "music"].includes(body.action))
      return jobJson({ error: "Choose plan, generate or music." }, 400);
    return jobJson(
      body.action === "music"
        ? await recommendSceneMusic(user.id, body)
        : body.action === "plan"
        ? await createScenePlan(user.id, body)
        : await queueSceneSlides(user.id, body),
      body.action === "generate" ? 202 : 200,
    );
  } catch (e) {
    return jobJson(
      {
        error:
          e instanceof Error
            ? e.message
            : "The scene request could not finish.",
      },
      400,
    );
  }
}
export async function GET(request: Request) {
  const user = await jobUser(request);
  if (!user) return jobJson({ error: "Sign in first." }, 401);
  const id = new URL(request.url).searchParams.get("promptId");
  if (!id || !/^[-a-f0-9]{36}$/i.test(id))
    return jobJson({ error: "Choose a saved sequence." }, 400);
  const r = await jobAdmin()
    .from("social_creative_prompts")
    .select("poster_state,poster_result,poster_error,recipe")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (r.error || !r.data || r.data.recipe?.format !== "scene-slides")
    return jobJson({ error: "This sequence could not be found." }, 404);
  if (r.data.poster_state === "generating") await recoverBackgroundDispatches();
  const previewUrls = (r.data.poster_result?.slidesRecovery?.images ?? [])
    .filter(
      (path: unknown) =>
        typeof path === "string" && path.startsWith(user.id + "/creations/"),
    )
    .map(
      (path: string) =>
        jobAdmin().storage.from("social-media").getPublicUrl(path).data
          .publicUrl,
    );
  return jobJson({
    previewUrls,
    status: r.data.poster_state,
    result: r.data.poster_result,
    error: r.data.poster_error,
  });
}
