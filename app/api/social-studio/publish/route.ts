import { NextResponse } from "next/server";

type PublishRequest = {
  platform?: "facebook" | "instagram" | "tiktok";
  bookTitle?: string;
  bookSlug?: string;
  campaignTitle?: string;
  caption?: string;
  hashtags?: string[];
  mediaUrl?: string;
  mediaType?: "image" | "video";
  amazonUrl?: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const webhookUrl = process.env.MAKE_SOCIAL_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return NextResponse.json(
      { error: "MAKE_SOCIAL_WEBHOOK_URL is not configured in Vercel." },
      { status: 500 },
    );
  }

  let body: PublishRequest;

  try {
    body = (await request.json()) as PublishRequest;
  } catch {
    return NextResponse.json(
      { error: "The publishing request was not valid JSON." },
      { status: 400 },
    );
  }

  const platform = body.platform;
  const caption = cleanText(body.caption);
  const mediaUrl = cleanText(body.mediaUrl);
  const hashtags = Array.isArray(body.hashtags)
    ? body.hashtags.map(cleanText).filter(Boolean)
    : [];

  if (!platform || !["facebook", "instagram", "tiktok"].includes(platform)) {
    return NextResponse.json(
      { error: "Choose a supported social platform." },
      { status: 400 },
    );
  }

  if (!caption) {
    return NextResponse.json(
      { error: "A caption is required before publishing." },
      { status: 400 },
    );
  }

  if (!mediaUrl || !/^https:\/\//i.test(mediaUrl)) {
    return NextResponse.json(
      { error: "Publishing requires a secure, publicly accessible media URL." },
      { status: 400 },
    );
  }

  const postText = [caption, hashtags.join(" ")].filter(Boolean).join("\n\n");
  const payload = {
    source: "novelforge-social-studio",
    requestedAt: new Date().toISOString(),
    platform,
    bookTitle: cleanText(body.bookTitle),
    bookSlug: cleanText(body.bookSlug),
    campaignTitle: cleanText(body.campaignTitle),
    caption,
    hashtags,
    postText,
    mediaUrl,
    mediaType: body.mediaType === "video" ? "video" : "image",
    amazonUrl: cleanText(body.amazonUrl),
  };

  try {
    const makeResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const responseText = await makeResponse.text();

    if (!makeResponse.ok) {
      console.error("MAKE SOCIAL WEBHOOK FAILED:", {
        status: makeResponse.status,
        response: responseText,
      });

      return NextResponse.json(
        { error: "Make rejected the publishing request." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      platform,
      message: "The campaign was accepted by Make.",
    });
  } catch (error) {
    console.error("MAKE SOCIAL WEBHOOK ERROR:", error);

    return NextResponse.json(
      { error: "NovelForge could not contact Make." },
      { status: 502 },
    );
  }
}
