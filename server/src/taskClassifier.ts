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
  scores: Record<TaskType, number>;
}

const taskTypes: TaskType[] = [
  "website_summary",
  "extract_information",
  "open_link",
  "search",
  "shopping",
  "form",
  "unknown",
];

const stopWords = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "on",
  "in",
  "and",
  "is",
  "are",
  "this",
  "that",
  "please",
  "me",
  "my",
  "can",
  "could",
  "would",
  "you",
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .filter(Boolean);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  if (a.length === 0) {
    return b.length;
  }

  if (b.length === 0) {
    return a.length;
  }

  const previousRow = Array.from(
    { length: b.length + 1 },
    (_, index) => index,
  );

  for (let i = 1; i <= a.length; i += 1) {
    const currentRow = [i];

    for (let j = 1; j <= b.length; j += 1) {
      const insertionCost = currentRow[j - 1] + 1;
      const deletionCost = previousRow[j] + 1;
      const substitutionCost =
        previousRow[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);

      currentRow[j] = Math.min(
        insertionCost,
        deletionCost,
        substitutionCost,
      );
    }

    for (let j = 0; j < currentRow.length; j += 1) {
      previousRow[j] = currentRow[j];
    }
  }

  return previousRow[b.length];
}

function similarity(a: string, b: string): number {
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);

  const longestLength = Math.max(
    normalizedA.length,
    normalizedB.length,
  );

  if (longestLength === 0) {
    return 1;
  }

  const distance = levenshteinDistance(
    normalizedA,
    normalizedB,
  );

  return 1 - distance / longestLength;
}

function isFuzzyMatch(
  word: string,
  target: string,
): boolean {
  if (word === target) {
    return true;
  }

  if (word.length <= 3 || target.length <= 3) {
    return false;
  }

  const lengthDifference = Math.abs(
    word.length - target.length,
  );

  if (lengthDifference > 2) {
    return false;
  }

  const threshold =
    Math.max(word.length, target.length) >= 8
      ? 0.72
      : 0.78;

  return similarity(word, target) >= threshold;
}

function hasFuzzyWord(
  words: string[],
  targets: string[],
): boolean {
  return words.some((word) =>
    targets.some((target) =>
      isFuzzyMatch(word, target),
    ),
  );
}

function countFuzzyMatches(
  words: string[],
  targets: string[],
): number {
  const matchedTargets = new Set<string>();

  for (const target of targets) {
    if (
      words.some((word) =>
        isFuzzyMatch(word, target),
      )
    ) {
      matchedTargets.add(target);
    }
  }

  return matchedTargets.size;
}

function hasPhrase(
  normalizedTask: string,
  phrases: string[],
): boolean {
  return phrases.some((phrase) =>
    normalizedTask.includes(
      normalizeText(phrase),
    ),
  );
}

function extractRequestedCount(
  task: string,
): number | undefined {
  const normalized = normalizeText(task);

  const digitMatch = normalized.match(
    /\b(?:top|first|find|list|show|get|give)\s+(\d+)\b/,
  );

  if (digitMatch) {
    const count = Number(digitMatch[1]);

    if (Number.isFinite(count)) {
      return count;
    }
  }

  const numberWords: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  const wordMatch = normalized.match(
    /\b(?:top|first|find|list|show|get|give)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/,
  );

  if (!wordMatch) {
    return undefined;
  }

  return numberWords[wordMatch[1]];
}

function extractKeywords(task: string): string[] {
  return tokenize(task)
    .filter(
      (word) =>
        word.length > 2 &&
        !stopWords.has(word),
    )
    .slice(0, 12);
}

function createEmptyScores(): Record<TaskType, number> {
  return {
    website_summary: 0,
    extract_information: 0,
    open_link: 0,
    search: 0,
    shopping: 0,
    form: 0,
    unknown: 0,
  };
}

function addScore(
  scores: Record<TaskType, number>,
  type: TaskType,
  points: number,
): void {
  scores[type] += points;
}

