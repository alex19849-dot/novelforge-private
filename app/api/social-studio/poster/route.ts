import { jobUser, jobJson, jobAdmin } from "../../../../lib/social-job-server";
import { renderStudioPoster } from "../../../../lib/social-studio-poster-server";
export const runtime = "nodejs";
export const maxDuration = 300;
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    v,
  );
export async function GET(request: Request) {
  const account = await jobUser(request);
  if (!account) return jobJson({ error: "Sign in first." }, 401);
  const id = new URL(request.url).searchParams.get("promptId");
  if (!uuid(id)) return jobJson({ error: "Choose a saved prompt." }, 400);
  const result = await jobAdmin()
    .from("social_creative_prompts")
    .select("poster_state,poster_result,poster_error")
    .eq("id", id!)
    .eq("user_id", account.id)
    .maybeSingle();
  if (result.error || !result.data)
    return jobJson({ error: "This prompt could not be loaded." }, 404);
  return jobJson({
    status: result.data.poster_state,
    result: result.data.poster_result,
    error: result.data.poster_error,
  });
}
export async function POST(request: Request) {
  const account = await jobUser(request);
  if (!account)
    return jobJson({ error: "Sign in to Social Studio first." }, 401);
  try {
    return await renderStudioPoster(account.id, await request.json());
  } catch {
    return jobJson({ error: "The poster request could not be read." }, 400);
  }
}
