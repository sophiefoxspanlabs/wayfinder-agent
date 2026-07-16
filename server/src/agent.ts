import { chromium } from "playwright";
import { observePage } from "./observe.js";
import {
  decideNextAction,
  type AgentDecision,
} from "./llm.js";

export interface AgentLog {
  step: number;
  action: string;
  reason: string;
  status: "success" | "error";
  error?: string;
}

export interface AgentResult {
  success: boolean;
  result: string;
  finalUrl: string;
  screenshot?: string;
  logs: AgentLog[];
}

async function executeAction(
  page: import("playwright").Page,
  decision: AgentDecision,
): Promise<void> {
  switch (decision.action) {
    case "click": {
      if (!decision.target) {
        throw new Error("Click requires a target.");
      }

      await page
        .locator(`[data-agent-id="${decision.target}"]`)
        .click({ timeout: 10_000 });

      break;
    }

    case "type": {
      if (!decision.target) {
        throw new Error("Type requires a target.");
      }

      await page
        .locator(`[data-agent-id="${decision.target}"]`)
        .fill(decision.text ?? "", { timeout: 10_000 });

      break;
    }

    case "press": {
      if (!decision.target) {
        throw new Error("Press requires a target.");
      }

      await page
        .locator(`[data-agent-id="${decision.target}"]`)
        .press(decision.key ?? "Enter", { timeout: 10_000 });

      break;
    }

    case "scroll": {
      await page.mouse.wheel(0, decision.amount ?? 700);
      break;
    }

    case "wait": {
      await page.waitForTimeout(1200);
      break;
    }

    case "finish":
    case "fail":
      break;

    default:
      throw new Error(`Unsupported action: ${decision.action}`);
  }

  await page
    .waitForLoadState("domcontentloaded", {
      timeout: 5000,
    })
    .catch(() => undefined);

  await page.waitForTimeout(500);
}

export async function runAgent(
  url: string,
  task: string,
): Promise<AgentResult> {
  const browser = await chromium.launch({
    headless: true,
  });

  const logs: AgentLog[] = [];
  const previousActions: AgentDecision[] = [];

  try {
    const context = await browser.newContext({
      viewport: {
        width: 1280,
        height: 800,
      },
    });

    const page = await context.newPage();

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    let lastError: string | null = null;

    for (let step = 1; step <= 15; step++) {
      const pageState = await observePage(page);

      let decision: AgentDecision;

      try {
        decision = await decideNextAction({
          task,
          pageState,
          previousActions,
          lastError,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown AI error";

        logs.push({
          step,
          action: "AI decision",
          reason: "The model could not produce a valid action.",
          status: "error",
          error: message,
        });

        lastError = message;
        continue;
      }

      previousActions.push(decision);

      if (decision.action === "finish") {
        const screenshotBuffer = await page.screenshot({
          type: "jpeg",
          quality: 60,
        });

        return {
          success: true,
          result: decision.result ?? "Task completed.",
          finalUrl: page.url(),
          screenshot: `data:image/jpeg;base64,${screenshotBuffer.toString(
            "base64",
          )}`,
          logs: [
            ...logs,
            {
              step,
              action: "finish",
              reason: decision.reason,
              status: "success",
            },
          ],
        };
      }

      if (decision.action === "fail") {
        return {
          success: false,
          result: decision.result ?? "The task could not be completed.",
          finalUrl: page.url(),
          logs: [
            ...logs,
            {
              step,
              action: "fail",
              reason: decision.reason,
              status: "error",
            },
          ],
        };
      }

      try {
        await executeAction(page, decision);

        logs.push({
          step,
          action: decision.action,
          reason: decision.reason,
          status: "success",
        });

        lastError = null;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown browser error";

        logs.push({
          step,
          action: decision.action,
          reason: decision.reason,
          status: "error",
          error: message,
        });

        lastError = message;
      }
    }

    return {
      success: false,
      result: "The agent reached its 15-step limit.",
      finalUrl: page.url(),
      logs,
    };
  } finally {
    await browser.close();
  }
}