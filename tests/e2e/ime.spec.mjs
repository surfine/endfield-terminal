// The terminal's typing surface is the command bar, and Chinese is typed into
// it. The desk's IME ruling says an input a component draws is created once
// and afterwards only its value and caret are read or written — never
// rebuilt, never re-keyed, and never re-rendered while a composition is in
// flight.
//
//   npx playwright test tests/e2e/ime.spec.mjs

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

test("a Chinese composition in the command bar survives the window redrawing", async ({ page, context }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message || error)));
  await page.goto(`${url}?lang=zh`);
  await page.waitForSelector(".endfield-terminal-window");
  await page.waitForSelector(".endfield-coverage");
  await page.evaluate(() => {
    const field = document.querySelector("#endfield-query");
    window.__ime = { field, events: [], composing: false };
    for (const type of ["compositionstart", "compositionupdate", "compositionend"]) {
      document.addEventListener(type, (event) => {
        if (event.target !== window.__ime.field) return;
        window.__ime.events.push(type);
        window.__ime.composing = type !== "compositionend";
      });
    }
  });
  const cdp = await context.newCDPSession(page);
  await page.click("#endfield-query");

  await cdp.send("Input.imeSetComposition", { text: "旁", selectionStart: 1, selectionEnd: 1 });
  const first = await page.evaluate(() => {
    const field = document.querySelector("#endfield-query");
    return {
      same: field === window.__ime.field,
      focused: document.activeElement === field,
      value: field.value,
      composing: window.__ime.composing,
      caret: field.selectionStart,
    };
  });
  expect(first).toMatchObject({ same: true, focused: true, value: "旁", composing: true, caret: 1 });
  // The window re-rendered under the composition: the Session menu now offers a query.
  expect((await page.evaluate(() => window.__probeHost.menu)).available["endfield-run-query"]).toBe(true);

  await cdp.send("Input.imeSetComposition", { text: "旁白", selectionStart: 2, selectionEnd: 2 });
  const second = await page.evaluate(() => {
    const field = document.querySelector("#endfield-query");
    return {
      same: field === window.__ime.field,
      focused: document.activeElement === field,
      value: field.value,
      composing: window.__ime.composing,
      caret: field.selectionStart,
      events: window.__ime.events.slice(),
    };
  });
  expect(second.same).toBe(true);
  expect(second.value).toBe("旁白");
  expect(second.composing).toBe(true);
  expect(second.caret).toBe(2);
  expect(second.events.filter((type) => type === "compositionstart")).toHaveLength(1);

  await cdp.send("Input.insertText", { text: "旁白" });
  await page.waitForTimeout(200);
  await expect(page.locator("#endfield-query")).toHaveValue("旁白");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".endfield-sources", { timeout: 15000 });
  await expect(page.locator(".endfield-answer h3")).toHaveText("旁白");
  expect(errors).toEqual([]);
});