function scoreWebsiteSummary(
  normalizedTask: string,
  words: string[],
  scores: Record<TaskType, number>,
): void {
  const summaryVerbs = [
    "explain",
    "summarize",
    "describe",
    "overview",
    "understand",
    "tell",
  ];

  const websiteWords = [
    "website",
    "webpage",
    "page",
    "site",
    "domain",
  ];

  const purposeWords = [
    "purpose",
    "about",
    "does",
    "used",
    "for",
    "meaning",
  ];

  addScore(
    scores,
    "website_summary",
    countFuzzyMatches(words, summaryVerbs) * 3,
  );

  addScore(
    scores,
    "website_summary",
    countFuzzyMatches(words, websiteWords) * 3,
  );

  addScore(
    scores,
    "website_summary",
    countFuzzyMatches(words, purposeWords) * 2,
  );

  if (
    hasPhrase(normalizedTask, [
      "what is this",
      "what does this",
      "what is the website",
      "what does the website",
      "what is this for",
      "what is it for",
    ])
  ) {
    addScore(scores, "website_summary", 4);
  }

  if (
    hasFuzzyWord(words, summaryVerbs) &&
    hasFuzzyWord(words, websiteWords)
  ) {
    addScore(scores, "website_summary", 4);
  }

  if (
    hasFuzzyWord(words, websiteWords) &&
    hasFuzzyWord(words, purposeWords)
  ) {
    addScore(scores, "website_summary", 3);
  }
}

function scoreExtraction(
  normalizedTask: string,
  words: string[],
  scores: Record<TaskType, number>,
  requestedCount?: number,
): void {
  const extractionVerbs = [
    "find",
    "list",
    "extract",
    "identify",
    "show",
    "give",
    "get",
    "collect",
    "return",
  ];

  const resultWords = [
    "article",
    "articles",
    "result",
    "results",
    "headline",
    "headlines",
    "item",
    "items",
    "link",
    "links",
    "name",
    "names",
    "title",
    "titles",
    "information",
    "details",
  ];

  const rankingWords = [
    "top",
    "first",
    "best",
    "latest",
    "highest",
    "lowest",
    "most",
  ];

  addScore(
    scores,
    "extract_information",
    countFuzzyMatches(words, extractionVerbs) * 3,
  );

  addScore(
    scores,
    "extract_information",
    countFuzzyMatches(words, resultWords) * 2,
  );

  addScore(
    scores,
    "extract_information",
    countFuzzyMatches(words, rankingWords) * 2,
  );

  if (requestedCount !== undefined) {
    addScore(scores, "extract_information", 4);
  }

  if (
    hasFuzzyWord(words, extractionVerbs) &&
    hasFuzzyWord(words, resultWords)
  ) {
    addScore(scores, "extract_information", 3);
  }

  if (
    hasPhrase(normalizedTask, [
      "top articles",
      "top stories",
      "first results",
      "list the",
      "show the",
      "find the",
    ])
  ) {
    addScore(scores, "extract_information", 3);
  }
}

function scoreNavigation(
  normalizedTask: string,
  words: string[],
  scores: Record<TaskType, number>,
): void {
  const navigationVerbs = [
    "open",
    "click",
    "visit",
    "navigate",
    "follow",
    "select",
    "choose",
    "press",
  ];

  const navigationTargets = [
    "link",
    "button",
    "menu",
    "tab",
    "page",
    "article",
    "result",
  ];

  addScore(
    scores,
    "open_link",
    countFuzzyMatches(words, navigationVerbs) * 4,
  );

  addScore(
    scores,
    "open_link",
    countFuzzyMatches(words, navigationTargets) * 1,
  );

  if (
    hasPhrase(normalizedTask, [
      "go to",
      "take me to",
      "open the",
      "click the",
      "visit the",
    ])
  ) {
    addScore(scores, "open_link", 4);
  }

  if (
    hasFuzzyWord(words, navigationVerbs) &&
    hasFuzzyWord(words, navigationTargets)
  ) {
    addScore(scores, "open_link", 3);
  }
}

function scoreSearch(
  normalizedTask: string,
  words: string[],
  scores: Record<TaskType, number>,
): void {
  const searchVerbs = [
    "search",
    "lookup",
    "google",
    "query",
    "research",
  ];

  const searchContext = [
    "find",
    "internet",
    "web",
    "online",
    "results",
  ];

  addScore(
    scores,
    "search",
    countFuzzyMatches(words, searchVerbs) * 4,
  );

  addScore(
    scores,
    "search",
    countFuzzyMatches(words, searchContext),
  );

  if (
    hasPhrase(normalizedTask, [
      "search for",
      "look up",
      "google",
      "search the web",
      "find online",
    ])
  ) {
    addScore(scores, "search", 5);
  }
}

