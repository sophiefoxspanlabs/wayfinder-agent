import { chromium } from "playwright";
import { observePage } from "./observe.js";

export async function inspectWebsite(url: string) {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    return await observePage(page);
  } finally {
    await browser.close();
  }
}