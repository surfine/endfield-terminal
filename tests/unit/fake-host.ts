// A stand-in desk for the terminal's own tests: the archive's meta, an answer
// with a fold, a refusal, the clip hand-over and the state the page keeps.

import type { BridgeClient, CallOptions, MenuState, Welcome } from "../../src/bridge/types.ts";

export interface FakeHost {
  client: BridgeClient;
  calls: { method: string; name?: string }[];
  clips: { name: string; type: string; size: number }[];
  menu: MenuState | null;
  status: { text?: string } | null;
  state: Map<string, unknown>;
  outcome: "ok" | "fail";
  asks: number;
  /** When false the reply carries no foldedCount, so the terminal folds locally. */
  serverFold: boolean;
}

export function fakeHost({ standalone = false }: { standalone?: boolean } = {}): FakeHost {
  const results = [
    {
      kind: "对话",
      missionId: "m-01",
      missionTitle: "序章 · 落地",
      chapterKey: "prologue",
      chapter: "序章",
      process: "主线",
      speaker: "提弗洛斯",
      text: "管理员？这个名字我记住了。",
      lineIndex: 41,
      version: "v1.5",
      versionBasis: "mission",
      missionIndex: 0,
      missionUrl: "https://example.org/m/01",
    },
    {
      kind: "日志",
      missionId: "m-02",
      missionTitle: "第一章 · 盐碱地",
      chapterKey: "chapter1",
      chapter: "第一章",
      process: "支线",
      speaker: "管理员",
      text: "记录显示提弗洛斯先发现了失忆的管理员。",
      version: "v1.5",
      versionBasis: "mission",
      missionUrl: "",
    },
    {
      kind: "通讯",
      missionId: "m-03",
      missionTitle: "第二章 · 回声",
      chapterKey: "chapter2",
      chapter: "第二章",
      process: "通讯",
      speaker: "安玛",
      text: "旁白说完了这一句。",
      version: "v1.4",
      versionBasis: "dataset",
      missionUrl: "https://example.org/m/03",
    },
  ];
  const host: FakeHost = {
    client: null as unknown as BridgeClient,
    calls: [],
    clips: [],
    menu: null,
    status: null,
    state: new Map(),
    outcome: "ok",
    asks: 0,
    serverFold: true,
  };
  const welcome: Welcome = {
    protocol: 1,
    appId: "endfield",
    window: "endfieldTerminal",
    version: "1.1.1",
    language: "zh",
    appearance: {
      id: "classic",
      colorMode: "light",
      oneBit: false,
      touch: false,
      reducedMotion: false,
      tokens: {},
      kitUrl: "",
    },
    capabilities: ["services", "context", "intents", "appearance", "snapshot", "state"],
    readOnly: false,
  };
  const client = {
    standalone,
    welcome,
    call: async (method: string, params: Record<string, unknown>, _options?: CallOptions) => {
      host.calls.push({ method, ...(typeof params.name === "string" ? { name: params.name } : {}) });
      if (method === "state.get")
        return { value: host.state.has(String(params.key)) ? host.state.get(String(params.key)) : null };
      if (method === "state.set") {
        host.state.set(String(params.key), params.value);
        return {};
      }
      if (method === "state.keys") return { keys: [...host.state.keys()] };
      if (method === "service.request") {
        if (params.name === "endfield.search") {
          return {
            ok: true,
            meta: {
              gameVersion: "v1.5",
              oldestScrapedAt: "2026-01-02T00:00:00Z",
              datasets: [{ id: "missions", scrapedAt: "2026-01-02T00:00:00Z", gameVersion: "v1.5" }],
              kindVersions: { dialogue: "v1.5", log: "v1.5", files: "v1.5" },
              missionCount: 25,
              transcriptLineCount: 20641,
              operatorCount: 64,
              loreCount: 31,
            },
          };
        }
        if (params.name === "endfield.ask") {
          if (host.outcome === "fail") return { ok: false, reason: "unavailable" };
          host.asks += 1;
          const progress = (params.params as { progress?: string })?.progress ?? "all";
          const order: Record<string, number> = { prologue: 1, chapter1: 2, chapter2: 3, v1_5: 4 };
          const threshold = order[progress] ?? Number.POSITIVE_INFINITY;
          // Without a server fold the desk hands back the whole list and the
          // terminal gates it itself, which is the fixture path.
          const kept = host.serverFold
            ? results.filter((item) => !item.chapterKey || (order[item.chapterKey] ?? 0) <= threshold)
            : results;
          const folded = results.length - kept.length;
          return {
            ok: true,
            query: (params.params as { query?: string })?.query,
            answer: "结论：管理员先认识的是提弗洛斯。\n留白：旁白身份没有定论。参见【1】。",
            results: kept,
            meta: {
              questionType: "general",
              ...(host.serverFold && progress !== "all" ? { foldedCount: folded } : {}),
            },
            ai_system6_metrics: { provider: "lmstudio", model: "local-endfield" },
          };
        }
        return { ok: false, reason: "unavailable" };
      }
      if (method === "service.cancel") return { cancelled: true };
      if (method === "context.publish") return { ok: true };
      if (method === "intent.dispatch") {
        if (params.intent === "clip") {
          for (const item of params.items as { name: string; type: string; blob: Blob }[]) {
            host.clips.push({ name: item.name, type: item.type, size: item.blob.size });
          }
          return { ok: true };
        }
        return { ok: true };
      }
      return {};
    },
    on: () => () => {},
    handle: () => {},
    ready: () => true,
    status: (params: { text?: string }) => {
      host.status = params;
      return true;
    },
    menuState: (state: MenuState) => {
      host.menu = state;
      return true;
    },
    setTitle: () => true,
    enableSnapshots: () => client,
    snapshotNow: async () => false,
  } as unknown as BridgeClient;
  host.client = client;
  return host;
}
