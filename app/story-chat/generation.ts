import type { ChapterPlan, GenerationDiagnostic, StoryBible, StoryChapter, StoryChatResponse, StoryState, StoryWorkspace } from "./types";

export type PendingChapterGeneration = {
  storyId: string;
  savedAt?: string;
  generatedChapter: NonNullable<StoryChatResponse["generatedChapter"]>;
  chapterBrief: string;
  latestUserMessage: string;
  draft: string;
  lastSection?: string;
  repetitionWarnings?: string[];
  minimumWordCount: number;
  maximumWordCount: number;
  qualityReview?: QualityResponse["quality"];
  qualityCheckedDraft?: string;
  qualityOverrideReady?: boolean;
  qualityTechnicalError?: string;
  diagnostics?: GenerationDiagnostic[];
};

export type SectionAction = "start" | "continue" | "rewrite";

export type WriterResponse = {
  section: string;
  wordCount: number;
  warnings: string[];
  action: SectionAction;
  specialistScenesPending?: boolean;
  diagnostics: GenerationDiagnostic[];
};

export type LedgerResponse = {
  storyState: StoryWorkspace["storyState"];
  diagnostics: GenerationDiagnostic[];
};

export type QualityResponse = {
  accepted: boolean;
  chapterContent: string;
  repaired: boolean;
  quality: {
    passed: boolean;
    overallStatus: "pass" | "pass_with_warnings" | "needs_attention";
    hardFailures: string[];
    repairInstructions: string[];
    summary: string;
    findings: {
      category: string;
      severity: "minor" | "moderate" | "major" | "critical";
      message: string;
      beatOrder: number | null;
    }[];
    beatAssessments: {
      order: number;
      instruction: string;
      status: "satisfied" | "partial" | "missing";
      evidence: string;
    }[];
    guidanceAdherence: {
      missingBeats: string[];
      orderViolations: string[];
      endpointViolations: string[];
      inventedMajorEvents: string[];
      exclusionViolations: string[];
    };
    wordCountCompliance: {
      actual: number;
      minimum: number;
      maximum: number;
      withinRange: boolean;
    };
    scores: {
      continuity: number;
      factualAuthenticity: number;
      plotMovement: number;
      relationshipProgression: number;
      voiceDistinctiveness: number;
      povAndTense: number;
      repetitionControl: number;
      hookStrength: number;
      guidanceAdherence: number;
      endpointCompliance: number;
    };
  };
  qualityWarnings?: string[];
  diagnostics: GenerationDiagnostic[];
};

export const EMPTY_STORY_STATE = {
  importantFacts: [],

  characterStates: [],

  relationshipStates: [],

  unresolvedThreads: [],

  timeline: [],

  locations: [],

  activePOV: "",

  chapterLedger: [],

  latestChapterEnding: "",

  characterKnowledge: [],

  repetitionWarnings: [],

  voiceProfiles: [],

  chapterPlans: [],

  lastGenerationDiagnostics: [],

  currentScene: undefined,

  relationshipProgression: [],

  repetitionMemory: {
    completedInternalBeats: [],
    settingTreatments: [],
    actionPatterns: [],
    dialoguePatterns: [],
    repeatedLanguage: [],
    sentenceOpeningWarnings: [],
  },

  continuityDirtyFromChapter: undefined,
};

