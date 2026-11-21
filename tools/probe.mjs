// The comparison probe: drives a built tree through the terminal's screens
// and records what a reader sees there — the DOM of the window, the computed
// style of the parts that carry the design, the menu state the window pushed,
// the clip it asked for, the title and the page language.
//
//   node tools/probe.mjs --tree <dir> --out <file> [--lang zh] [--headed]
//
// A stand-in desk is served in place of ais6-bridge.js, so both trees get the
// same archive, the same answer, the same refusal and the same launch. The
// probe is run once against the tree of the previous tag and once against the
// new one; tools/compare.mjs diffs the two JSON files.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";
import { HOST_SCRIPT } from "./host-stub.mjs";

const args = process.argv.slice(2);
const option = (name, fallback = "") => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const tree = resolve(option("tree"));
const out = resolve(option("out", "tools/out/probe.json"));
const lang = option("lang", "zh");
const headed = args.includes("--headed");

if (!existsSync(join(tree, "terminal", "index.html"))) {
  console.error(`NO  probe: ${tree} has no terminal/index.html`);
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function serve(root) {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
    if (path.endsWith("/ais6-bridge.js")) {
      response.writeHead(200, { "Content-Type": TYPES[".js"] });
      response.end(HOST_SCRIPT);
      return;
    }
    let file = join(root, path);
    if (!file.startsWith(root + sep) && file !== root) {
      response.writeHead(403).end("forbidden");
      return;
    }
    if (path.endsWith("/")) file = join(file, "index.html");
    try {
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not found" }));
    }
  });
  return new Promise((ready) => {
    server.listen(0, "127.0.0.1", () => ready({ server, port: server.address().port }));
  });
}

const STYLE_PROPERTIES = [
  "display",
  "position",
  "grid-template-columns",
  "grid-template-rows",
  "gap",
  "align-items",
  "justify-content",
  "width",
  "height",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-bottom-style",
  "border-top-color",
  "border-radius",
  "background-color",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration-line",
  "white-space",
  "overflow-x",
  "overflow-y",
  "opacity",
  "cursor",
];

const STYLE_SELECTORS = [
  "body",
  "#app",
  ".endfield-terminal-window",
  ".endfield-status-bar",
  ".endfield-stamps",
  ".endfield-stamp",
  ".endfield-progress",
  "#endfield-terminal-route",
  "#endfield-terminal-count",
  ".endfield-terminal-pane",
  ".endfield-sidebar",
  ".endfield-sidebar-head h3",
  ".endfield-recent-item",
  ".endfield-recent-item.is-selected",
  ".endfield-match-list",
  ".endfield-source-group",
  ".endfield-source-group.is-gap",
  ".endfield-empty",
  ".endfield-main",
  ".endfield-output",
  ".endfield-answer",
  ".endfield-kicker",
  ".endfield-kicker-tag",
  ".endfield-answer h3",
  ".endfield-coverage",
  ".endfield-question-list button",
  ".endfield-question-no",
  ".endfield-track",
  ".endfield-track-stop",
  ".endfield-track-stop.is-current",
  ".endfield-sources",
  ".endfield-mission",
  ".endfield-source-head",
  ".endfield-source-kind",
  ".endfield-mission-title",
  ".endfield-source",
  ".endfield-source.is-continued",
  ".endfield-source.is-missing",
  ".endfield-source-speaker",
  ".endfield-source-quote",
  ".endfield-source-line",
  ".endfield-inline-citation",
  ".endfield-verdict",
  ".endfield-verdict-label",
  ".endfield-verdict-body",
  ".endfield-fold",
  ".endfield-command-bar",
  ".endfield-query-field input",
  "#endfield-submit",
  ".endfield-answer.endfield-error",
];

const { server, port } = await serve(tree);
const base = `http://127.0.0.1:${port}/terminal/index.html`;
const browser = await chromium.launch({ headless: !headed, args: headed ? ["--use-angle=metal"] : [] });
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
await context.addInitScript(
  ({ selectors, properties }) => {
    window.__probeStyles = { selectors, properties };
    window.__probeSnapshot = () => {
      const serialize = (node) => {
        if (node.nodeType === 3) {
          const text = (node.textContent || "").replace(/\s+/g, " ").trim();
          return text ? { text } : null;
        }
        if (node.nodeType !== 1) return null;
        const attributes = {};
        for (const attribute of [...node.attributes].sort((a, b) => a.name.localeCompare(b.name))) {
          attributes[attribute.name] = attribute.value;
        }
        return {
          tag: node.tagName.toLowerCase(),
          attributes,
          children: [...node.childNodes].map(serialize).filter(Boolean),
        };
      };
      return serialize(document.getElementById("app"));
    };
  },
  { selectors: STYLE_SELECTORS, properties: STYLE_PROPERTIES },
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error?.message || error)));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("Failed to load resource"))
    errors.push(`console: ${message.text()}`);
});

