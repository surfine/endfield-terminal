// The terminal's article builders: the welcome, the searching state, an
// answer's evidence and its verdicts. They are pure string builders, so the
// unit tests can hold them to the markup the shipped page drew.

import { describe, expect, it } from "vitest";
import { asAnswer, asMeta, asRecentQueries, asResults, LEGACY_DEFAULT_QUERIES } from "../../src/data/endfield.ts";
import { translate } from "../../src/strings/index.ts";
import {
  clipDocument,
  coverageHtml,
  errorHtml,
  inlineCitations,
  kindLabel,
  markdownHtml,
  matchGroups,
  matchListHtml,
  missingCount,
  progressLabel,
  progressTrackHtml,
  resultsHtml,
  routeLabel,
  searchingHtml,
  sourceCardsHtml,
  stampParts,
  verdictBlocks,
  welcomeHtml,
} from "../../src/view/article.ts";

const t = (key: Parameters<typeof translate>[1], ...args: (string | number)[]) => translate("zh", key, ...args);

const result = (overrides: Partial<Parameters<typeof sourceCardsHtml>[0][number]> = {}) => ({
  kind: "对话",
  missionId: "m-01",
  missionTitle: "序章 · 落地",
  process: "主线",
  section: "",
  chapter: "序章",
  chapterKey: "prologue",
  speaker: "提弗洛斯",
  text: "管理员？这个名字我记住了。",
  lineIndex: 41,
  version: "v1.5",
  versionBasis: "mission",
  missionIndex: 0,
  missionUrl: "https://example.org/m/01",
  url: "",
  ...overrides,
});

describe("markdownHtml", () => {
  it("escapes, then draws bold, emphasis and line breaks", () => {
    expect(markdownHtml("**结论** 与 *旁白* <b>")).toBe("<strong>结论</strong> 与 <em>旁白</em> &lt;b&gt;");
    expect(markdownHtml("一行\n两行")).toBe("一行<br>两行");
  });

  it("is empty for no text", () => {
    expect(markdownHtml("")).toBe("");
  });
});

describe("labels", () => {
  it("names a kind, with dialogue as the default", () => {
    expect(kindLabel("日志", t)).toBe("日志");
    expect(kindLabel("中枢档案", t)).toBe("中枢档案");
    expect(kindLabel("unknown", t)).toBe("对话");
  });

  it("names a progress stop", () => {
    expect(progressLabel("chapter1", t)).toBe("第一章");
    expect(progressLabel("all", t)).toBe("全部");
  });

  it("names the route from the answer's metrics", () => {
    expect(routeLabel(null, t)).toBe("本地");
    expect(routeLabel({ provider: "lmstudio", model: "m" }, t)).toBe("本地 / m");
    expect(routeLabel({ provider: "deepseek", model: "" }, t)).toBe("云端");
    expect(routeLabel({ provider: "", model: "m" }, t)).toBe("本地 / m");
  });
});

describe("stamps and coverage", () => {
  it("collapses one shared version to a single stamp and keeps a mixed one split", () => {
    const meta = asMeta({ kindVersions: { dialogue: "v1.5", log: "v1.5", files: "v1.5" } });
    const parts = stampParts(meta, t);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('<span class="endfield-stamp">v1.5</span>');
    const mixed = stampParts(asMeta({ kindVersions: { dialogue: "v1.5", files: "v1.4" } }), t);
    expect(mixed[0]).toContain("对话 v1.5");
    expect(mixed[1]).toContain("档案 v1.4");
  });

  it("always names the structure gap", () => {
    expect(stampParts(null, t).at(-1)).toContain("is-gap");
  });

  it("states the archive's counts only once the meta arrived", () => {
    expect(coverageHtml(null, t)).toBe("");
    const html = coverageHtml(asMeta({ missionCount: 25, transcriptLineCount: 20641 }), t);
    expect(html).toContain("25");
    expect(html).toContain("20,641");
    expect(html).toContain("任务");
  });
});