export function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export function getStoryStateBeforeChapter(
  state: StoryState,
  replacementNumber: number | null,
): StoryState {
  if (replacementNumber === null) {
    return state;
  }

  const earlierLedger = (state.chapterLedger ?? []).filter(
    (entry) => entry.chapterNumber < Math.min(replacementNumber, state.continuityDirtyFromChapter ?? Infinity),
  );
  const previousChapter = earlierLedger.at(-1);
  const unique = (values: string[]) =>
    Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

  return {
    ...EMPTY_STORY_STATE,
    memoryCorrections: (state.memoryCorrections ?? []).filter(correction => correction.chapterNumber < replacementNumber),
    importantFacts: unique(earlierLedger.flatMap((entry) => entry.newFacts)),
    relationshipStates: previousChapter?.relationshipShift
      ? [previousChapter.relationshipShift]
      : [],
    unresolvedThreads: previousChapter?.unresolvedThreads ?? [],
    timeline: [
      ...earlierLedger.map(
        (entry) => `Chapter ${entry.chapterNumber}: ${entry.summary}`,
      ),
      ...(previousChapter?.endingTime
        ? [
            `CURRENT CLOCK: ${previousChapter.endingTime}, immediately after Chapter ${previousChapter.chapterNumber}.`,
          ]
        : []),
    ],
    locations: unique(
      earlierLedger.flatMap((entry) => [
        entry.openingLocation,
        entry.endingLocation,
      ]),
    ),
    chapterLedger: earlierLedger,
    latestChapterEnding: previousChapter?.endingExcerpt ?? "",
    characterKnowledge: unique(
      earlierLedger.flatMap((entry) => entry.characterKnowledgeChanges ?? []),
    ),
    repetitionWarnings: unique(
      earlierLedger.flatMap((entry) => entry.repeatedBeats),
    ).slice(-60),
    repetitionMemory: {
      completedInternalBeats: unique(
        earlierLedger.flatMap((entry) => entry.completedInternalBeats ?? []),
      ),
      settingTreatments: unique(
        earlierLedger.flatMap((entry) => entry.settingTreatments ?? []),
      ),
      actionPatterns: unique(
        earlierLedger.flatMap((entry) => entry.actionPatterns ?? []),
      ),
      dialoguePatterns: [],
      repeatedLanguage: unique(
        earlierLedger.flatMap((entry) => entry.repeatedLanguage ?? []),
      ),
      sentenceOpeningWarnings: [],
    },
    currentScene: previousChapter
      ? {
          chapterNumber: previousChapter.chapterNumber,
          storyClock: previousChapter.endingTime,
          location: previousChapter.endingLocation,
          presentCharacters: [],
          physicalPositions: previousChapter.endingPositions ?? [],
          activeObjects: previousChapter.activeObjects ?? [],
          injuries: [],
          clothing: [],
        }
      : undefined,
    voiceProfiles: state.voiceProfiles ?? [],
    activePOV: previousChapter?.povCharacter ?? "",
    chapterPlans: state.chapterPlans ?? [],
  };
}

export function getContractWordRange(chapterBrief: string): {
  minimum: number;
  maximum: number;
} | null {
  try {
    const parsed = JSON.parse(chapterBrief) as Record<string, unknown>;
    const range =
      parsed.targetWordRange &&
      typeof parsed.targetWordRange === "object" &&
      !Array.isArray(parsed.targetWordRange)
        ? (parsed.targetWordRange as Record<string, unknown>)
        : null;
    const minimum = Number(range?.minimum);
    const maximum = Number(range?.maximum);

    return Number.isInteger(minimum) &&
      Number.isInteger(maximum) &&
      minimum >= 500 &&
      maximum <= 10000 &&
      minimum <= maximum
      ? { minimum, maximum }
      : null;
  } catch {
    return null;
  }
}

export function qualityReviewWarnings(quality: QualityResponse["quality"]): string[] {
  const wordCount = quality.wordCountCompliance;
  const warnings = [
    `QA ${quality.overallStatus.replaceAll("_", " ").toUpperCase()}: ${quality.summary}`,
    `Word count: ${wordCount.actual.toLocaleString()} (target ${wordCount.minimum.toLocaleString()} to ${wordCount.maximum.toLocaleString()}).`,
    ...quality.beatAssessments
      .filter((beat) => beat.status !== "satisfied")
      .map(
        (beat) =>
          `Beat ${beat.order} ${beat.status}: ${beat.instruction}${
            beat.evidence ? ` (${beat.evidence})` : ""
          }`,
      ),
    ...quality.findings.map(
      (finding) =>
        `${finding.severity.toUpperCase()} ${finding.category.replaceAll("_", " ")}${
          finding.beatOrder === null ? "" : `, beat ${finding.beatOrder}`
        }: ${finding.message}`,
    ),
    ...quality.hardFailures.map((failure) => `MAJOR: ${failure}`),
  ];

  return [
    ...Array.from(new Set(warnings)),
    "Edit or use the recovery controls, or press Complete chapter again to accept this exact draft anyway.",
  ];
}

