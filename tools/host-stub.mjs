// The stand-in desk, served in place of ais6-bridge.js by the comparison
// probe and by the browser specs: an archive with its meta, a five-line
// answer that exercises the source cards, the gaps, the progress track and
// the verdict, a refusal, the clip hand-over, and a desk-made evidence launch.

export const HOST_SCRIPT = `(function () {
  "use strict";
  const meta = {
    gameVersion: "v1.5",
    oldestScrapedAt: "2026-01-02T00:00:00Z",
    datasets: [
      { id: "missions", scrapedAt: "2026-01-02T00:00:00Z", gameVersion: "v1.5" },
      { id: "operators", scrapedAt: "2026-01-09T00:00:00Z", gameVersion: "v1.5" },
      { id: "lore", scrapedAt: "2026-01-02T00:00:00Z", gameVersion: "v1.5" }
    ],
    kindVersions: { dialogue: "v1.5", log: "v1.5", files: "v1.4" },
    missionCount: 25,
    transcriptLineCount: 20641,
    operatorCount: 64,
    loreCount: 31
  };
  const results = [
    {
      kind: "对话", missionId: "m-01", missionTitle: "序章 · 落地", chapterKey: "prologue", chapter: "序章",
      process: "主线", speaker: "提弗洛斯", text: "管理员？这个名字我记住了。", lineIndex: 41,
      version: "v1.5", versionBasis: "mission", missionIndex: 0, missionUrl: "https://example.org/m/01"
    },
    {
      kind: "对话", missionId: "m-01", missionTitle: "序章 · 落地", chapterKey: "prologue", chapter: "序章",
      process: "主线", speaker: "提弗洛斯", text: "先别急着问，往前走。", lineIndex: 42,
      version: "v1.5", versionBasis: "mission", missionIndex: 0, missionUrl: "https://example.org/m/01"
    },
    {
      kind: "日志", missionId: "m-02", missionTitle: "第一章 · 盐碱地", chapterKey: "chapter1", chapter: "第一章",
      process: "支线", speaker: "管理员", text: "记录显示提弗洛斯先发现了失忆的管理员。", lineIndex: 7,
      version: "v1.5", versionBasis: "mission", missionIndex: 3, missionUrl: ""
    },
    {
      kind: "通讯", missionId: "m-03", missionTitle: "第二章 · 回声", chapterKey: "chapter2", chapter: "第二章",
      process: "通讯", speaker: "安玛", text: "旁白说完了这一句。", version: "v1.4", versionBasis: "dataset",
      missionIndex: 9, missionUrl: "https://example.org/m/03"
    },
    {
      kind: "对话", missionId: "m-04", missionTitle: "1.5 · 霜梦", chapterKey: "v1_5", chapter: "1.5",
      process: "活动", speaker: "萨米", text: "巨兽不是兽主。", lineIndex: 3, version: "v1.5",
      versionBasis: "mission", missionIndex: 12, missionUrl: "https://example.org/m/04"
    },
    {
      kind: "对话", missionId: "m-05", missionTitle: "", chapterKey: "", chapter: "", process: "", speaker: "",
      text: "一行没有出处的文字。", version: "", versionBasis: "", missionUrl: ""
    }
  ];
  const answerText = "结论：管理员先认识的是提弗洛斯。\\n留白：旁白是安玛还是萨米，档案里没有定论。\\n补充一句：以上只依据列出的原文。参见【1】【3】。";
  const host = { calls: [], menu: null, exports: [], titles: [], state: new Map(), outcome: "ok", asks: 0, listeners: {} };
  window.__probeHost = host;
  const params = new URLSearchParams(location.search);
  const language = params.get("lang") === "en" ? "en" : "zh";
  let launchListener = null;

  function foldByProgress(progress) {
    var order = { prologue: 1, chapter1: 2, chapter2: 3, v1_5: 4 };
    if (!progress || progress === "all") return { results: results, foldedCount: undefined };
    var threshold = order[progress];
    var kept = results.filter(function (item) {
      if (!item.chapterKey || order[item.chapterKey] === undefined) return true;
      return order[item.chapterKey] <= threshold;
    });
    return { results: kept, foldedCount: results.length - kept.length };
  }

  function client() {
    return {
      standalone: false,
      welcome: {
        protocol: 1, appId: "endfield", window: "endfieldTerminal", version: "1.0.1", language: language,
        appearance: { id: "classic", colorMode: "light", oneBit: false, touch: false, reducedMotion: false, tokens: {}, kitUrl: "" },
        capabilities: ["services", "context", "intents", "appearance", "snapshot", "state"],
        readOnly: false, profile: "desktop", phone: 0, launch: null
      },
      call: async function (method, callParams) {
        host.calls.push({ method: method, name: callParams && callParams.name });
        if (method === "state.get") return { value: host.state.has(callParams.key) ? host.state.get(callParams.key) : null };
        if (method === "state.set") { host.state.set(callParams.key, callParams.value); return {}; }
        if (method === "state.keys") return { keys: [...host.state.keys()] };
        if (method === "service.request") {
          const name = callParams && callParams.name;
          if (name === "endfield.search") return { ok: true, meta: meta };
          if (name === "endfield.ask") {
            if (host.outcome === "fail") return { ok: false, reason: "unavailable" };
            host.asks += 1;
            // The first answer carries the desk's own fold; later ones hand back
            // the whole list and let the terminal fold it, which is the
            // client-side path the archive had before the server folded.
            const first = host.asks === 1;
            const fold = first ? foldByProgress(callParams.params && callParams.params.progress) : { results: results, foldedCount: undefined };
            const replyMeta = { questionType: "general" };
            if (fold.foldedCount !== undefined) replyMeta.foldedCount = fold.foldedCount;
            return {
              ok: true,
              query: callParams.params && callParams.params.query,
              answer: answerText,
              results: fold.results,
              meta: replyMeta,
              ai_system6_metrics: { provider: "lmstudio", model: "local-endfield" }
            };
          }
          return { ok: false, reason: "unavailable" };
        }
        if (method === "service.cancel") return { cancelled: true };
        if (method === "context.publish") return { ok: true };
        if (method === "intent.dispatch") {
          if (callParams.intent === "clip") {
            host.exports.push({ kind: "clip", items: (callParams.items || []).map(function (item) { return { name: item.name, type: item.type, bytes: item.blob ? item.blob.size : 0 }; }) });
            return { ok: true };
          }
          return { ok: true };
        }
        if (method === "access.verify") return { verified: true };
        return {};
      },
      on: function (event, listener) {
        (host.listeners[event] = host.listeners[event] || []).push(listener);
        if (event === "launch.changed") launchListener = listener;
        return function () {};
      },
      handle: function () {},
      ready: function () { return true; },
      status: function (params) { host.status = params; return true; },
      menuState: function (state) { host.menu = state; return true; },
      setTitle: function (title) { host.titles.push(String(title)); return true; },
      enableSnapshots: function () { return this; },
      snapshotNow: async function () { return false; }
    };
  }
  window.AIS6Bridge = { protocol: 1, connect: async function () { return client(); } };
  host.changeLanguage = function (next) {
    (host.listeners["language.changed"] || []).forEach(function (listener) { listener({ language: next }); });
  };
  host.pushLaunch = function (launch) {
    if (launchListener) launchListener({ launch: launch });
  };
  host.archive = { meta: meta, results: results };
})();
`;
