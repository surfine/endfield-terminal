// The desk's contract "endfield-source-cards", carried into the app's own
// suite. The desk used to load the old plain-JS renderers in a vm and drive
// them against a document; the desk now pins this minified build and cannot
// run that source, so the same assertions run here against the same fixture.
// The builders return HTML strings, so a tiny parser (below) stands in for a
// document: it keeps order, attribute values and text, which is all the old
// assertions read.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { Terminal } from "../../src/app/terminal.ts";
import { PROGRESS_VALUES } from "../../src/data/endfield.ts";
import { translate } from "../../src/strings/index.ts";
import { type FakeHost, fakeHost } from "./fake-host.ts";

const t = (key: Parameters<typeof translate>[1], ...args: (string | number)[]) => translate("zh", key, ...args);

// --- a tiny HTML parser and selector engine -------------------------------

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: (Node | string)[];
  parent: Node | null;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&");

const VOID = new Set(["br", "img", "input", "hr"]);

function parse(html: string): Node {
  const root: Node = { tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root;
  const token =
    /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  for (let m = token.exec(html); m; m = token.exec(html)) {
    if (m[1]) {
      let n: Node | null = cur;
      while (n && n.tag !== m[1]) n = n.parent;
      if (n?.parent) cur = n.parent;
    } else if (m[2]) {
      const attrs: Record<string, string> = {};
      for (const a of (m[3] ?? "").matchAll(/([^\s=>/]+)(?:="([^"]*)")?/g))
        attrs[a[1] as string] = decodeEntities(a[2] ?? "");
      const node: Node = { tag: m[2], attrs, children: [], parent: cur };
      cur.children.push(node);
      if (!VOID.has(m[2]) && !m[4]) cur = node;
    } else if (m[5] !== undefined) {
      cur.children.push(decodeEntities(m[5]));
    }
  }
  return root;
}

const text = (n: Node | string | undefined | null): string =>
  n === undefined || n === null ? "" : typeof n === "string" ? n : n.children.map(text).join("");

const classes = (n: Node) => (n.attrs.class ?? "").split(/\s+/).filter(Boolean);

// A compound: tag? .class* [attr] | [attr="v"] | :not(.class)
function compound(sel: string): (n: Node) => boolean {
  const tag = /^[a-z][\w-]*/i.exec(sel)?.[0];
  const cls = [...sel.matchAll(/(?<!\()\.([\w-]+)(?![^(]*\))/g)].map((x) => x[1] as string);
  const attrs = [...sel.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((x) => [x[1] as string, x[2]] as const);
  const not = [...sel.matchAll(/:not\(\.([\w-]+)\)/g)].map((x) => x[1] as string);
  return (n) =>
    (!tag || n.tag === tag) &&
    cls.every((c) => classes(n).includes(c)) &&
    attrs.every(([k, v]) => k in n.attrs && (v === undefined || n.attrs[k] === v)) &&
    not.every((c) => !classes(n).includes(c));
}

function all(root: Node, selector: string): Node[] {
  const parts = selector.trim().split(/\s+/).map(compound);
  const out: Node[] = [];
  const walk = (n: Node) => {
    for (const c of n.children) {
      if (typeof c === "string") continue;
      const last = parts[parts.length - 1] as (n: Node) => boolean;
      if (last(c)) {
        // every earlier part must match some ancestor, in order
        let i = parts.length - 2;
        for (let a = c.parent; a && i >= 0; a = a.parent) if ((parts[i] as (n: Node) => boolean)(a)) i -= 1;
        if (i < 0) out.push(c);
      }
      walk(c);
    }
  };
  walk(root);
  return out;
}
const one = (root: Node, selector: string): Node | undefined => all(root, selector)[0];

// --- the fixture, verbatim from the desk contract -------------------------

const fixture = {
  query: "管理员什么时候认识的提弗洛斯？",
  answer:
    "结论 档案写的是旅途中「偶遇」【1】；报到语音说「按当时约定」【2】。\n留白 第一次见面是否雪松林，对话未收录【3】。",
  results: [
    {
      missionId: "op-tifloss",
      missionUrl: "https://endfield.example/op/tifloss",
      lineIndex: 2,
      missionTitle: "提弗洛斯",
      section: "干员档案",
      process: "人事简述",
      speaker: "人事简述",
      text: "在追寻萨米失落传说的旅途中与管理员偶遇",
      kind: "档案",
      version: "v1.5",
      versionBasis: "dataset",
      missionIndex: null,
      chapterKey: null,
    },
    {
      missionTitle: "提弗洛斯",
      section: "干员语音",
      process: "干员报到",
      speaker: "提弗洛斯",
      text: "管理员，我按当时约定的来找你。",
      kind: "语音",
      version: "v1.5",
      versionBasis: "dataset",
      missionIndex: null,
      chapterKey: null,
    },
    {
      missionTitle: "迷雾藏起松林",
      section: "任务",
      process: "",
      speaker: "秦茳尺",
      text: "管理员，安德烈那家伙到武陵了吗？",
      kind: "通讯",
      version: "v1.5",
      versionBasis: "mission",
      missionIndex: 260,
      chapterKey: "v1_5",
    },
    {
      missionTitle: "共饮一江水",
      section: "Main Missions",
      chapter: "Chapter II",
      process: "Process III",
      speaker: "汤汤",
      text: "妈妈说，无事献殷勤，非奸即盗。",
      kind: "对话",
      version: "v1.4",
      versionBasis: "mission",
      missionIndex: 60,
      chapterKey: "chapter2",
    },
  ],
};

// --- a desk that answers with the fixture and keeps what was clipped -------

interface Rig {
  host: FakeHost;
  terminal: Terminal;
  clipped: { name: string; blob: Blob }[];
  clipOk: boolean;
}

function rig(): Rig {
  const host = fakeHost();
  const state: Rig = { host, terminal: null as unknown as Terminal, clipped: [], clipOk: true };
  const original = host.client.call.bind(host.client) as unknown as (
    m: string,
    p: Record<string, unknown>,
  ) => Promise<unknown>;
  host.client.call = (async (method: string, params: Record<string, unknown>) => {
    if (method === "service.request" && params.name === "endfield.ask") {
      return {
        ok: true,
        query: fixture.query,
        answer: fixture.answer,
        results: fixture.results,
        meta: { questionType: "general" },
      };
    }
    if (method === "intent.dispatch" && params.intent === "clip") {
      if (!state.clipOk) return { ok: false, reason: "not-mounted" };
      for (const item of params.items as { name: string; blob: Blob }[]) state.clipped.push(item);
      return { ok: true };
    }
    return original(method, params);
  }) as unknown as typeof host.client.call;
  state.terminal = new Terminal(host.client);
  return state;
}

const articleOf = (r: Rig) => parse(r.terminal.article.value.html);
const button = (label: string) =>
  ({ dataset: { clipSource: "" }, textContent: label, disabled: false }) as unknown as HTMLButtonElement & {
    dataset: { clipSource: string };
  };

beforeEach(() => {
  (globalThis as unknown as { document: unknown }).document = {
    documentElement: { lang: "" },
    getElementById: () => null,
    querySelector: () => null,
  };
});

describe("desk contract endfield-source-cards", () => {
  it("welcome: five question buttons, each carrying data-query", () => {
    const r = rig();
    r.terminal.renderTerminal();
    const doc = articleOf(r);
    const buttons = all(doc, ".endfield-question-list .btn");
    expect(buttons.length).toBe(5);
    expect(buttons.every((b) => Boolean(b.attrs["data-query"]))).toBe(true);
  });

  it("progress select: options in order, default all", () => {
    const r = rig();
    r.terminal.renderTerminal();
    expect(r.terminal.progressOptions.value.map((o) => o.value)).toEqual([
      "prologue",
      "chapter1",
      "chapter2",
      "v1_5",
      "all",
    ]);
    expect(r.terminal.progress.value).toBe("all");
    // the select's own data-progress-order attribute, as the old test read it
    const source = readFileSync(new URL("../../src/ui/StatusBar.tsx", import.meta.url), "utf8");
    const order = /data-progress-order="([^"]*)"/.exec(source)?.[1] ?? "";
    expect(order.split(",")).toEqual(["prologue", "chapter1", "chapter2", "v1_5", "all"]);
    expect([...PROGRESS_VALUES]).toEqual(order.split(","));
  });

  it("answer under progress all: cards, groups, track, verdicts, citations, sidebar", async () => {
    const r = rig();
    r.terminal.renderTerminal();
    await r.terminal.ask(fixture.query);
    const doc = articleOf(r);
    expect(all(doc, ".endfield-source").length).toBe(5);
    const missing = all(doc, ".endfield-source.is-missing");
    expect(missing.length === 1 && missing[0]?.attrs["data-kind"] === "对话").toBe(true);
    expect(Boolean(text(one(doc, ".endfield-mission .endfield-source-kind")))).toBe(true);
    expect(text(one(doc, ".endfield-mission .endfield-stamp"))).toBe("v1.5");
    expect(all(doc, ".endfield-mission").length).toBe(4);
    expect(Boolean(one(doc, ".endfield-track"))).toBe(true);
    expect(all(doc, ".endfield-track-stop").length).toBe(4);
    expect(text(one(doc, '.endfield-track-stop[data-chapter="v1_5"] b'))).toBe("1");
    expect(all(doc, ".endfield-track-stop.is-ahead").length).toBe(0);
    expect(one(doc, ".endfield-source-quote .endfield-context")).toBeUndefined();
    const verdicts = all(doc, ".endfield-verdict");
    const labels = verdicts.map((v) => text(one(v, "b")));
    expect(verdicts.length).toBe(2);
    expect(Boolean(labels[0]) && Boolean(labels[1]) && labels[0] !== labels[1]).toBe(true);
    expect(all(doc, ".endfield-inline-citation").length).toBe(3);

    const side = parse(r.terminal.matchList.value);
    const groups = all(side, ".endfield-source-group").map((g) => `${text(one(g, "span"))} ${text(one(g, "small"))}`);
    expect(groups.length === 5 && groups.every((g) => g.endsWith(" 1"))).toBe(true);
  });

  it("progress chapter1: two cards, fold row, ahead stops, gap note", async () => {
    const r = rig();
    r.terminal.renderTerminal();
    r.terminal.progress.value = "chapter1";
    await r.terminal.ask(fixture.query);
    const doc = articleOf(r);
    expect(all(doc, ".endfield-source").length).toBe(2);
    expect(Boolean(one(doc, ".endfield-fold"))).toBe(true);
    expect(all(doc, ".endfield-track-stop.is-ahead").length).toBe(2);
    expect(Boolean(one(doc, ".endfield-track-note .is-gap"))).toBe(true);
  });

  it("source links and speaker/line on cards, missing URLs stated", async () => {
    const r = rig();
    r.terminal.renderTerminal();
    await r.terminal.ask(fixture.query);
    const doc = articleOf(r);
    const firstCard = one(doc, ".endfield-source:not(.is-missing)");
    const firstGroup = one(doc, ".endfield-mission");
    const link = firstGroup ? one(firstGroup, "[data-source-url]") : undefined;
    expect(link?.attrs.href).toBe("https://endfield.example/op/tifloss");
    expect(link?.attrs.rel === "noopener" && link?.attrs.target === "_blank").toBe(true);
    expect(Boolean(text(firstCard && one(firstCard, ".endfield-source-speaker")))).toBe(true);
    expect(Boolean(text(firstCard && one(firstCard, ".endfield-source-line")))).toBe(true);
    const withoutUrl = all(doc, ".endfield-mission").filter((g) => !one(g, "[data-source-url]"));
    expect(withoutUrl.length).toBe(3);
    expect(withoutUrl.every((g) => Boolean(one(g, "[data-source-url-missing]")))).toBe(true);
  });

  it("clip: success disables the button and the file keeps URL, entry, version, question and quote", async () => {
    const r = rig();
    r.terminal.renderTerminal();
    await r.terminal.ask(fixture.query);
    const first = one(articleOf(r), "[data-clip-source]");
    const btn = button(t("endfield_clip_source"));
    btn.dataset.clipSource = first?.attrs["data-clip-source"] ?? "";
    await r.terminal.clipSource(btn);
    expect(btn.disabled).toBe(true);
    const body = await r.clipped[0]?.blob.text();
    expect(body).toContain("https://endfield.example/op/tifloss");
    expect(body).toContain("op-tifloss");
    expect(body).toContain("v1.5");
    expect(body).toContain(fixture.query);
    expect(body).toContain("在追寻萨米失落传说的旅途中与管理员偶遇");
  });

  it("clip: a refusal leaves the button live and does not claim success", async () => {
    const r = rig();
    r.terminal.renderTerminal();
    await r.terminal.ask(fixture.query);
    r.clipOk = false;
    const first = one(articleOf(r), "[data-clip-source]");
    const btn = button(t("endfield_clip_source"));
    btn.dataset.clipSource = first?.attrs["data-clip-source"] ?? "";
    await r.terminal.clipSource(btn);
    expect(btn.disabled).not.toBe(true);
    expect(btn.textContent).not.toBe(t("endfield_clipped"));
  });
});