export function isGenerationDiagnostic(value: unknown): value is GenerationDiagnostic {
  if (!value || typeof value !== "object") {
    return false;
  }

  const diagnostic = value as Partial<GenerationDiagnostic>;

  return (
    typeof diagnostic.stage === "string" &&
    (diagnostic.provider === "openai" ||
      diagnostic.provider === "openrouter") &&
    typeof diagnostic.model === "string" &&
    (diagnostic.status === undefined ||
      diagnostic.status === "succeeded" ||
      diagnostic.status === "failed") &&
    typeof diagnostic.inputTokens === "number" &&
    typeof diagnostic.outputTokens === "number" &&
    typeof diagnostic.totalTokens === "number" &&
    (diagnostic.costUsd === null || typeof diagnostic.costUsd === "number") &&
    (diagnostic.costType === undefined ||
      diagnostic.costType === "reported" ||
      diagnostic.costType === "estimated" ||
      diagnostic.costType === "unavailable") &&
    typeof diagnostic.durationMs === "number" &&
    typeof diagnostic.attempt === "number" &&
    (diagnostic.error === undefined || typeof diagnostic.error === "string")
  );
}

export function isDiagnosticArray(value: unknown): value is GenerationDiagnostic[] {
  return Array.isArray(value) && value.every(isGenerationDiagnostic);
}

export function isWriterResponse(value: unknown): value is WriterResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<WriterResponse>;

  return (
    typeof response.section === "string" &&
    Boolean(response.section.trim()) &&
    typeof response.wordCount === "number" &&
    isStringArray(response.warnings) &&
    (response.action === "start" ||
      response.action === "continue" ||
      response.action === "rewrite") &&
    isDiagnosticArray(response.diagnostics)
  );
}

export class ApiRequestError extends Error {
  diagnostics: GenerationDiagnostic[];

  constructor(
    message: string,
    diagnostics: GenerationDiagnostic[] = [],
    readonly preservedDraft?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.diagnostics = diagnostics;
  }
}

export async function readApiJson(response: Response): Promise<unknown> {
  const responseText = await response.text();
  let data: unknown = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText) as unknown;
    } catch {
      const preview = responseText.replace(/\s+/g, " ").trim().slice(0, 120);

      throw new Error(
        `The server returned HTTP ${response.status} with a non-JSON response${
          preview ? `: ${preview}` : "."
        }`,
      );
    }
  }

  if (!response.ok) {
    const errorMessage =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `The server returned HTTP ${response.status}.`;

    const diagnostics =
      data &&
      typeof data === "object" &&
      "diagnostics" in data &&
      isDiagnosticArray(data.diagnostics)
        ? data.diagnostics
        : [];

    const preservedDraft = data && typeof data === "object" &&
      "preservedDraft" in data && typeof data.preservedDraft === "string"
      ? data.preservedDraft : undefined;
    throw new ApiRequestError(errorMessage, diagnostics, preservedDraft);
  }

  return data;
}

