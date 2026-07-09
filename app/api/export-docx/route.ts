import { NextResponse } from "next/server";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from "docx";

function cleanChapter(chapter: string, index: number) {
  const withoutChapterHeading = chapter
    .replace(new RegExp(`^Chapter\\s+${index + 1}\\s*`, "i"), "")
    .replace(/^Chapter\s+\d+\s*/i, "")
    .trim();

  const lines = withoutChapterHeading
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const povLine = lines[0] || "";
  const bodyLines = lines.slice(1);

  return { povLine, bodyLines };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const title = body.title || "Untitled Story";
    const author = body.author || "Marlow Quinn";
    const chapters: string[] = body.chapters || [];

    const chapterParagraphs = chapters.flatMap((chapter, index) => {
      const { povLine, bodyLines } = cleanChapter(chapter, index);

      return [
        new Paragraph({
          text: `Chapter ${index + 1}`,
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: index !== 0,
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
        }),

        ...(povLine
          ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
                children: [
                  new TextRun({
                    text: povLine.toUpperCase(),
                    bold: true,
                    size: 24,
                  }),
                ],
              }),
            ]
          : []),

        ...bodyLines.map(
          (line) =>
            new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  size: 24,
                }),
              ],
              spacing: { after: 180 },
              indent: { firstLine: 720 },
            })
        ),
      ];
    });

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
                  size: 40,
                }),
              ],
            }),

            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: author,
                  size: 26,
                }),
              ],
            }),

            new Paragraph({
              children: [new PageBreak()],
            }),

            ...chapterParagraphs,
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const uint8Array = new Uint8Array(buffer);

    return new NextResponse(uint8Array, {
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
