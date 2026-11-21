// Endfield Terminal on its own page, with the real kit: no desk means no
// archive, so the terminal says so and every question ends at the error card.
//
//   npx playwright test tests/e2e/standalone.spec.mjs

import { expect, test } from "@playwright/test";
import { SERVE, serveTree } from "./serve.mjs";

let server;
let url;

test.beforeAll(async () => {
  ({ server, url } = await serveTree(SERVE));
});

test.afterAll(async () => {
  await new Promise((done) => server.close(done));
});

test("draws the window and says the archive is unavailable", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message || error)));
  await page.goto(`${url}?lang=zh`);
  await page.waitForSelector(".endfield-terminal-window");
  await expect(page.locator("#endfield-terminal-count")).toHaveText("资料库不可用");
  await expect(page.locator(".endfield-question-list button")).toHaveCount(5);
  await expect(page.locator("#endfield-query")).toHaveAttribute("placeholder", "输入角色、任务、地点或剧情问题…");
  await expect(page.locator("#endfield-submit")).toHaveText("检索剧情");
  await expect(page.locator("#endfield-recent-list button")).toHaveCount(5);
  await expect(page.locator(".endfield-match-list .endfield-empty")).toHaveText(
    "输入问题后检索本地《明日方舟：终末地》资料库。",
  );
  expect(errors).toEqual([]);
});

test("asks, and reports the archive it could not reach", async ({ page }) => {
  await page.goto(`${url}?lang=zh`);
  await page.waitForSelector(".endfield-terminal-window");
  await page.fill("#endfield-query", "旁白是谁");
  await page.press("#endfield-query", "Enter");
  await expect(page.locator(".endfield-output .endfield-error")).toBeVisible();
  await expect(page.locator(".endfield-error h3")).toHaveText("无法查询剧情资料库");
  await expect(page.locator("[data-retry-query]")).toHaveAttribute("data-retry-query", "旁白是谁");
  // The question is kept and selected in the sidebar.
  await expect(page.locator(".endfield-recent-item.is-selected")).toContainText("旁白是谁");
});

test("speaks both languages", async ({ page }) => {
  await page.goto(`${url}?lang=en`);
  await page.waitForSelector(".endfield-terminal-window");
  await expect(page.locator("#endfield-submit")).toHaveText("Search archive");
  await expect(page.locator("#endfield-query")).toHaveAttribute(
    "placeholder",
    "Ask about a character, mission, place, or plot point…",
  );
  await expect(page.locator(".endfield-sidebar-head h3")).toHaveText("Questions & history");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
});
