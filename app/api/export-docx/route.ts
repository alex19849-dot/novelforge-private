import { NextResponse } from "next/server";
import {
  AlignmentType,
  Document,
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
    const includeTitlePage = body.includeTitlePage !== false;
    const includeContentWarnings = body.includeContentWarnings === true;

    const chapterParagraphs = chapters.flatMap((chapter, index) => {
      const { povLine, bodyLines } = cleanChapter(chapter, index);

      return [
        new Paragraph({
          pageBreakBefore: index !== 0,
          alignment: AlignmentType.CENTER,
          spacing: {
            before: 600,
            after: 300,
          },
          children: [
            new TextRun({
              text: `Chapter ${index + 1}`,
              bold: true,
              color: "000000",
              size: 32,
            }),
          ],
        }),

        ...(povLine
          ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 500 },
                children: [
                  new TextRun({
                    text: povLine.toUpperCase(),
                    bold: true,
                    color: "000000",
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
                  color: "000000",
                }),
              ],
              spacing: { after: 120 },
              indent: { firstLine: 720 },
            })
        ),
      ];
    });

    const doc = new Document({
      sections: [
        {
          children: [
            ...(includeTitlePage
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 2400, after: 500 },
                    children: [
                      new TextRun({
                        text: title,
                        bold: true,
                        color: "000000",
                        size: 44,
                      }),
                    ],
                  }),

                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 600 },
                    children: [
                      new TextRun({
                        text: author,
                        color: "000000",
                        size: 28,
                      }),
                    ],
                  }),

                  new Paragraph({
                    children: [new PageBreak()],
                  }),
                ]
              : []),
...(includeContentWarnings
  ? [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 1200, after: 400 },
        children: [
          new TextRun({
            text: "Content Warnings",
            bold: true,
            color: "000000",
            size: 32,
          }),
        ],
      }),

      new Paragraph({
        spacing: { after: 300 },
        children: [
          new TextRun({
            text: "This book contains mature themes, explicit romantic content, strong language and emotionally intense scenes.",
            color: "000000",
            size: 24,
          }),
        ],
      }),

      new Paragraph({
        children: [new PageBreak()],
      }),
    ]
  : []),
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
