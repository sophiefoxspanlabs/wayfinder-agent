import type { Page } from "playwright";

export async function observePage(page: Page) {
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
      .slice(0, 100)
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
            "",
          type: element.getAttribute("type"),
          role: element.getAttribute("role"),
        };
      });

    return {
      title: document.title,
      url: window.location.href,
      visibleText: document.body.innerText
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 3000),
      elements,
    };
  });
}