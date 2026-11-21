// The terminal against a stand-in desk: what it asks for, what it draws, what
// it keeps and what the Session menu may offer.

import { beforeEach, describe, expect, it } from "vitest";
import { Terminal } from "../../src/app/terminal.ts";
import { type FakeHost, fakeHost } from "./fake-host.ts";

beforeEach(() => {
  (globalThis as unknown as { document: unknown }).document = {
    documentElement: { lang: "" },
    getElementById: () => null,
    querySelector: () => null,
  };
});

const asked = (host: FakeHost) => host.calls.filter((call) => call.name === "endfield.ask").length;

describe("the terminal", () => {
  it("keeps the archive's questions when nothing is saved", async () => {
    const host = fakeHost();
    const terminal = new Terminal(host.client);
    await terminal.start();
    expect(terminal.recent.value).toHaveLength(5);
    expect(terminal.recent.value[0]).toBe("管理员什么时候认识的提弗洛斯？");
  });

  it("migrates the pre-move default list once and writes it back", async () => {
    const host = fakeHost();
    host.state.set("recent", [
      "庄方宜和管理员是什么关系？",
      "陈千语在主线里参与了哪些事件？",
      "四号谷地和枢纽区基地有什么关系？",
      "艾尔黛拉的性格是什么样的？",
      "武陵城在主线剧情中发生了哪些事件？",
    ]);
    const terminal = new Terminal(host.client);
    await terminal.start();
    expect(terminal.recent.value[0]).toBe("管理员什么时候认识的提弗洛斯？");
    expect(host.state.get("recent")).toHaveLength(5);
  });

  it("asks the archive and draws the answer, its evidence and the route", async () => {
    const host = fakeHost();
    const terminal = new Terminal(host.client);
    terminal.renderTerminal();
    await terminal.ask("管理员什么时候认识的提弗洛斯？");
    expect(asked(host)).toBe(1);
    expect(terminal.article.value.html).toContain("EVIDENCE");
    expect(terminal.article.value.html).toContain("endfield-source-quote");
    expect(terminal.article.value.html).toContain("endfield-verdict");
    expect(terminal.article.value.html).toContain("endfield-inline-citation");
    expect(terminal.lastQuery.value).toBe("管理员什么时候认识的提弗洛斯？");
    expect(host.status?.text).toContain("Endfield:");
    expect(terminal.busy.value).toBe(false);
    expect(terminal.hasClipSource.value).toBe(true);
    expect(terminal.routeText.value).toContain("v1.5");
  });

  it("keeps the question in state and at the top of the list", async () => {
    const host = fakeHost();
    const terminal = new Terminal(host.client);
    await terminal.ask("旁白是谁");
    const saved = host.state.get("recent") as string[] | undefined;
    expect(saved?.[0]).toBe("旁白是谁");
    expect(terminal.recent.value[0]).toBe("旁白是谁");
    expect(terminal.recent.value.length).toBeLessThanOrEqual(8);
  });

  it("folds the answer locally when the reply carries no fold", async () => {
    const host = fakeHost();
    host.serverFold = false;
    const terminal = new Terminal(host.client);
    terminal.progress.value = "chapter1";
    await terminal.ask("q");
    expect(terminal.article.value.html).toContain("data-endfield-fold");
    expect(terminal.article.value.html).toContain("未到进度 1 条");
  });

  it("keeps the desk's own fold when the reply carries one", async () => {
    const host = fakeHost();
    const terminal = new Terminal(host.client);
    terminal.progress.value = "chapter1";
    await terminal.ask("q");
    expect(terminal.article.value.html).toContain("data-endfield-fold");
  });

  it("draws the error and offers the question again when the desk refuses", async () => {
    const host = fakeHost();
    host.outcome = "fail";
    const terminal = new Terminal(host.client);
    await terminal.ask("雪祀");
    expect(terminal.article.value.html).toContain("endfield-error");
    expect(terminal.article.value.html).toContain('data-retry-query="雪祀"');
    expect(terminal.hasClipSource.value).toBe(false);
    expect(host.status?.text).toContain("无法查询");
    host.outcome = "ok";
    await terminal.ask("雪祀");
    expect(terminal.article.value.html).toContain("EVIDENCE");
  });

  it("asks for a question before searching", async () => {
    const host = fakeHost();
    const terminal = new Terminal(host.client);
    await terminal.ask("   ");
    expect(asked(host)).toBe(0);
  });

  it("re-asks when the reader's progress changes", async () => {
    const host = fakeHost();
    const terminal = new Terminal(host.client);
    await terminal.ask("q");
    terminal.chooseProgress("chapter2");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(terminal.progress.value).toBe("chapter2");
    expect(asked(host)).toBe(2);
  });

  it("starts a new session: the welcome comes back and the context is cleared", async () => {
    const host = fakeHost();
    const terminal = new Terminal(host.client);
    await terminal.ask("q");
    terminal.reset();
    expect(terminal.lastQuery.value).toBe("");
    expect(terminal.article.value.html).toContain("endfield-welcome");
    expect(terminal.hasClipSource.value).toBe(false);
    expect(host.calls.some((call) => call.method === "context.publish")).toBe(true);
  });

  it("offers the Session menu rows only when they can work", async () => {
    const host = fakeHost();
    const terminal = new Terminal(host.client);
    expect(terminal.menuState.value.available["endfield-run-query"]).toBe(false);
    terminal.setQueryValue("旁白");
    expect(terminal.menuState.value.available["endfield-run-query"]).toBe(true);
    expect(terminal.menuState.value.available["endfield-menu-clip"]).toBe(false);
    await terminal.ask("旁白");
    expect(terminal.menuState.value.available["endfield-menu-clip"]).toBe(true);
    expect(terminal.menuState.value.available["endfield-new-session"]).toBe(true);
  });

  it("clips the source it rendered, with its own file name and markdown", async () => {
    const host = fakeHost();
    const terminal = new Terminal(host.client);
    await terminal.ask("q");
    const button = { dataset: { clipSource: "1" }, textContent: "", disabled: false } as unknown as HTMLButtonElement;
    await terminal.clipSource(button);
    expect(host.clips).toHaveLength(1);
    expect(host.clips[0]).toMatchObject({ name: "endfield-source-1.md", type: "text/markdown" });
    expect(host.clips[0]?.size).toBeGreaterThan(40);
    expect(button.textContent).toBe("已剪进软盘");
    expect(button.disabled).toBe(true);
  });

  it("says so when the clip was refused", async () => {
    const host = fakeHost();
    const original = host.client.call as unknown as (
      method: string,
      params: Record<string, unknown>,
    ) => Promise<unknown>;
    host.client.call = (async (method: string, params: Record<string, unknown>) =>
      method === "intent.dispatch"
        ? { ok: false, reason: "not-permitted" }
        : original(method, params)) as unknown as typeof host.client.call;
    const terminal = new Terminal(host.client);
    await terminal.ask("q");
    const button = { dataset: { clipSource: "1" }, textContent: "", disabled: false } as unknown as HTMLButtonElement;
    await terminal.clipSource(button);
    expect(button.textContent).toBe("没能剪进");
    expect(button.disabled).toBe(false);
  });

  it("runs the Session menu verbs the manifest names, and no other", async () => {
    const host = fakeHost();
    const terminal = new Terminal(host.client);
    terminal.queryEl = { value: "旁白", focus: () => undefined } as unknown as HTMLInputElement;
    terminal.setQueryValue("旁白");
    expect(await terminal.runMenuCommand("endfield-run-query")).toBe(true);
    expect(asked(host)).toBe(1);
    expect(await terminal.runMenuCommand("endfield-new-session")).toBe(true);
    expect(terminal.lastQuery.value).toBe("");
    expect(await terminal.runMenuCommand("endfield-nonsense")).toBe(false);
  });

  it("follows the desk's language for the chrome and keeps the drawn answer", async () => {
    const host = fakeHost();
    const terminal = new Terminal(host.client);
    await terminal.ask("q");
    const drawn = terminal.article.value.html;
    terminal.setLanguage("en");
    expect(terminal.article.value.html).toBe(drawn);
    expect(terminal.submitText.value).toBe("Search archive");
    expect(terminal.language.value).toBe("en");
  });
});