export function isChapterPlan(value: unknown): value is ChapterPlan {
  if (!value || typeof value !== "object") {
    return false;
  }

  const plan = value as Partial<ChapterPlan>;

  return (
    typeof plan.chapterNumber === "number" &&
    typeof plan.title === "string" &&
    typeof plan.povCharacter === "string" &&
    typeof plan.chapterGoal === "string" &&
    typeof plan.relationshipChange === "string" &&
    Array.isArray(plan.scenes) &&
    plan.scenes.length >= 1 &&
    plan.scenes.length <= 5 &&
    plan.scenes.every(
      (scene) =>
        Boolean(scene) &&
        typeof scene === "object" &&
        typeof scene.order === "number" &&
        typeof scene.location === "string" &&
        typeof scene.objective === "string" &&
        typeof scene.conflict === "string" &&
        typeof scene.newInformation === "string" &&
        typeof scene.exitBeat === "string",
    ) &&
    isStringArray(plan.completedBeatsToAvoid) &&
    (plan.status === "draft" || plan.status === "approved") &&
    typeof plan.updatedAt === "string"
  );
}

export function isStoryState(value: unknown): value is StoryWorkspace["storyState"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Partial<StoryWorkspace["storyState"]>;

  const chapterLedgerIsValid =
    state.chapterLedger === undefined ||
    (Array.isArray(state.chapterLedger) &&
      state.chapterLedger.every(
        (entry) =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof entry.chapterNumber === "number" &&
          typeof entry.title === "string" &&
          typeof entry.povCharacter === "string" &&
          typeof entry.summary === "string" &&
          typeof entry.openingLocation === "string" &&
          typeof entry.endingLocation === "string" &&
          typeof entry.endingTime === "string" &&
          typeof entry.endingExcerpt === "string" &&
          typeof entry.relationshipShift === "string" &&
          typeof entry.intimacyMilestone === "string" &&
          isStringArray(entry.newFacts) &&
          isStringArray(entry.unresolvedThreads) &&
          isStringArray(entry.repeatedBeats),
      ));
  const voiceProfilesAreValid =
    state.voiceProfiles === undefined ||
    (Array.isArray(state.voiceProfiles) &&
      state.voiceProfiles.every(
        (profile) =>
          Boolean(profile) &&
          typeof profile === "object" &&
          typeof profile.characterName === "string" &&
          typeof profile.narrativeRhythm === "string" &&
          typeof profile.vocabulary === "string" &&
          typeof profile.humourStyle === "string" &&
          typeof profile.emotionalDeflection === "string" &&
          typeof profile.sensoryFocus === "string" &&
          typeof profile.dialoguePattern === "string" &&
          typeof profile.internalThoughtPattern === "string" &&
          isStringArray(profile.forbiddenHabits),
      ));
  const chapterPlansAreValid =
    state.chapterPlans === undefined ||
    (Array.isArray(state.chapterPlans) &&
      state.chapterPlans.every(isChapterPlan));

  return (
    isStringArray(state.importantFacts) &&
    isStringArray(state.characterStates) &&
    isStringArray(state.relationshipStates) &&
    isStringArray(state.unresolvedThreads) &&
    isStringArray(state.timeline) &&
    isStringArray(state.locations) &&
    typeof state.activePOV === "string" &&
    chapterLedgerIsValid &&
    (state.latestChapterEnding === undefined ||
      typeof state.latestChapterEnding === "string") &&
    (state.characterKnowledge === undefined ||
      isStringArray(state.characterKnowledge)) &&
    (state.repetitionWarnings === undefined ||
      isStringArray(state.repetitionWarnings)) &&
    voiceProfilesAreValid &&
    chapterPlansAreValid &&
    (state.lastGenerationDiagnostics === undefined ||
      isDiagnosticArray(state.lastGenerationDiagnostics))
  );
}

export function isLedgerResponse(value: unknown): value is LedgerResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<LedgerResponse>;

  return (
    isStoryState(response.storyState) && isDiagnosticArray(response.diagnostics)
  );
}

