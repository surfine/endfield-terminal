// Endfield Terminal against a stand-in desk: the archive's meta, an answer
// with its evidence, the reader's progress, a clipped source, a refusal and
// the desk-made evidence launch.
//
//   npx playwright test tests/e2e/hosted.spec.mjs

import { expect, test } from "@playwright/test";
import { SERVE, serveTree } from "./serve.mjs";

let server;
let url;

test.beforeAll(async () => {
  ({ server, url } = await serveTree(SERVE, { hosted: true }));
});

test.afterAll(async () => {
  await new Promise((done) => server.close(done));
});

const boot = async (page, lang = "zh") => {
  await page.goto(`${url}?lang=${lang}`);
  await page.waitForSelector(".endfield-terminal-window");
  await page.waitForSelector(".endfield-coverage");
};

const ask = async (page) => {
  await page.click(".endfield-question-list button");
  await page.waitForSelector(".endfield-sources");
  await page.waitForTimeout(300);
};

test("reads the archive's meta into the stamps, the route and the welcome", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message || error)));
  await boot(page);
  await expect(page.locator("#endfield-terminal-count")).toHaveText("20641 条原文");
  await expect(page.locator("#endfield-terminal-route")).toContainText("v1.5");
  await expect(page.locator("#endfield-terminal-route")).toContainText("⚠");
  await expect(page.locator(".endfield-stamps .endfield-stamp")).toHaveCount(4);
  await expect(page.locator(".endfield-coverage dt").first()).toHaveText("25");
  await expect(page.locator(".endfield-question-list button").first()).toContainText("库里有");
  await expect(page.locator(".endfield-question-list button").last()).toContainText("没有");
  expect(errors).toEqual([]);
});

test("answers with evidence, gaps, a verdict and linked citations", async ({ page }) => {
  await boot(page);
  await ask(page);
  await expect(page.locator(".endfield-answer h3")).toHaveText("管理员什么时候认识的提弗洛斯？");
  await expect(page.locator(".endfield-kicker")).toContainText("EVIDENCE");
  await expect(page.locator(".endfield-track-stop")).toHaveCount(4);
  await expect(page.locator(".endfield-source")).toHaveCount(8);
  await expect(page.locator(".endfield-source.is-continued")).toHaveCount(1);
  await expect(page.locator(".endfield-source.is-missing")).toHaveCount(2);
  await expect(page.locator(".endfield-source-link")).toHaveCount(3);
  await expect(page.locator("[data-source-url-missing]")).toHaveCount(2);
  await expect(page.locator(".endfield-verdict")).toHaveCount(2);
  await expect(page.locator(".endfield-inline-citation")).toHaveCount(2);
  // The sidebar now lists the kinds this answer drew on.
  await expect(page.locator(".endfield-source-group")).toHaveCount(4);
});

test("a citation chip opens the evidence it names", async ({ page }) => {
  await boot(page);
  await ask(page);
  await page.click("[data-endfield-citation]");
  await page.waitForTimeout(200);
  const focused = await page.evaluate(() => document.activeElement?.id ?? "");
  expect(focused).toBe("endfield-evidence-1");
});

test("clips one source to the File Floppy, with its own file name", async ({ page }) => {
  await boot(page);
  await ask(page);
  await page.locator("[data-clip-source]").first().click();
  await expect(page.locator("[data-clip-source]").first()).toHaveText("已剪进软盘");
  await expect(page.locator("[data-clip-source]").first()).toBeDisabled();
  const clips = await page.evaluate(() => window.__probeHost.exports);
  expect(clips).toHaveLength(1);
  expect(clips[0].items[0]).toMatchObject({ name: "对话-source-1.md", type: "text/markdown" });
  expect(clips[0].items[0].bytes).toBeGreaterThan(40);
});

test("gates the answer on the reader's own progress, and re-asks", async ({ page }) => {
  await boot(page);
  await ask(page);
  await page.selectOption("#endfield-progress", "chapter1");
  await page.waitForTimeout(500);
  await expect(page.locator("[data-endfield-fold]")).toBeVisible();
  await expect(page.locator(".endfield-track-stop.is-current")).toHaveAttribute("data-chapter", "chapter1");
  await expect(page.locator(".endfield-source")).toHaveCount(5);
  const asks = await page.evaluate(() => window.__probeHost.asks);
  expect(asks).toBe(2);
});

test("a refused query offers the question again, and the retry answers", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__probeHost.outcome = "fail";
  });
  await page.fill("#endfield-query", "雪祀最后怎么样了");
  await page.press("#endfield-query", "Enter");
  await expect(page.locator(".endfield-error")).toBeVisible();
  await expect(page.locator(".endfield-error h3")).toHaveText("无法查询剧情资料库");
  await page.evaluate(() => {
    window.__probeHost.outcome = "ok";
  });
  await page.click("[data-retry-query]");
  await page.waitForSelector(".endfield-sources");
  await expect(page.locator(".endfield-answer h3")).toHaveText("雪祀最后怎么样了");
});

test("a new session drops the answer and keeps the questions history", async ({ page }) => {
  await boot(page);
  await ask(page);
  await page.click("#endfield-new-session");
  await expect(page.locator(".endfield-welcome")).toBeVisible();
  await expect(page.locator(".endfield-source")).toHaveCount(0);
  await expect(page.locator(".endfield-recent-item").first()).toContainText("管理员什么时候认识的提弗洛斯");
  await expect(page.locator("#endfield-query")).toHaveValue("");
});

test("the desk's language switch re-labels the chrome and leaves the answer alone", async ({ page }) => {
  await boot(page);
  await ask(page);
  await page.evaluate(() => window.__probeHost.changeLanguage("en"));
  await expect(page.locator(".endfield-sidebar-head h3")).toHaveText("Questions & history");
  await expect(page.locator("#endfield-submit")).toHaveText("Search archive");
  // The answer keeps the language it was drawn in, as it always has.
  await expect(page.locator(".endfield-answer h3")).toHaveText("管理员什么时候认识的提弗洛斯？");
});

test("a desk-made launch jumps to its evidence line", async ({ page }) => {
  await boot(page);
  await ask(page);
  await page.evaluate(() => window.__probeHost.pushLaunch({ evidence: 2 }));
  await expect(page.locator("#endfield-evidence-2")).toHaveClass(/is-flash/);
});

test("tells the desk which Session rows can work", async ({ page }) => {
  await boot(page);
  const welcomeMenu = await page.evaluate(() => window.__probeHost.menu);
  expect(welcomeMenu.available["endfield-run-query"]).toBe(false);
  expect(welcomeMenu.available["endfield-new-session"]).toBe(true);
  await page.fill("#endfield-query", "旁白");
  await page.waitForTimeout(150);
  const typedMenu = await page.evaluate(() => window.__probeHost.menu);
  expect(typedMenu.available["endfield-run-query"]).toBe(true);
  await ask(page);
  const answeredMenu = await page.evaluate(() => window.__probeHost.menu);
  expect(answeredMenu.available["endfield-menu-clip"]).toBe(true);
});
