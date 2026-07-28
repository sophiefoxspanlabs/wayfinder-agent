import type { AgentDecision } from "./llm.js";

export interface MemoryFact {
  key: string;
  value: string;
  sourceUrl: string;
}

export interface FailedAction {
  action: string;
  target?: string;
  error: string;
}

export interface AgentMemory {
  task: string;
  currentGoal: string;
  completedGoals: string[];
  facts: MemoryFact[];
  failedActions: FailedAction[];
  visitedUrls: string[];
  lastPageTitle: string;
  lastPageSummary: string;
}

export interface MemoryForModel {
  currentGoal: string;
  completedGoals: string[];
  facts: MemoryFact[];
  failedActions: FailedAction[];
  visitedUrls: string[];
  lastPageTitle: string;
  lastPageSummary: string;
}

export function createAgentMemory(
  task: string,
  startingUrl: string,
): AgentMemory {
  return {
    task,
    currentGoal: task,
    completedGoals: [],
    facts: [],
    failedActions: [],
    visitedUrls: [startingUrl],
    lastPageTitle: "",
    lastPageSummary: "",
  };
}

export function recordVisitedPage(
  memory: AgentMemory,
  url: string,
  title: string,
  visibleText: string,
): void {
  if (
    url &&
    memory.visitedUrls[memory.visitedUrls.length - 1] !== url
  ) {
    memory.visitedUrls.push(url);
  }

  memory.lastPageTitle = title;

  memory.lastPageSummary = visibleText
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function recordSuccessfulAction(
  memory: AgentMemory,
  decision: AgentDecision,
): void {
  if (decision.action === "click") {
    memory.completedGoals.push(
      `Clicked element ${decision.target ?? "unknown"}.`,
    );
  }

  if (decision.action === "type") {
    memory.completedGoals.push(
      `Entered text into element ${decision.target ?? "unknown"}.`,
    );
  }

  if (decision.action === "press") {
    memory.completedGoals.push(
      `Pressed ${decision.key ?? "a key"} on element ${
        decision.target ?? "unknown"
      }.`,
    );
  }

  if (decision.action === "scroll") {
    memory.completedGoals.push("Scrolled the page.");
  }

  if (decision.action === "wait") {
    memory.completedGoals.push("Waited for the page to load.");
  }

  memory.completedGoals =
    memory.completedGoals.slice(-6);
}

export function recordFailedAction(
  memory: AgentMemory,
  decision: AgentDecision,
  error: string,
): void {
  memory.failedActions.push({
    action: decision.action,
    target: decision.target,
    error,
  });

  memory.failedActions =
    memory.failedActions.slice(-4);
}

export function getMemoryForModel(
  memory: AgentMemory,
): MemoryForModel {
  return {
    currentGoal: memory.currentGoal,
    completedGoals:
      memory.completedGoals.slice(-3),
    facts: memory.facts.slice(-8),
    failedActions:
      memory.failedActions.slice(-3),
    visitedUrls: memory.visitedUrls.slice(-4),
    lastPageTitle: memory.lastPageTitle,
    lastPageSummary: memory.lastPageSummary,
  };
}