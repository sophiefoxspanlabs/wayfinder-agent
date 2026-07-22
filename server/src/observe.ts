import type { Page } from "playwright";

export async function observePage(page: Page) {
  await page
    .waitForLoadState("domcontentloaded", {
      timeout: 10_000,
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
        const body = document.body;

        if (!body) {
          return false;
        }

        const text =
          body.innerText?.trim() ||
          body.textContent?.trim() ||
          "";

        return text.length > 20;
      },
      {
        timeout: 8_000,
      },
    )
    .catch(() => undefined);

  return await page.evaluate(() => {
    const selectors = [
      "a",
      "button",
      "input",
      "textarea",
      "select",
      "[role='button']",
      "[role='link']",
      "[contenteditable='true']",
    ].join(",");

    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(selectors),
    )
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      })
      .slice(0, 40)
      .map((element, index) => {
        const id = `e${index + 1}`;
        element.setAttribute("data-agent-id", id);

        return {
          id,
          tag: element.tagName.toLowerCase(),
          text:
            element.innerText?.trim() ||
            element.getAttribute("aria-label") ||
            element.getAttribute("placeholder") ||
            element.getAttribute("name") ||
            element.getAttribute("title") ||
            "",
          type: element.getAttribute("type"),
          role: element.getAttribute("role"),
          href:
            element instanceof HTMLAnchorElement
              ? element.href
              : null,
        };
      });

    const bodyText =
      document.body?.innerText?.trim() ||
      document.body?.textContent?.trim() ||
      "";

    return {
      title: document.title || "Untitled page",
      url: window.location.href,
      visibleText: bodyText
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2500),
      elements,
      pageHasContent: bodyText.length > 20,
    };
  });
}