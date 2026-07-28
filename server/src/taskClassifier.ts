export type TaskType =
  | "website_summary"
  | "extract_information"
  | "open_link"
  | "search"
  | "shopping"
  | "form"
  | "unknown";

export interface ClassifiedTask {
  type: TaskType;
  confidence: number;
  requestedCount?: number;
  keywords: string[];
}

function extractRequestedCount(task: string): number | undefined {
  const match = task.match(
    /\b(?:top|first|find|list|show)\s+(\d+)\b/i,
  );

  if (!match) {
    return undefined;
  }

  const count = Number(match[1]);

  return Number.isFinite(count) ? count : undefined;
}

function extractKeywords(task: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "to",
    "of",
    "on",
    "in",
    "for",
    "and",
    "is",
    "are",
    "this",
    "that",
    "website",
    "page",
    "please",
    "me",
  ]);

  return task
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 2 &&
        !stopWords.has(word),
    )
    .slice(0, 12);
}

export function classifyTask(task: string): ClassifiedTask {
  const normalized = task.toLowerCase().trim();
  const requestedCount = extractRequestedCount(task);
  const keywords = extractKeywords(task);

  if (
    /\bwhat (is|does) (this|the) (website|page)\b/.test(
      normalized,
    ) ||
    normalized.includes("what is this website for") ||
    normalized.includes("summarize this website") ||
    normalized.includes("explain what this website does")
  ) {
    return {
      type: "website_summary",
      confidence: 0.95,
      requestedCount,
      keywords,
    };
  }

  if (
    normalized.includes("buy") ||
    normalized.includes("price") ||
    normalized.includes("cheapest") ||
    normalized.includes("product") ||
    normalized.includes("amazon")
  ) {
    return {
      type: "shopping",
      confidence: 0.85,
      requestedCount,
      keywords,
    };
  }

  if (
    normalized.includes("search for") ||
    normalized.startsWith("search ") ||
    normalized.includes("look up")
  ) {
    return {
      type: "search",
      confidence: 0.85,
      requestedCount,
      keywords,
    };
  }

  if (
    normalized.includes("open ") ||
    normalized.includes("click ") ||
    normalized.includes("go to ")
  ) {
    return {
      type: "open_link",
      confidence: 0.8,
      requestedCount,
      keywords,
    };
  }

  if (
    normalized.includes("fill out") ||
    normalized.includes("submit") ||
    normalized.includes("enter my") ||
    normalized.includes("complete the form")
  ) {
    return {
      type: "form",
      confidence: 0.85,
      requestedCount,
      keywords,
    };
  }

  if (
    normalized.includes("find") ||
    normalized.includes("list") ||
    normalized.includes("extract") ||
    normalized.includes("identify") ||
    normalized.includes("top ")
  ) {
    return {
      type: "extract_information",
      confidence: 0.75,
      requestedCount,
      keywords,
    };
  }

  return {
    type: "unknown",
    confidence: 0.3,
    requestedCount,
    keywords,
  };
}