export type StoryIntent =
  | "create_story"
  | "continue_story"
  | "rewrite_chapter"
  | "update_story"
  | "brainstorm"
  | "general_chat";

export function detectStoryIntent(message: string): StoryIntent {
  const text = message.toLowerCase();

  if (
    text.includes("create a story") ||
    text.includes("start a story") ||
    text.includes("new story")
  ) {
    return "create_story";
  }

  if (
    text.includes("continue the story") ||
    text.includes("next chapter") ||
    text.includes("continue writing")
  ) {
    return "continue_story";
  }

  if (
    text.includes("rewrite chapter") ||
    text.includes("rewrite this chapter") ||
    text.includes("change chapter")
  ) {
    return "rewrite_chapter";
  }

  if (
    text.includes("rename") ||
    text.includes("update the story") ||
    text.includes("change the story bible")
  ) {
    return "update_story";
  }

  if (
    text.includes("brainstorm") ||
    text.includes("give me ideas") ||
    text.includes("suggest a subplot")
  ) {
    return "brainstorm";
  }

  return "general_chat";
}