export function isQualityResponse(value: unknown): value is QualityResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<QualityResponse>;
  const quality = response.quality;
  const scores = quality?.scores;

  return (
    typeof response.accepted === "boolean" &&
    typeof response.chapterContent === "string" &&
    Boolean(response.chapterContent.trim()) &&
    typeof response.repaired === "boolean" &&
    Boolean(quality) &&
    typeof quality?.passed === "boolean" &&
    (quality?.overallStatus === "pass" ||
      quality?.overallStatus === "pass_with_warnings" ||
      quality?.overallStatus === "needs_attention") &&
    isStringArray(quality?.hardFailures) &&
    isStringArray(quality?.repairInstructions) &&
    typeof quality?.summary === "string" &&
    Array.isArray(quality?.findings) &&
    quality.findings.every(
      (finding) =>
        Boolean(finding) &&
        typeof finding.message === "string" &&
        (finding.severity === "minor" ||
          finding.severity === "moderate" ||
          finding.severity === "major" ||
          finding.severity === "critical"),
    ) &&
    Array.isArray(quality?.beatAssessments) &&
    quality.beatAssessments.every(
      (beat) =>
        typeof beat.order === "number" &&
        typeof beat.instruction === "string" &&
        (beat.status === "satisfied" ||
          beat.status === "partial" ||
          beat.status === "missing") &&
        typeof beat.evidence === "string",
    ) &&
    Boolean(quality?.wordCountCompliance) &&
    typeof quality.wordCountCompliance.actual === "number" &&
    typeof quality.wordCountCompliance.minimum === "number" &&
    typeof quality.wordCountCompliance.maximum === "number" &&
    typeof quality.wordCountCompliance.withinRange === "boolean" &&
    Boolean(scores) &&
    typeof scores?.continuity === "number" &&
    typeof scores?.plotMovement === "number" &&
    typeof scores?.relationshipProgression === "number" &&
    typeof scores?.voiceDistinctiveness === "number" &&
    typeof scores?.povAndTense === "number" &&
    typeof scores?.repetitionControl === "number" &&
    typeof scores?.hookStrength === "number" &&
    isDiagnosticArray(response.diagnostics)
  );
}

export function applyGeneratedChapter(
  story: StoryWorkspace,
  pending: PendingChapterGeneration,
  content: string,
): StoryWorkspace {
  const now = new Date().toISOString();
  const chapterMetadata = pending.generatedChapter;
  const replacementNumber = chapterMetadata.replaceChapterNumber;
  const nextChapterNumber =
    story.chapters.length > 0
      ? Math.max(...story.chapters.map((chapter) => chapter.number)) + 1
      : 1;

  if (replacementNumber !== null) {
    const chapterExists = story.chapters.some(
      (chapter) => chapter.number === replacementNumber,
    );

    if (!chapterExists && replacementNumber !== nextChapterNumber) {
      throw new Error(
        `Chapter ${replacementNumber} could not be found for rewriting.`,
      );
    }

    if (chapterExists) {
      return {
        ...story,
        chapters: story.chapters.map((chapter) =>
          chapter.number === replacementNumber
            ? {
                ...chapter,
                kind: chapterMetadata.kind ?? chapter.kind ?? "chapter",
                title: chapterMetadata.title.trim() || chapter.title,
                povCharacter:
                  chapterMetadata.povCharacter.trim() || chapter.povCharacter,
                content: content.trim(),
                updatedAt: now,
              }
            : chapter,
        ),
        updatedAt: now,
      };
    }
  }

  return {
    ...story,
    chapters: [
      ...story.chapters,
      {
        id: crypto.randomUUID(),
        number: nextChapterNumber,
        kind: chapterMetadata.kind ?? "chapter",
        title: chapterMetadata.title.trim() || `Chapter ${nextChapterNumber}`,
        povCharacter: chapterMetadata.povCharacter.trim(),
        content: content.trim(),
        createdAt: now,
        updatedAt: now,
      },
    ],
    updatedAt: now,
  };
}


