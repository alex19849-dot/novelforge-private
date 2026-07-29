import { NextResponse } from "next/server";
import {
  AlignmentType,
  Bookmark,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TableOfContents,
  TextRun,
} from "docx";

type ExportChapter = {
  number: number;
  title: string;
  povCharacter: string;
  content: string;
};

type ExportRequest = {
  title?: unknown;
  author?: unknown;
  chapters?: unknown;
  contentWarnings?: unknown;
};

const AUTHOR = "Marlow Quinn";
const AUTHOR_WEBSITE = "https://www.marlowquinn.com";

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim()
    ? value.replace(/[—–]/g, ",").trim()
    : fallback;
}

function cleanWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((warning): warning is string => typeof warning === "string")
    .map((warning) => warning.trim())
    .filter(Boolean);
}

function cleanChapters(value: unknown): ExportChapter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (chapter): chapter is Partial<ExportChapter> =>
        Boolean(chapter) && typeof chapter === "object",
    )
    .map((chapter, index) => ({
      number:
        typeof chapter.number === "number" && Number.isFinite(chapter.number)
          ? chapter.number
          : index + 1,
      title: cleanText(chapter.title, `Chapter ${index + 1}`),
      povCharacter: cleanText(chapter.povCharacter),
      content: cleanText(chapter.content),
    }))
    .filter((chapter) => chapter.content)
    .sort((first, second) => first.number - second.number);
}

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

function normaliseForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanChapterParagraphs(chapter: ExportChapter): string[] {
  const paragraphs = chapter.content
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const removableHeadings = new Set(
    [
      `Chapter ${chapter.number}`,
      chapter.title,
      chapter.povCharacter,
      getFirstName(chapter.povCharacter),
    ]
      .map(normaliseForComparison)
      .filter(Boolean),
  );

  while (
    paragraphs.length > 0 &&
    removableHeadings.has(normaliseForComparison(paragraphs[0]))
  ) {
    paragraphs.shift();
  }

  return paragraphs;
}

function buildInlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g;
  let previousIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > previousIndex) {
      runs.push(
        new TextRun({
          text: text.slice(previousIndex, match.index),
          color: "000000",
          size: 24,
          font: "Garamond",
        }),
      );
    }

    const token = match[0];
    const isBold = token.startsWith("**");
    const markerLength = isBold ? 2 : 1;

    runs.push(
      new TextRun({
        text: token.slice(markerLength, -markerLength),
        bold: isBold,
        italics: !isBold,
        color: "000000",
        size: 24,
        font: "Garamond",
      }),
    );

    previousIndex = pattern.lastIndex;
  }

  if (previousIndex < text.length) {
    runs.push(
      new TextRun({
        text: text.slice(previousIndex),
        color: "000000",
        size: 24,
        font: "Garamond",
      }),
    );
  }

  return runs.length > 0
    ? runs
    : [
        new TextRun({
          text,
          color: "000000",
          size: 24,
          font: "Garamond",
        }),
      ];
}

function pageBreak(): Paragraph {
  return new Paragraph({
    children: [new PageBreak()],
  });
}

function buildTitleAndCopyrightPages(title: string, author: string) {
  const year = new Date().getUTCFullYear();

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 3000, after: 500 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          color: "000000",
          size: 44,
          font: "Garamond",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: author,
          color: "000000",
          size: 28,
          font: "Garamond",
        }),
      ],
    }),
    pageBreak(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1800, after: 300 },
      children: [
        new TextRun({
          text: `Copyright © ${year} ${author}`,
          color: "000000",
          size: 22,
          font: "Garamond",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: "All rights reserved.",
          color: "000000",
          size: 22,
          font: "Garamond",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: "This is a work of fiction. Names, characters, places and events are products of the author's imagination or are used fictitiously.",
          color: "000000",
          size: 22,
          font: "Garamond",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ExternalHyperlink({
          link: AUTHOR_WEBSITE,
          children: [
            new TextRun({
              text: "www.marlowquinn.com",
              color: "000000",
              underline: {},
              size: 22,
              font: "Garamond",
            }),
          ],
        }),
      ],
    }),
    pageBreak(),
  ];
}

function buildContentWarningsPage(contentWarnings: string[]) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1000, after: 500 },
      children: [
        new TextRun({
          text: "Content Warnings",
          bold: true,
          color: "000000",
          size: 32,
          font: "Garamond",
        }),
      ],
    }),
    ...(contentWarnings.length > 0
      ? contentWarnings.map(
          (warning) =>
            new Paragraph({
              spacing: { after: 180 },
              children: [
                new TextRun({
                  text: `• ${warning}`,
                  color: "000000",
                  size: 24,
                  font: "Garamond",
                }),
              ],
            }),
        )
      : [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "This book contains mature themes, explicit adult content and strong language.",
                color: "000000",
                size: 24,
                font: "Garamond",
              }),
            ],
          }),
        ]),
    pageBreak(),
  ];
}

