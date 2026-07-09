import { NextResponse } from "next/server";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TableOfContents,
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

  return {
    povLine: lines[0] || "",
    bodyLines: lines.slice(1),
  };
}

function buildTitlePage(title: string, author: string) {
  return [
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
  ];
}

function buildContentWarningsPage(contentWarnings: string[]) {
  return [
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

    ...(contentWarnings.length
      ? contentWarnings.map(
          (warning) =>
            new Paragraph({
              spacing: { after: 180 },
              children: [
                new TextRun({
                  text: `• ${warning}`,
                  color: "000000",
                  size: 24,
                }),
              ],
            })
        )
      : [
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
        ]),

    new Paragraph({
      children: [new PageBreak()],
    }),
  ];
}

function buildChapter(chapter: string, index: number) {
  const { povLine, bodyLines } = cleanChapter(chapter, index);

  return [
  new Paragraph({
  heading: HeadingLevel.HEADING_1,
  pageBreakBefore: index !== 0,
  alignment: AlignmentType.CENTER,
  spacing: { before: 600, after: 300 },
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

    ...bodyLines.flatMap((line) => {
      if (line === "***") {
        return [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 240 },
            children: [
              new TextRun({
                text: "***",
                bold: true,
                color: "000000",
                size: 24,
              }),
            ],
          }),
        ];
      }

      return [
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
        }),
      ];
    }),
  ];
}

function buildAboutAuthorPage(
  authorBio: string,
  authorWebsite: string
) {
  return [
    new Paragraph({
      children: [new PageBreak()],
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 400 },
      children: [
        new TextRun({
          text: "About the Author",
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
          text: authorBio,
          color: "000000",
          size: 24,
        }),
      ],
    }),

    new Paragraph({
      spacing: { after: 300 },
      children: [
        new ExternalHyperlink({
          link: authorWebsite,
          children: [
            new TextRun({
              text: authorWebsite,
              color: "000000",
              size: 24,
              underline: {},
            }),
          ],
        }),
      ],
    }),
  ];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const title = body.title || "Untitled Story";
    const author = body.author || "Marlow Quinn";
    const chapters: string[] = body.chapters || [];

    const includeTitlePage = body.includeTitlePage !== false;
    const includeContentWarnings = body.includeContentWarnings === true;
    const includeAboutAuthor = body.includeAboutAuthor === true;

    const contentWarnings: string[] = body.contentWarnings || [];

    const authorWebsite =
      body.authorWebsite || "https://www.marlowquinn.com";

    const authorBio =
      body.authorBio ||
      "Marlow Quinn writes emotional MM romance filled with heat, heart, found family and unforgettable characters.";

    const doc = new Document({
      sections: [
        {
          children: [
            ...(includeTitlePage
              ? buildTitlePage(title, author)
              : []),

            ...(includeContentWarnings
              ? buildContentWarningsPage(contentWarnings)
              : []),

            ...chapters.flatMap((chapter, index) =>
              buildChapter(chapter, index)
            ),

            ...(includeAboutAuthor
              ? buildAboutAuthorPage(authorBio, authorWebsite)
              : []),
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