describe("the searching state", () => {
  it("names the steps and the route", () => {
    const html = searchingHtml("管理员是谁", asMeta({ transcriptLineCount: 20641 }), "本地 / m", t);
    expect(html).toContain("SEARCHING");
    expect(html).toContain("管理员是谁");
    expect(html).toContain("20,641 行");
    expect(html).toContain("本地 / m");
  });

  it("survives a missing meta", () => {
    expect(searchingHtml("q", null, "本地", t)).toContain("本地");
  });
});

describe("the progress track", () => {
  it("counts the lines each stop found and marks the reader's stop", () => {
    const html = progressTrackHtml([result(), result({ chapterKey: "chapter1" })], 2, "chapter1", t);
    expect(html).toContain('data-chapter="prologue"');
    expect(html).toContain('<b data-count="1">1</b>');
    expect(html).toContain("is-current");
    expect(html).toContain("未到进度 2 条");
  });

  it("names an unchaptered line and has no note for a clean answer", () => {
    expect(progressTrackHtml([result({ chapterKey: "" })], 0, "all", t)).toContain("不分章节 1 条");
    expect(progressTrackHtml([result()], 0, "all", t)).not.toContain("endfield-track-note");
  });
});

describe("the source cards", () => {
  it("groups consecutive lines of one mission and hides a repeated speaker", () => {
    const html = sourceCardsHtml([result(), result({ text: "第二句" })], "general", t);
    expect(html.match(/class="endfield-mission"/g)).toHaveLength(1);
    expect(html).toContain("is-continued");
    expect(html).toContain("第二句");
  });

  it("starts a new group when the mission changes", () => {
    const html = sourceCardsHtml([result(), result({ missionId: "m-02", missionTitle: "第一章" })], "general", t);
    expect(html.match(/class="endfield-mission"/g)).toHaveLength(2);
  });

  it("links the mission's address, or says the archive has none", () => {
    expect(sourceCardsHtml([result()], "general", t)).toContain('href="https://example.org/m/01"');
    expect(sourceCardsHtml([result({ missionUrl: "javascript:alert(1)" })], "general", t)).toContain(
      "data-source-url-missing",
    );
  });

  it("adds a missing-dialogue row for a log under a general question", () => {
    const html = sourceCardsHtml([result({ kind: "日志" })], "general", t);
    expect(html).toContain("is-missing");
    expect(missingCount([result({ kind: "日志" })], "general")).toBe(1);
    expect(missingCount([result({ kind: "日志" })], "who")).toBe(0);
  });
});

describe("the verdicts", () => {
  it("draws the verdict, the open gap and the rest as the body", () => {
    const html = verdictBlocks("结论：是他。\n留白：没有旁白。\n其他一句。", t);
    expect(html).toContain("结论");
    expect(html).toContain("是他。");
    expect(html).toContain("is-gap");
    expect(html).toContain("其他一句。");
  });

  it("drops the English tag when the label already says it", () => {
    const en = (key: Parameters<typeof translate>[1]) => translate("en", key);
    const html = verdictBlocks("结论：Verdict", en);
    expect(html).toContain("Verdict");
    expect(html).not.toContain(">VERDICT<");
  });
});

describe("citations", () => {
  it("turns 【n】 into a chip that names the evidence it opens", () => {
    expect(inlineCitations("参见【1】和【3】。", t)).toContain('data-endfield-citation="1"');
    expect(inlineCitations("没有引用", t)).toBe("没有引用");
  });
});

describe("the welcome", () => {
  it("offers the archive's questions and stamps the one it does not carry", () => {
    const html = welcomeHtml(null, t);
    expect(html.match(/data-query=/g)).toHaveLength(5);
    expect(html).toContain("没有");
    expect(html).toContain("endfield-stamp is-gap");
  });

  it("adds the coverage once the meta arrived", () => {
    expect(welcomeHtml(asMeta({ missionCount: 3 }), t)).toContain("endfield-coverage");
  });
});

