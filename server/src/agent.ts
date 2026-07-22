import { chromium, type Page } from "playwright";
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

async function waitForPageContent(page: Page): Promise<void> {
  await page
    .waitForLoadState("domcontentloaded", {
      timeout: 15_000,
    })
    .catch(() => undefined);

  await page
    .locator("body")
    .waitFor({
      state: "attached",
      timeout: 10_000,
    })
    .catch(() => undefined);

  await page
    .waitForFunction(
      () => {
        const text =
          document.body?.innerText?.trim() ||
          document.body?.textContent?.trim() ||
          "";

        return text.length > 20;
      },
      {
        timeout: 10_000,
      },
    )
    .catch(() => undefined);

  await page.waitForTimeout(750);
}

async function executeAction(
  page: Page,
  decision: AgentDecision,
): Promise<Page> {
  switch (decision.action) {
    case "click": {
      if (!decision.target) {
        throw new Error("Click requires a target.");
      }

      const locator = page.locator(
        `[data-agent-id="${decision.target}"]`,
      );

      await locator.waitFor({
        state: "visible",
        timeout: 10_000,
      });

      const oldUrl = page.url();

      const navigationPromise = page
        .waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        })
        .catch(() => null);

      const popupPromise = page
        .context()
        .waitForEvent("page", {
          timeout: 5_000,
        })
        .catch(() => null);

      await locator.click({
        timeout: 10_000,
      });

      const popup = await popupPromise;

      let activePage = page;

      if (popup) {
        activePage = popup;
        await waitForPageContent(activePage);
      } else {
        await navigationPromise;

        if (page.url() === oldUrl) {
          await page.waitForTimeout(1_000);
        }

        await waitForPageContent(page);
      }

      const bodyText = await activePage
        .locator("body")
        .innerText()
        .catch(() => "");

      console.log("After click:", {
        oldUrl,
        currentUrl: activePage.url(),
        title: await activePage.title().catch(() => ""),
        textLength: bodyText.length,
        textPreview: bodyText.slice(0, 200),
        openedNewPage: Boolean(popup),
      });

      return activePage;
    }

    case "type": {
      if (!decision.target) {
        throw new Error("Type requires a target.");
      }

      await page
        .locator(`[data-agent-id="${decision.target}"]`)
        .fill(decision.text ?? "", {
          timeout: 10_000,
        });

      return page;
    }

    case "press": {
      if (!decision.target) {
        throw new Error("Press requires a target.");
      }

      const navigationPromise = page
        .waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        })
        .catch(() => null);

      await page
        .locator(`[data-agent-id="${decision.target}"]`)
        .press(decision.key ?? "Enter", {
          timeout: 10_000,
        });

      await navigationPromise;
      await waitForPageContent(page);

      return page;
    }

    case "scroll": {
      await page.mouse.wheel(0, decision.amount ?? 700);
      await page.waitForTimeout(500);

      return page;
    }

    case "wait": {
      await page.waitForTimeout(1_500);
      await waitForPageContent(page);

      return page;
    }

    case "finish":
    case "fail":
      return page;

    default:
      throw new Error(`Unsupported action: ${decision.action}`);
  }
}

function isBotChallenge(
  title: string,
  visibleText: string,
): boolean {
  const normalizedTitle = title.toLowerCase();
  const normalizedText = visibleText.toLowerCase();

  return (
    normalizedTitle.includes("just a moment") ||
    normalizedTitle.includes("access denied") ||
    normalizedTitle.includes("attention required") ||
    normalizedTitle.includes("verify you are human") ||
    normalizedText.includes("verify you are human") ||
    normalizedText.includes("checking your browser") ||
    normalizedText.includes("enable javascript and cookies") ||
    normalizedText.includes("security verification") ||
    normalizedText.includes("captcha")
  );
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

    let page = await context.newPage();

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await waitForPageContent(page);

    let lastError: string | null = null;
    let consecutiveAiErrors = 0;

    for (let step = 1; step <= 15; step++) {
      const pageState = await observePage(page);

      console.log("Observed page:", {
        step,
        url: pageState.url,
        title: pageState.title,
        visibleTextLength: pageState.visibleText.length,
        elementCount: pageState.elements.length,
      });

      console.log("Bot challenge check:", {
        step,
        url: pageState.url,
        title: pageState.title,
        textPreview: pageState.visibleText.slice(0, 500),
    });

      if (
        isBotChallenge(
          pageState.title,
          pageState.visibleText,
        )
      ) {
        return {
          success: false,
          result:
            "The destination website blocked the automated browser with a security verification page. The agent successfully opened the page, but it could not access the actual content.",
          finalUrl: page.url(),
          logs: [
            ...logs,
            {
              step,
              action: "blocked",
              reason:
                "The website displayed an anti-bot or human-verification challenge.",
              status: "error",
            },
          ],
        };
      }

      let decision: AgentDecision;

      try {
        decision = await decideNextAction({
          task,
          pageState,
          previousActions,
          lastError,
        });

        consecutiveAiErrors = 0;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown AI error";

        consecutiveAiErrors += 1;

        logs.push({
          step,
          action: "AI decision",
          reason: "The model could not produce a valid action.",
          status: "error",
          error: message,
        });

        lastError = message;

        if (consecutiveAiErrors >= 3) {
          return {
            success: false,
            result:
              "The AI returned three invalid actions in a row, so the agent stopped.",
            finalUrl: page.url(),
            logs,
          };
        }

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
          result:
            decision.result ?? "Task completed.",
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
          result:
            decision.result ??
            "The task could not be completed.",
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
        page = await executeAction(page, decision);

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