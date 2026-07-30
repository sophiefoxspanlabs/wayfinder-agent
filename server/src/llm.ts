import type { MemoryForModel } from "./agentMemory.js";

interface PageElement {
  id: string;
  tag: string;
  text: string;
  type: string | null;
  role: string | null;
  href?: string | null;
}

interface PageState {
  title: string;
  url: string;
  visibleText: string;
  elements: PageElement[];
}

export interface AgentDecision {
  reason: string;
  action:
  | "click"
  | "type"
  | "press"
  | "scroll"
  | "wait"
  | "finish"
  | "fail";
  target?: string;
  text?: string;
  key?: string;
  amount?: number;
  result?: string;
}

interface DecideNextActionInput {
  task: string;
  pageState: PageState;
  previousActions: AgentDecision[];
  memory: MemoryForModel;
  lastError?: string | null;
}
const STATIC_AGENT_PROMPT = `
You are a browser agent.

Your job is to complete the user's task using the fewest necessary actions.

Decision process:
- First determine whether the task can be completed from the current page state.
- If the requested information is already visible, use "finish".
- Only click, type, or scroll when the current page is missing information required for the task.
- Do not navigate merely to gather more context.
- Do not open an item when the user only asked to identify, list, compare, summarize, or extract visible information.
- Preserve the page's current meaning, ordering, filters, and context unless the user explicitly asks to change them.
- Every action must directly reduce missing information needed to complete the task.

Return exactly one JSON object using one of these actions:

Valid formats:

{"action":"click","target":"e1","reason":"why this click is required"}

{"action":"type","target":"e1","text":"text to enter","reason":"why typing is required"}

{"action":"press","target":"e1","key":"Enter","reason":"why pressing the key is required"}

{"action":"scroll","amount":800,"reason":"why scrolling is required"}

{"action":"wait","reason":"why waiting is required"}

{"action":"finish","result":"final answer","reason":"the requested information is available"}

{"action":"fail","result":"explanation","reason":"why the task cannot be completed"}

The action must be a string in the "action" field.
Do not nest the decision under an action name.
Scroll amount must be a number, not text.
Do not include markdown.
`;

function extractJson(content: string): unknown {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new Error("The model did not return valid JSON.");
    }

    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function validateDecision(value: unknown): AgentDecision {
  if (!value || typeof value !== "object") {
    throw new Error("The model returned an invalid decision.");
  }

  const decision = value as Partial<AgentDecision>;

  const permittedActions = new Set<AgentDecision["action"]>([
    "click",
    "type",
    "press",
    "scroll",
    "wait",
    "finish",
    "fail",
  ]);

  if (
    typeof decision.action !== "string" ||
    !permittedActions.has(decision.action as AgentDecision["action"])
  ) {
    throw new Error("The model returned an unsupported action.");
  }

  if (
    typeof decision.reason !== "string" ||
    decision.reason.trim().length === 0
  ) {
    throw new Error("The model did not explain its action.");
  }

  if (
    ["click", "type", "press"].includes(decision.action) &&
    (typeof decision.target !== "string" ||
      decision.target.trim().length === 0)
  ) {
    throw new Error(
      `The ${decision.action} action requires a valid target element ID.`,
    );
  }

  if (
    decision.action === "type" &&
    typeof decision.text !== "string"
  ) {
    throw new Error("The type action requires text.");
  }

  if (
    decision.action === "press" &&
    typeof decision.key !== "string"
  ) {
    throw new Error("The press action requires a key.");
  }

  if (
    decision.action === "scroll" &&
    decision.amount !== undefined &&
    typeof decision.amount !== "number"
  ) {
    throw new Error("The scroll amount must be a number.");
  }

  if (
    ["finish", "fail"].includes(decision.action) &&
    (typeof decision.result !== "string" ||
      decision.result.trim().length === 0)
  ) {
    throw new Error(
      `The ${decision.action} action requires a result message.`,
    );
  }

  return decision as AgentDecision;
}

export async function decideNextAction({
  task,
  pageState,
  previousActions,
  memory,
  lastError,
}: DecideNextActionInput): Promise<AgentDecision> {
  const apiKey = process.env.GROQ_API_KEY;
  const model =
    process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing from server/.env.");
  }

  const limitedElements = pageState.elements.slice(0, 15);

  const availableIds = new Set(
    limitedElements.map((element) => element.id),
  )

  const userPrompt = JSON.stringify(
    {
      task,
      currentPage: {
        title: pageState.title,
        url: pageState.url,
        visibleText: pageState.visibleText,
        elements: limitedElements,
      },
      availableElementIds: [...availableIds],
      memory,
      previousActions: previousActions.slice(-4),
      lastError: lastError ?? null,
    },
    null,
    2,
  );

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_completion_tokens: 500,
        messages: [
          {
            role: "system",
            content: STATIC_AGENT_PROMPT,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        response_format: {
          type: "json_object",
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();

    console.error("Groq request failed:", {
      status: response.status,
      body: errorText,
    });

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = Number(retryAfterHeader ?? 20);

      const waitMilliseconds =
        (Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds
          : 20) *
        1000 +
        500;

      console.log(
        `Groq rate limit reached. Waiting ${waitMilliseconds}ms before retrying.`,
      );

      await new Promise((resolve) =>
        setTimeout(resolve, waitMilliseconds),
      );

      return decideNextAction({
        task,
        pageState,
        previousActions,
        memory,
        lastError,
      });
    }

    throw new Error(
      `Groq request failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_tokens_details?: {
        cached_tokens?: number;
      };
    };
  };
  
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const cachedTokens =
    data.usage?.prompt_tokens_details?.cached_tokens ?? 0;

  const cacheHitRate =
    promptTokens > 0
      ? ((cachedTokens / promptTokens) * 100).toFixed(1)
      : "0.0";

  console.log("Groq prompt cache:", {
    model,
    promptTokens,
    cachedTokens,
    cacheHitRate: `${cacheHitRate}%`,
    completionTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
  });

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    console.error("Groq returned an empty response:", data);
    throw new Error("Groq returned an empty response.");
  }

  try {
    const parsed = extractJson(content);
    const decision = validateDecision(parsed);

    if (
      decision.target &&
      !availableIds.has(decision.target)
    ) {
      throw new Error(
        `The model selected an element that does not exist: ${decision.target}`,
      );
    }

    console.log("Valid Groq decision:", decision);

    return decision;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error("Invalid Groq decision:", {
      rawContent: content,
      error: message,
      availableElementIds: [...availableIds],
      pageUrl: pageState.url,
      pageTitle: pageState.title,
    });

    throw error;
  }
}