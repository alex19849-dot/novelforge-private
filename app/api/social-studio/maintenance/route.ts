import { after } from "next/server";
import {
  claimStudioRecovery,
  runStudioRecovery,
} from "../../../../lib/social-studio-recovery";
import { validMaintenanceSignature } from "../../../../lib/social-maintenance-auth";
import { recoverPublisher } from "../../../../lib/social-publishing-server";
import { queueAnalytics } from "../../../../lib/social-analytics-server";
import { jobAdmin } from "../../../../lib/social-job-db";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  if (
    !validMaintenanceSignature(
      request.headers.get("x-maintenance-at"),
      request.headers.get("x-maintenance-signature"),
      process.env.SOCIAL_MAINTENANCE_SECRET,
    )
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const owner = process.env.SOCIAL_STUDIO_OWNER_ID;
  if (!owner)
    return Response.json(
      { error: "Maintenance owner is not configured." },
      { status: 503 },
    );
  const checked = await jobAdmin()
    .from("social_publishing_settings")
    .update({ maintenance_checked_at: new Date().toISOString() })
    .eq("user_id", owner);
  if (checked.error)
    return Response.json(
      { error: "Maintenance state unavailable." },
      { status: 503 },
    );
  const recovery = await claimStudioRecovery(owner);
  if (recovery) after(() => runStudioRecovery(owner, recovery));
  const results = await Promise.allSettled([
    recoverPublisher(owner),
    queueAnalytics(owner),
  ]);
  const healthy = results.every((result) => result.status === "fulfilled");
  return Response.json(
    {
      ok: healthy,
      publisher:
        results[0].status === "fulfilled" ? results[0].value : "retrying",
      analytics:
        results[1].status === "fulfilled"
          ? Boolean(results[1].value)
          : "retrying",
    },
    { status: healthy ? 200 : 503 },
  );
}