describe("an answer and an error", () => {
  it("draws the kicker, the track, the cards and the verdict, with citations linked", () => {
    const html = resultsHtml(
      {
        query: "管理员是谁",
        results: [result()],
        foldedCount: 0,
        questionType: "general",
        progress: "all",
        answer: "结论：是他。参见【1】",
      },
      t,
    );
    expect(html).toContain("EVIDENCE");
    expect(html).toContain("管理员是谁");
    expect(html).toContain("endfield-inline-citation");
    expect(html).toContain("endfield-verdict");
  });

  it("names the fold when the progress gate hid lines", () => {
    const html = resultsHtml(
      { query: "q", results: [result()], foldedCount: 2, questionType: "general", progress: "prologue", answer: "" },
      t,
    );
    expect(html).toContain("data-endfield-fold");
  });

  it("offers a retry with the question it failed on", () => {
    expect(errorHtml("雪祀", t)).toContain('data-retry-query="雪祀"');
  });
});

describe("the sidebar list", () => {
  it("names its gaps and grows a bar per kind", () => {
    const groups = matchGroups([result(), result({ kind: "日志" })], 2, 1, t);
    expect(groups.map((group) => group.id)).toEqual(["kind:对话", "kind:日志", "missing", "folded"]);
    const html = matchListHtml(groups, "空");
    expect(html).toContain('style="width:100%"');
    expect(html).toContain('style="width:50%"');
    expect(html).toContain("is-gap");
  });

  it("says the empty line it was drawn with", () => {
    expect(matchListHtml([], "输入问题")).toBe('<p class="endfield-empty">输入问题</p>');
  });
});

describe("a clipped source", () => {
  it("carries the route, entry, line, version, link and question", () => {
    const body = clipDocument(result(), 1, "管理员是谁", t);
    expect(body).toContain("# 序章 · 落地 · 主线 · 序章 【1】");
    expect(body).toContain("> 管理员？这个名字我记住了。");
    expect(body).toContain("条目：m-01");
    expect(body).toContain("行号：42");
    expect(body).toContain("版本：v1.5");
    expect(body).toContain("原文链接：https://example.org/m/01");
    expect(body).toContain("提问：管理员是谁");
  });

  it("says so when the archive carries no link", () => {
    expect(clipDocument(result({ missionUrl: "", url: "" }), 2, "", t)).toContain("未收录");
  });
});

describe("the data guards", () => {
  it("reads an answer, its results and its metrics", () => {
    const answer = asAnswer({
      ok: true,
      query: "q",
      answer: "a",
      results: [result()],
      meta: { questionType: "general", foldedCount: 2 },
      ai_system6_metrics: { provider: "lmstudio", model: "m" },
    });
    expect(answer.results).toHaveLength(1);
    expect(answer.meta?.foldedCount).toBe(2);
    expect(answer.metrics).toEqual({ provider: "lmstudio", model: "m" });
  });

  it("keeps a missing fold distinct from a zero one", () => {
    expect(asAnswer({ results: [], meta: {} }).meta?.foldedCount).toBeUndefined();
    expect(asAnswer({ results: [], meta: { foldedCount: 0 } }).meta?.foldedCount).toBe(0);
  });

  it("is empty, not broken, for a reply that is not an answer", () => {
    expect(asResults(null)).toEqual([]);
    expect(asAnswer(null).results).toEqual([]);
    expect(asAnswer("nope").answer).toBe("");
  });

  it("migrates the pre-move default question list once", () => {
    const migrated = asRecentQueries([...LEGACY_DEFAULT_QUERIES]);
    expect(migrated.migrated).toBe(true);
    expect(migrated.queries).toHaveLength(5);
    const kept = asRecentQueries(["我自己的问题"]);
    expect(kept.migrated).toBe(false);
    expect(kept.queries[0]).toBe("我自己的问题");
    expect(kept.queries).toHaveLength(6);
  });

  it("caps the kept questions at eight and drops duplicates", () => {
    const many = Array.from({ length: 12 }, (_, index) => `问题 ${index}`);
    expect(asRecentQueries([...many, "问题 0"]).queries).toHaveLength(8);
    expect(asRecentQueries([]).queries).toHaveLength(5);
  });
});
