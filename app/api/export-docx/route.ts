import { NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
} from "docx";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const title = body.title || "Untitled Story";
    const author = body.author || "Marlow Quinn";
    const chapters: string[] = body.chapters || [];

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
              children: [
                new TextRun({
                  text: title,
                  bold: true,
                  size: 36,
                }),
              ],
            }),

            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: author,
                  size: 24,
                }),
              ],
            }),

            new Paragraph({
              children: [new PageBreak()],
            }),

            ...chapters.flatMap((chapter, index) => [
              new Paragraph({
                text: `Chapter ${index + 1}`,
                heading: HeadingLevel.HEADING_1,
                pageBreakBefore: index !== 0,
                alignment: AlignmentType.CENTER,
              }),

              ...chapter
                .split("\n")
                .filter((line) => line.trim())
                .map(
                  (line) =>
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: line.trim(),
                          size: 24,
                        }),
                      ],
                      spacing: { after: 240 },
                    })
                ),
            ]),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${title.replace(
          /[^a-z0-9]/gi,
          "_"
        )}.docx"`,
      },
    });
  } catch (error) {
    console.error("DOCX EXPORT ERROR:", error);

    return NextResponse.json(
      { error: "Failed to export DOCX." },
      { status: 500 }
    );
  }
}