const steps = [];
const record = async (name) => {
  steps.push({
    name,
    facts: await page.evaluate(() => {
      const styles = {};
      for (const selector of window.__probeStyles.selectors) {
        const element = document.querySelector(selector);
        if (!element) {
          styles[selector] = null;
          continue;
        }
        const computed = getComputedStyle(element);
        const properties = {};
        for (const property of window.__probeStyles.properties)
          properties[property] = computed.getPropertyValue(property);
        styles[selector] = properties;
      }
      const host = window.__probeHost || {};
      return {
        title: document.title,
        lang: document.documentElement.lang,
        appearance: document.documentElement.getAttribute("data-appearance"),
        oneBit: document.documentElement.getAttribute("data-one-bit"),
        menu: host.menu,
        exports: host.exports,
        status: host.status,
        lastTitle: host.titles ? host.titles[host.titles.length - 1] : null,
        styles,
      };
    }),
    dom: await page.evaluate(() => window.__probeSnapshot()),
  });
};

const ready = async () => {
  await page.waitForSelector(".endfield-terminal-window", { timeout: 15000 });
  await page.waitForSelector(".endfield-coverage", { timeout: 15000 });
  await page.waitForTimeout(400);
};
const settle = () => page.waitForTimeout(450);

try {
  await page.goto(`${base}?lang=${lang}`);
  await ready();
  await record("welcome");
  // The first suggestion is a real question: searching, then the answer.
  await page.click(".endfield-question-list button");
  await page.waitForSelector(".endfield-sources", { timeout: 15000 });
  await settle();
  await record("answer");
  await page.click("[data-clip-source]");
  await settle();
  await record("clipped");
  await page.click("[data-endfield-citation]");
  await page.waitForTimeout(900);
  await record("citation");
  // The reader's own progress: the desk folds the second answer.
  await page.selectOption("#endfield-progress", "chapter1");
  await page.waitForTimeout(700);
  await record("progress-chapter1");
  await page.selectOption("#endfield-progress", "all");
  await page.waitForTimeout(700);
  await record("progress-all");
  await page.click(".endfield-source-group");
  await page.waitForTimeout(300);
  await record("group");
  // A typed question, then a refusal and a retry.
  await page.fill("#endfield-query", "雪祀最后怎么样了");
  await page.press("#endfield-query", "Enter");
  await page.waitForSelector(".endfield-sources", { timeout: 15000 });
  await settle();
  await record("typed-answer");
  await page.evaluate(() => {
    window.__probeHost.outcome = "fail";
  });
  await page.press("#endfield-query", "Enter");
  await page.waitForSelector(".endfield-error", { timeout: 15000 });
  await settle();
  await record("error");
  await page.evaluate(() => {
    window.__probeHost.outcome = "ok";
  });
  await page.click("[data-retry-query]");
  await page.waitForSelector(".endfield-sources", { timeout: 15000 });
  await settle();
  await record("retried");
  // New session: the welcome comes back, and the questions kept are shown.
  await page.click("#endfield-new-session");
  await settle();
  await record("new-session");
  // A language switch from the desk re-labels the chrome; the drawn answer
  // keeps the language it was drawn in.
  await page.click(".endfield-question-list button");
  await page.waitForSelector(".endfield-sources", { timeout: 15000 });
  await settle();
  await page.evaluate(() => window.__probeHost.changeLanguage("en"));
  await page.waitForTimeout(400);
  await record("language-live");
  // A desk-made launch jumps to an evidence line.
  await page.evaluate(() => window.__probeHost.pushLaunch({ evidence: 2 }));
  await page.waitForTimeout(900);
  await record("launch");
  await page.reload();
  await ready();
  await record("reloaded");
} catch (error) {
  errors.push(`probe: ${String(error?.message || error)}`);
} finally {
  mkdirSync(resolve(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify({ tree, lang, steps, errors }, null, 2));
  await browser.close();
  server.close();
}

const failed = errors.length > 0;
console.log(`${failed ? "NO " : "OK "} probe ${tree}: ${steps.length} steps -> ${out}`);
for (const error of errors.slice(0, 10)) console.error(`   ${error}`);
process.exit(failed ? 1 : 0);
