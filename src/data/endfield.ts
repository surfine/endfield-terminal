// The archive's data as the terminal reads it: results, the archive's meta,
// the progress gate and the answer. Every field comes from a desk service, so
// each is narrowed here before a view is built from it.

import { isRecord, text } from "./guards.ts";

export interface EndfieldDataset {
  readonly id: string;
  readonly scrapedAt: string;
  readonly gameVersion: string;
}

export interface EndfieldMeta {
  readonly oldestScrapedAt: string;
  readonly gameVersion: string;
  readonly datasets: readonly EndfieldDataset[];
  readonly kindVersions: Readonly<Record<string, string>>;
  readonly missionCount: number;
  readonly transcriptLineCount: number;
  readonly operatorCount: number;
  readonly loreCount: number;
  readonly foldedCount?: number;
  readonly questionType: string;
}

export interface EndfieldMetrics {
  readonly provider: string;
  readonly model: string;
}

/** One line of source text, with where it came from. */
export interface EndfieldResult {
  readonly kind: string;
  readonly missionId: string;
  readonly missionTitle: string;
  readonly process: string;
  readonly section: string;
  readonly chapter: string;
  readonly chapterKey: string;
  readonly speaker: string;
  readonly text: string;
  readonly lineIndex?: number;
  readonly version: string;
  readonly versionBasis: string;
  readonly missionIndex?: number;
  readonly missionUrl: string;
  readonly url: string;
}

export interface EndfieldAnswer {
  readonly ok: boolean;
  readonly reason: string;
  readonly query: string;
  readonly answer: string;
  readonly results: readonly EndfieldResult[];
  readonly meta: EndfieldMeta | null;
  readonly questionType: string;
  readonly metrics: EndfieldMetrics | null;
}

export type ProgressKey = "prologue" | "chapter1" | "chapter2" | "v1_5" | "all";

/** The story line the answer sits on: 序章 → 第一章 → 第二章 → 1.5. */
export const PROGRESS_ORDER: Readonly<Record<string, number>> = { prologue: 1, chapter1: 2, chapter2: 3, v1_5: 4 };
export const PROGRESS_STOPS: readonly string[] = ["prologue", "chapter1", "chapter2", "v1_5"];
export const PROGRESS_VALUES: readonly ProgressKey[] = ["prologue", "chapter1", "chapter2", "v1_5", "all"];

export const KIND_LABEL_KEYS: Readonly<Record<string, string>> = {
  对话: "dialogue",
  日志: "log",
  通讯: "comms",
  档案: "files",
  语音: "voice",
  教学: "tutorial",
  见闻辑录: "lore",
  中枢档案: "hub",
};

/** The archive's own query list, and the one it replaced (kept for the migration). */
export const DEFAULT_QUERIES: readonly string[] = [
  "管理员什么时候认识的提弗洛斯？",
  "旁白是安玛还是萨米？",
  "安玛就是萨米吗？巨兽和兽主的区别在哪？",
  "老雪祀最后怎么样了？",
  "命运的明示要怎么解锁？",
];

export const LEGACY_DEFAULT_QUERIES: readonly string[] = [
  "庄方宜和管理员是什么关系？",
  "陈千语在主线里参与了哪些事件？",
  "四号谷地和枢纽区基地有什么关系？",
  "艾尔黛拉的性格是什么样的？",
  "武陵城在主线剧情中发生了哪些事件？",
];

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function asMeta(value: unknown): EndfieldMeta {
  const meta = isRecord(value) ? value : {};
  const datasets = Array.isArray(meta.datasets)
    ? meta.datasets.filter(isRecord).map((set) => ({
        id: text(set.id),
        scrapedAt: text(set.scrapedAt),
        gameVersion: text(set.gameVersion),
      }))
    : [];
  const kindVersions: Record<string, string> = {};
  if (isRecord(meta.kindVersions)) {
    for (const [key, version] of Object.entries(meta.kindVersions)) {
      if (typeof version === "string") kindVersions[key] = version;
    }
  }
  return {
    oldestScrapedAt: text(meta.oldestScrapedAt),
    gameVersion: text(meta.gameVersion),
    datasets,
    kindVersions,
    missionCount: number(meta.missionCount),
    transcriptLineCount: number(meta.transcriptLineCount),
    operatorCount: number(meta.operatorCount),
    loreCount: number(meta.loreCount),
    ...(typeof meta.foldedCount === "number" && Number.isFinite(meta.foldedCount)
      ? { foldedCount: meta.foldedCount }
      : {}),
    questionType: text(meta.questionType),
  };
}

export function asResult(value: unknown): EndfieldResult | null {
  if (!isRecord(value)) return null;
  return {
    kind: text(value.kind),
    missionId: text(value.missionId),
    missionTitle: text(value.missionTitle),
    process: text(value.process),
    section: text(value.section),
    chapter: text(value.chapter),
    chapterKey: text(value.chapterKey),
    speaker: text(value.speaker),
    text: text(value.text),
    ...(typeof value.lineIndex === "number" && Number.isInteger(value.lineIndex) ? { lineIndex: value.lineIndex } : {}),
    version: text(value.version),
    versionBasis: text(value.versionBasis),
    ...(typeof value.missionIndex === "number" ? { missionIndex: value.missionIndex } : {}),
    missionUrl: text(value.missionUrl),
    url: text(value.url),
  };
}

export function asResults(value: unknown): readonly EndfieldResult[] {
  return Array.isArray(value) ? value.map(asResult).filter((item): item is EndfieldResult => item !== null) : [];
}

export function asMetrics(value: unknown): EndfieldMetrics | null {
  if (!isRecord(value)) return null;
  return { provider: text(value.provider), model: text(value.model) };
}

/** A service reply, as an answer the terminal can draw. */
export function asAnswer(value: unknown): EndfieldAnswer {
  const reply = isRecord(value) ? value : {};
  const meta = isRecord(reply.meta) ? asMeta(reply.meta) : null;
  return {
    ok: reply.ok !== false,
    reason: text(reply.reason),
    query: text(reply.query),
    answer: text(reply.answer),
    results: asResults(reply.results),
    meta,
    questionType: text(reply.questionType),
    metrics: asMetrics(reply.ai_system6_metrics),
  };
}

/** The recent queries the page keeps, with the pre-move default list migrated once. */
export function asRecentQueries(value: unknown): { queries: string[]; migrated: boolean } {
  const saved = strings(value);
  if (saved.length && saved.every((item) => LEGACY_DEFAULT_QUERIES.includes(item))) {
    return { queries: [...DEFAULT_QUERIES], migrated: true };
  }
  if (saved.length)
    return { queries: [...new Set([...saved, ...DEFAULT_QUERIES].filter(Boolean))].slice(0, 8), migrated: false };
  return { queries: [...DEFAULT_QUERIES], migrated: false };
}