function scoreShopping(
  normalizedTask: string,
  words: string[],
  scores: Record<TaskType, number>,
): void {
  const shoppingWords = [
    "buy",
    "purchase",
    "price",
    "cost",
    "cheapest",
    "expensive",
    "product",
    "item",
    "cart",
    "checkout",
    "amazon",
    "store",
    "shop",
    "shopping",
    "deal",
    "discount",
  ];

  const comparisonWords = [
    "compare",
    "best",
    "cheapest",
    "lowest",
    "affordable",
  ];

  addScore(
    scores,
    "shopping",
    countFuzzyMatches(words, shoppingWords) * 3,
  );

  addScore(
    scores,
    "shopping",
    countFuzzyMatches(words, comparisonWords) * 2,
  );

  if (
    hasPhrase(normalizedTask, [
      "add to cart",
      "buy this",
      "find the cheapest",
      "compare prices",
      "product page",
    ])
  ) {
    addScore(scores, "shopping", 5);
  }
}

function scoreForm(
  normalizedTask: string,
  words: string[],
  scores: Record<TaskType, number>,
): void {
  const formVerbs = [
    "fill",
    "submit",
    "enter",
    "complete",
    "apply",
    "register",
    "signup",
    "login",
    "signin",
    "upload",
  ];

  const formTargets = [
    "form",
    "field",
    "application",
    "account",
    "email",
    "password",
    "address",
    "name",
    "details",
  ];

  addScore(
    scores,
    "form",
    countFuzzyMatches(words, formVerbs) * 4,
  );

  addScore(
    scores,
    "form",
    countFuzzyMatches(words, formTargets),
  );

  if (
    hasPhrase(normalizedTask, [
      "fill out",
      "sign up",
      "log in",
      "sign in",
      "submit the form",
      "complete the form",
      "enter my",
    ])
  ) {
    addScore(scores, "form", 5);
  }

  if (
    hasFuzzyWord(words, formVerbs) &&
    hasFuzzyWord(words, formTargets)
  ) {
    addScore(scores, "form", 3);
  }
}

function calculateConfidence(
  winnerScore: number,
  runnerUpScore: number,
): number {
  if (winnerScore <= 0) {
    return 0.3;
  }

  const separation = winnerScore - runnerUpScore;
  const scoreStrength = Math.min(
    winnerScore / 12,
    1,
  );
  const separationStrength = Math.min(
    separation / 6,
    1,
  );

  const confidence =
    0.45 +
    scoreStrength * 0.35 +
    separationStrength * 0.2;

  return Number(
    Math.min(confidence, 0.99).toFixed(2),
  );
}

export function classifyTask(
  task: string,
): ClassifiedTask {
  const normalizedTask = normalizeText(task);
  const words = tokenize(task);
  const requestedCount =
    extractRequestedCount(task);
  const keywords = extractKeywords(task);
  const scores = createEmptyScores();

  scoreWebsiteSummary(
    normalizedTask,
    words,
    scores,
  );

  scoreExtraction(
    normalizedTask,
    words,
    scores,
    requestedCount,
  );

  scoreNavigation(
    normalizedTask,
    words,
    scores,
  );

  scoreSearch(
    normalizedTask,
    words,
    scores,
  );

  scoreShopping(
    normalizedTask,
    words,
    scores,
  );

  scoreForm(
    normalizedTask,
    words,
    scores,
  );

  const rankedTypes = taskTypes
    .filter((type) => type !== "unknown")
    .sort(
      (a, b) =>
        scores[b] - scores[a],
    );

  const winningType = rankedTypes[0];
  const runnerUpType = rankedTypes[1];

  const winnerScore =
    scores[winningType];
  const runnerUpScore =
    scores[runnerUpType];

  const confidence =
    calculateConfidence(
      winnerScore,
      runnerUpScore,
    );

  const isTooWeak =
    winnerScore < 4;

  const isTooAmbiguous =
    winnerScore - runnerUpScore < 2 &&
    winnerScore < 8;

  if (isTooWeak || isTooAmbiguous) {
    scores.unknown = Math.max(
      1,
      runnerUpScore,
    );

    return {
      type: "unknown",
      confidence: 0.3,
      requestedCount,
      keywords,
      scores,
    };
  }

  return {
    type: winningType,
    confidence,
    requestedCount,
    keywords,
    scores,
  };
}