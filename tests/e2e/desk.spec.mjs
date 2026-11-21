// Endfield Terminal inside the desk: the same page in the host's frame,
// reached through the bridge.
//
//   DESK_URL=http://127.0.0.1:4399 npx playwright test tests/e2e/desk.spec.mjs
//
// The desk must be running with this app pinned (`apps:pin --from-dir`) and
// served (`npm start` with its own PORT). No answer is asked for here: the
// archive's service needs the writer's own archive and model, and the app's
// own specs already cover the service's answer path.

import { expect, test } from "@playwright/test";

const deskUrl = process.env.DESK_URL || "";

test.skip(!deskUrl, "no desk running: set DESK_URL to a desk that has this app pinned");

test("the frame connects to the desk and draws the terminal", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message || error)));
  await page.goto(deskUrl);
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 60_000 });
  await page.evaluate(() => openWindow("endfieldTerminal"));

  const host = page.locator('[data-window="endfieldTerminal"]');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute("data-host", "ready", { timeout: 30_000 });
  const frame = page.frameLocator('[data-window="endfieldTerminal"] iframe');
  await frame.locator(".endfield-terminal-window").waitFor({ timeout: 30_000 });

  const appearance = await frame.locator("html").getAttribute("data-appearance");
  expect(appearance).toBeTruthy();
  expect(appearance).not.toBe("standalone");

  // The archive's own line: a count when the desk has the corpus, the
  // unavailable line when it does not. Either way the terminal drew it.
  await expect(frame.locator("#endfield-terminal-count")).not.toHaveText("-- lines");
  await expect(frame.locator(".endfield-question-list button")).toHaveCount(5);
  await frame.locator("#endfield-query").fill("旁白");
  await expect(frame.locator("#endfield-submit")).toBeEnabled();
  expect(errors).toEqual([]);
});