function buildContentsPage(chapters: ExportChapter[]) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 400 },
      children: [
        new TextRun({
          text: "Contents",
          bold: true,
          color: "000000",
          size: 32,
          font: "Garamond",
        }),
      ],
    }),
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-1",
      cachedEntries: chapters.map((chapter) => ({
        title: `Chapter ${chapter.number}`,
        level: 1,
        href: `chapter_${chapter.number}`,
      })),
    }),
    pageBreak(),
  ];
}

function buildChapter(chapter: ExportChapter, index: number) {
  const povFirstName = getFirstName(chapter.povCharacter);
  const bodyParagraphs = cleanChapterParagraphs(chapter);

  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: index > 0,
      alignment: AlignmentType.CENTER,
      spacing: { before: 720, after: 240 },
      children: [
        new Bookmark({
          id: `chapter_${chapter.number}`,
          children: [
            new TextRun({
              text: `Chapter ${chapter.number}`,
              bold: true,
              color: "000000",
              size: 32,
              font: "Garamond",
            }),
          ],
        }),
      ],
    }),
    ...(povFirstName
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
            children: [
              new TextRun({
                text: povFirstName,
                bold: true,
                color: "000000",
                size: 24,
                font: "Garamond",
              }),
            ],
          }),
        ]
      : []),
    ...bodyParagraphs.map((paragraph) => {
      const isSceneBreak = /^(\*{3}|#{3})$/.test(paragraph);

      return new Paragraph({
        alignment: isSceneBreak ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
        spacing: {
          after: isSceneBreak ? 240 : 80,
          line: 276,
        },
        indent: isSceneBreak ? undefined : { firstLine: 360 },
        children: isSceneBreak
          ? [
              new TextRun({
                text: "***",
                color: "000000",
                size: 24,
                font: "Garamond",
              }),
            ]
          : buildInlineRuns(paragraph),
      });
    }),
  ];
}

function buildThankYouPage(title: string) {
  return [
    pageBreak(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 500 },
      children: [
        new TextRun({
          text: "Thank You",
          bold: true,
          color: "000000",
          size: 32,
          font: "Garamond",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: `Thank you for reading ${title}. Your support means more than you know. If you enjoyed the story, leaving a review helps other readers discover it.`,
          color: "000000",
          size: 24,
          font: "Garamond",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: "Marlow Quinn",
          bold: true,
          color: "000000",
          size: 24,
          font: "Garamond",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ExternalHyperlink({
          link: AUTHOR_WEBSITE,
          children: [
            new TextRun({
              text: "www.marlowquinn.com",
              color: "000000",
              underline: {},
              size: 24,
              font: "Garamond",
            }),
          ],
        }),
      ],
    }),
  ];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExportRequest;
    const title = cleanText(body.title, "Untitled Story");
    const author = cleanText(body.author, AUTHOR);
    const chapters = cleanChapters(body.chapters);
    const contentWarnings = cleanWarnings(body.contentWarnings);

    if (chapters.length === 0) {
      return NextResponse.json(
        { error: "This story has no completed chapters to export." },
        { status: 400 },
      );
    }

    const document = new Document({
      features: {
        updateFields: true,
      },
      styles: {
        default: {
          document: {
            run: {
              font: "Garamond",
              size: 24,
              color: "000000",
            },
            paragraph: {
              spacing: {
                line: 276,
              },
            },
          },
          heading1: {
            run: {
              font: "Garamond",
              size: 32,
              bold: true,
              color: "000000",
            },
            paragraph: {
              alignment: AlignmentType.CENTER,
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1080,
                right: 1080,
                bottom: 1080,
                left: 1080,
              },
            },
          },
          children: [
            ...buildTitleAndCopyrightPages(title, author),
            ...buildContentWarningsPage(contentWarnings),
            ...buildContentsPage(chapters),
            ...chapters.flatMap((chapter, index) =>
              buildChapter(chapter, index),
            ),
            ...buildThankYouPage(title),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(document);
    const filename = title.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename || "NovelForge_Book"}.docx"`,
      },
    });
  } catch (error) {
    console.error("DOCX EXPORT ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to export the Word document.",
      },
      { status: 500 },
    );
  }
}
