import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanOutput(text: string) {
  return text.replace(/[—–]/g, ",").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const jobId =
      typeof body.jobId === "string" ? body.jobId.trim() : "";

    if (!jobId) {
      return Response.json(
        {
          status: "failed",
          error: "No background job ID was provided.",
        },
        { status: 400 }
      );
    }

    const response = await openai.responses.retrieve(jobId);
    console.log("STATUS:", response.status);

if ("incomplete_details" in response) {
  console.log(
    "INCOMPLETE:",
    JSON.stringify(response.incomplete_details, null, 2)
  );
}

console.log("FULL RESPONSE:");
console.log(JSON.stringify(response, null, 2));

    if (
      response.status === "queued" ||
      response.status === "in_progress"
    ) {
      return Response.json({
        status: response.status,
        complete: false,
      });
    }

    if (response.status !== "completed") {
      return Response.json({
        status: response.status,
        complete: false,
        failed: true,
        error:
          response.error?.message ||
          "Chapter generation ended without completing.",
      });
    }

    const chapter = cleanOutput(response.output_text || "");

    if (!chapter) {
      return Response.json({
        status: "completed",
        complete: false,
        failed: true,
        error: "The completed response contained no chapter text.",
      });
    }

    return Response.json({
      status: "completed",
      complete: true,
      result: chapter,
    });
  } catch (error) {
    console.error("CONTINUE STATUS ERROR:", error);

    return Response.json(
      {
        status: "failed",
        complete: false,
        failed: true,
        error:
          error instanceof Error
            ? error.message
            : "Unknown background job error.",
      },
      { status: 500 }
    );
  }
}
