import { NextResponse } from "next/server";
export const runtime = "nodejs";
/** Stale creator tabs must refresh instead of running the retired one-step path. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "The creator has been rebuilt. Refresh Social Studio, select your book and use Generate prompt before Generate poster.",
    },
    { status: 409, headers: { "Cache-Control": "no-store" } },
  );
}
