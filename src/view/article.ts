// The terminal's article markup: the welcome, the searching state, an answer
// with its evidence, and the error. These are the same builders the page used
// before the move — the strings they take are resolved by the caller, because
// the terminal has always baked the language of what it drew: a language
// switch re-labels the window's chrome, not the answer already on screen.

import {
  DEFAULT_QUERIES,
  type EndfieldMeta,
  type EndfieldMetrics,
  type EndfieldResult,
  KIND_LABEL_KEYS,
  PROGRESS_ORDER,
  PROGRESS_STOPS,
} from "../data/endfield.ts";
import { escapeHtml } from "../data/guards.ts";
import type { Translate } from "../strings/index.ts";

const esc = escapeHtml;

/** Short answers: escape, plus the light markdown the desk's helper used to draw. */
export function markdownHtml(markdown: string): string {
  return esc(markdown)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

export function kindLabel(kind: string, t: Translate): string {
  const key = KIND_LABEL_KEYS[kind] ?? "dialogue";
  return t(`endfield_kind_${key}` as Parameters<Translate>[0]);
}

export function progressLabel(progress: string, t: Translate): string {
  return t(`endfield_progress_${progress}` as Parameters<Translate>[0]);
}

export function routeLabel(metrics: EndfieldMetrics | null, t: Translate): string {
  if (metrics?.provider || metrics?.model) {
    const provider =
      metrics.provider === "lmstudio" || metrics.provider === "local"
        ? t("endfield_route_local")
        : metrics.provider
          ? t("endfield_route_cloud")
          : t("endfield_route_local");
    return metrics.model ? `${provider} / ${metrics.model}` : provider;
  }
  return t("endfield_route_local");
}

/** The per-dataset version stamps, with the structure row's gap named at the end. */
export function stampParts(meta: EndfieldMeta | null, t: Translate): string[] {
  const kindVersions = meta?.kindVersions ?? {};
  const buckets = (
    [
      ["dialogue", "endfield_stamp_dialogue"],
      ["log", "endfield_stamp_log"],
      ["files", "endfield_stamp_files"],
    ] as const
  )
    .map(([key, labelKey]) => ({ labelKey, version: kindVersions[key] ?? "" }))
    .filter((bucket) => bucket.version);
  const distinct = [...new Set(buckets.map((bucket) => bucket.version))];
  const parts =
    distinct.length === 1
      ? [`<span class="endfield-stamp">${esc(distinct[0])}</span>`]
      : buckets.map(
          (bucket) => `<span class="endfield-stamp">${esc(t(bucket.labelKey))} ${esc(bucket.version)}</span>`,
        );
  parts.push(
    `<span class="endfield-stamp is-gap">${esc(t("endfield_stamp_structure"))} ${esc(t("endfield_not_wired"))}</span>`,
  );
  return parts;
}

function count(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("en-US") : "";
}

/**
 * What the archive holds, from its own meta. Nothing is shown until the meta
 * has arrived, so the welcome never states a number the archive did not give.
 */
export function coverageHtml(meta: EndfieldMeta | null, t: Translate): string {
  if (!meta) return "";
  const cells = (
    [
      [meta.missionCount, "endfield_coverage_missions"],
      [meta.transcriptLineCount, "endfield_coverage_lines"],
      [meta.operatorCount, "endfield_coverage_operators"],
      [meta.loreCount, "endfield_coverage_lore"],
    ] as const
  ).filter(([value]) => count(value));
  if (!cells.length) return "";
  return `<dl class="endfield-coverage" aria-label="${esc(t("endfield_coverage_label"))}">
    ${cells.map(([value, key]) => `<div><dt>${esc(count(value))}</dt><dd>${esc(t(key))}</dd></div>`).join("")}
  </dl>`;
}

export function searchingHtml(query: string, meta: EndfieldMeta | null, route: string, t: Translate): string {
  const lines = count(meta?.transcriptLineCount);
  const steps: [string, string][] = [
    [t("endfield_step_search"), lines ? t("endfield_step_search_value", lines) : ""],
    [t("endfield_step_pick"), t("endfield_step_pick_value")],
    [t("endfield_step_model"), route],
  ];
  return `<article class="endfield-answer endfield-loading">
    <p class="endfield-kicker"><span class="endfield-kicker-tag">SEARCHING</span>${esc(t("endfield_searching_label"))}</p>
    <h3>${esc(query)}</h3>
    <div class="endfield-scan" aria-hidden="true"><i></i></div>
    <ol class="endfield-steps">
      ${steps.map(([label, value]) => `<li><span>${esc(label)}</span><b>${esc(value)}</b></li>`).join("")}
    </ol>
  </article>`;
}

/**
 * The story line the answer sits on: 序章 → 第一章 → 第二章 → 1.5. Stops up to
 * the reader's progress are filled; each stop counts the lines this answer
 * found in it; what the progress gate folded away is named at the end.
 */
export function progressTrackHtml(
  results: readonly EndfieldResult[],
  foldedCount: number,
  progress: string,
  t: Translate,
): string {
  const reachedUpTo =
    progress === "all" ? Number.POSITIVE_INFINITY : (PROGRESS_ORDER[progress] ?? Number.POSITIVE_INFINITY);
  const counts: Record<string, number> = {};
  let unchaptered = 0;
  for (const item of results) {
    if (PROGRESS_ORDER[item.chapterKey] === undefined) unchaptered += 1;
    else counts[item.chapterKey] = (counts[item.chapterKey] ?? 0) + 1;
  }
  const notes: string[] = [];
  if (unchaptered) notes.push(`<span>${esc(t("endfield_track_unchaptered", unchaptered))}</span>`);
  if (foldedCount) notes.push(`<span class="is-gap">${esc(t("endfield_track_folded", foldedCount))}</span>`);
  return `<div class="endfield-track" role="group" aria-label="${esc(t("endfield_track_aria", progressLabel(progress, t)))}">
    <span class="endfield-track-label">${esc(t("endfield_track_label"))}</span>
    <ol>
      ${PROGRESS_STOPS.map((stop) => {
        const order = PROGRESS_ORDER[stop] ?? Number.POSITIVE_INFINITY;
        const state = order > reachedUpTo ? "is-ahead" : stop === progress ? "is-current" : "is-reached";
        return `<li class="endfield-track-stop ${state}" data-chapter="${stop}"><span>${esc(progressLabel(stop, t))}</span><b data-count="${counts[stop] ?? 0}">${counts[stop] ?? 0}</b></li>`;
      }).join("")}
    </ol>
    ${notes.length ? `<p class="endfield-track-note">${notes.join("")}</p>` : ""}
  </div>`;
}

const SOURCE_URL = /^https?:\/\//i;

export function sourceUrl(item: EndfieldResult | undefined): string {
  const url = String(item?.missionUrl || item?.url || "").trim();
  return SOURCE_URL.test(url) ? url : "";
}

export function sourceRoute(item: EndfieldResult | undefined): string {
  return [item?.missionTitle, item?.process || item?.section, item?.chapter].filter(Boolean).join(" · ");
}

/** The address belongs to the mission, not to each of its lines. */
function sourceLinkHtml(item: EndfieldResult, t: Translate): string {
  const url = sourceUrl(item);
  return url
    ? `<a class="endfield-source-link" href="${esc(url)}" target="_blank" rel="noopener" data-source-url>${esc(t("endfield_open_source"))}</a>`
    : `<span class="endfield-stamp is-gap" data-source-url-missing>${esc(t("endfield_no_source_url"))}</span>`;
}

/** Consecutive results from the same entry read as one stretch of transcript. */
function sourceGroupKey(item: EndfieldResult): string {
  return [item.kind || "对话", item.missionId || "", sourceRoute(item), sourceUrl(item)].join("\u0001");
}

function sourceGroupHeadHtml(item: EndfieldResult, t: Translate): string {
  const kind = item.kind || "对话";
  const route = [item.process || item.section, item.chapter].filter(Boolean).join(" · ");
  return `<header class="endfield-source-head">
    <span class="endfield-source-kind">${esc(kindLabel(kind, t))}</span>
    <b class="endfield-mission-title">${esc(item.missionTitle || t("endfield_untitled"))}</b>
    ${route ? `<span class="endfield-mission-route">${esc(route)}</span>` : ""}
    <span class="endfield-stamp" title="${esc(item.versionBasis === "mission" ? "按条目" : "按数据集")}">${esc(item.version || "v?")}</span>
    ${item.missionIndex != null ? `<span class="endfield-stamp" data-stamp-mission>#${item.missionIndex + 1}</span>` : ""}
    <span class="endfield-mission-link">${sourceLinkHtml(item, t)}</span>
  </header>`;
}

function showMissing(item: EndfieldResult, questionType: string): boolean {
  return (item.kind === "日志" || item.kind === "通讯") && (questionType === "when" || questionType === "general");
}

interface SourceGroup {
  key: string;
  kind: string;
  head: string;
  rows: string[];
  lastSpeaker: string | null;
}

export function sourceCardsHtml(results: readonly EndfieldResult[], questionType: string, t: Translate): string {
  const groups: SourceGroup[] = [];
  const missingSet = new Set<string>();
  results.forEach((item, index) => {
    const kind = item.kind || "对话";
    const key = sourceGroupKey(item);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, kind, head: sourceGroupHeadHtml(item, t), rows: [], lastSpeaker: null };
      groups.push(group);
    }
    const speaker = String(item.speaker || "").trim();
    // A speaker repeated on the next line is kept for screen readers and
    // hidden on screen, as a transcript writes a name once per turn.
    const continued = Boolean(speaker) && speaker === group.lastSpeaker;
    group.lastSpeaker = speaker;
    group.rows.push(`
      <div class="endfield-source${continued ? " is-continued" : ""}" id="endfield-evidence-${index + 1}" tabindex="-1" data-kind="${esc(kind)}" data-evidence-index="${index + 1}">
        <span class="endfield-evidence-index">${index + 1}</span>
        <span class="endfield-source-speaker">${esc(speaker || t("endfield_unknown_speaker"))}</span>
        <p class="endfield-source-quote">${esc(String(item.text || "").replace(/\n{2,}/g, "\n"))}</p>
        <p class="endfield-source-origin">
          ${typeof item.lineIndex === "number" && Number.isInteger(item.lineIndex) ? `<span class="endfield-source-line">${esc(t("endfield_source_line", item.lineIndex + 1))}</span>` : ""}
          <button class="btn mini-btn" type="button" data-clip-source="${index + 1}" data-clip-text="${esc(item.text || "")}">${esc(t("endfield_clip_source"))}</button>
        </p>
      </div>
    `);
    if (showMissing(item, questionType) && !missingSet.has(`${item.missionId}:${item.speaker}:${item.text}`)) {
      missingSet.add(`${item.missionId}:${item.speaker}:${item.text}`);
      group.lastSpeaker = null;
      group.rows.push(`
        <div class="endfield-source is-missing" id="endfield-evidence-${index + 1}-missing" data-kind="对话" data-evidence-index="${index + 1}">
          <span class="endfield-evidence-index">${index + 1}</span>
          <span class="endfield-source-speaker"><span class="endfield-stamp is-gap">${esc(t("endfield_missing_stamp"))}</span></span>
          <p class="endfield-source-quote">${esc(t("endfield_missing_dialogue"))}</p>
        </div>
      `);
    }
  });
  return groups
    .map(
      (group) => `
    <section class="endfield-mission" data-kind="${esc(group.kind)}">
      ${group.head}
      <div class="endfield-mission-lines">${group.rows.join("")}</div>
    </section>
  `,
    )
    .join("");
}

/** How many of these results carry a quote the archived dialogue does not. */
export function missingCount(results: readonly EndfieldResult[], questionType: string): number {
  const seen = new Set<string>();
  let missing = 0;
  for (const item of results) {
    if (!showMissing(item, questionType)) continue;
    const key = `${item.missionId}:${item.speaker}:${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    missing += 1;
  }
  return missing;
}

/** A small English tag beside a label ("结论 VERDICT"); dropped when it would repeat the label. */
function tagHtml(label: string, tag: string, className = "endfield-tag"): string {
  const same =
    String(label || "")
      .trim()
      .toLowerCase() ===
    String(tag || "")
      .trim()
      .toLowerCase();
  return tag && !same ? `<small class="${className}" aria-hidden="true">${esc(tag)}</small>` : "";
}

export function verdictBlocks(answer: string, t: Translate): string {
  let verdict = "";
  let gap = "";
  const extra: string[] = [];
  for (const rawLine of String(answer || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^结论[\s：:]/.test(line)) verdict = line.replace(/^结论[\s：:]\s*/, "");
    else if (/^留白[\s：:]/.test(line)) gap = line.replace(/^留白[\s：:]\s*/, "");
    else if (line) extra.push(line);
  }
  const blocks: string[] = [];
  const block = (labelKey: Parameters<Translate>[0], tag: string, value: string, className = "") =>
    `<div class="endfield-verdict${className}">
    <span class="endfield-verdict-label"><b>${esc(t(labelKey))}</b>${tagHtml(t(labelKey), tag)}</span>
    <div class="endfield-verdict-body">${markdownHtml(value)}</div>
  </div>`;
  if (verdict) blocks.push(block("endfield_verdict_label", "VERDICT", verdict));
  if (gap) blocks.push(block("endfield_gap_label", "GAP", gap, " is-gap"));
  if (extra.length) blocks.push(`<div class="markdown-body">${markdownHtml(extra.join("\n"))}</div>`);
  return blocks.join("");
}

/**
 * The model cites evidence as 【1】 inside the answer. Turn those markers into
 * tappable citation chips that open and scroll to the matching evidence item.
 */
export function inlineCitations(html: string, t: Translate): string {
  return html.replace(
    /【(\d+)】/g,
    (_match, n: string) =>
      `<button type="button" class="endfield-inline-citation" data-endfield-citation="${n}" aria-label="${esc(t("endfield_evidence_heading", 1))} ${n}">${n}</button>`,
  );
}

export function welcomeHtml(meta: EndfieldMeta | null, t: Translate): string {
  const tagline = t("endfield_welcome_tagline");
  const questions = DEFAULT_QUERIES.map((query, index) => {
    const available = query !== DEFAULT_QUERIES[DEFAULT_QUERIES.length - 1];
    return `<button class="btn" type="button" data-query="${esc(query)}">
            <span class="endfield-question-no" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
            <span>${esc(query)}</span>
            <span class="endfield-stamp${available ? "" : " is-gap"}" data-availability>${esc(t(available ? "endfield_avail_yes" : "endfield_avail_no"))}</span>
          </button>`;
  }).join("");
  return `<article class="endfield-answer endfield-welcome">
      <p class="endfield-kicker"><span class="endfield-kicker-tag">ARCHIVE</span>${t("endfield_kicker_audience")}</p>
      <h3>${t("endfield_welcome_title")}</h3>
      ${tagline ? `<p class="endfield-tagline" aria-hidden="true">${tagline}</p>` : ""}
      <p>${t("endfield_welcome_body")}</p>
      ${coverageHtml(meta, t)}
      <div class="endfield-question-list" role="group" aria-label="${esc(t("endfield_suggestions"))}">${questions}</div>
    </article>`;
}

export interface ResultsView {
  readonly query: string;
  readonly results: readonly EndfieldResult[];
  readonly foldedCount: number;
  readonly questionType: string;
  readonly progress: string;
  readonly answer: string;
}

export function resultsHtml(view: ResultsView, t: Translate): string {
  const fold = view.foldedCount
    ? `<div class="endfield-fold" data-endfield-fold>${t("endfield_fold", view.foldedCount)}</div>`
    : "";
  const html = `<article class="endfield-answer">
      <p class="endfield-kicker"><span class="endfield-kicker-tag">EVIDENCE</span>${t("endfield_sources_kicker", view.results.length, progressLabel(view.progress, t))}</p>
      <h3>${esc(view.query)}</h3>
      ${progressTrackHtml(view.results, view.foldedCount, view.progress, t)}
      <div class="endfield-sources">${sourceCardsHtml(view.results, view.questionType, t)}</div>
      ${verdictBlocks(view.answer, t)}
      ${fold}
    </article>`;
  return inlineCitations(html, t);
}

export function errorHtml(query: string, t: Translate): string {
  return `<article class="endfield-answer endfield-error" role="alert">
        <p class="endfield-kicker">${t("endfield_error_label")}</p>
        <h3>${t("endfield_error_title")}</h3>
        <p>${t("endfield_error_body")}</p>
        <button class="btn" type="button" data-retry-query="${esc(query)}">${t("endfield_retry")}</button>
      </article>`;
}

/** The sidebar's source groups: one per kind, plus the gaps the answer names. */
export interface MatchGroup {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export function matchGroups(
  results: readonly EndfieldResult[],
  foldedCount: number,
  missing: number,
  t: Translate,
): MatchGroup[] {
  const counters: Record<string, number> = {};
  for (const item of results) {
    const kind = item.kind || "对话";
    counters[kind] = (counters[kind] ?? 0) + 1;
  }
  const groups: MatchGroup[] = Object.entries(counters).map(([kind, value]) => ({
    id: `kind:${kind}`,
    label: kindLabel(kind, t),
    count: value,
  }));
  if (missing) groups.push({ id: "missing", label: t("endfield_group_missing"), count: missing });
  if (foldedCount) groups.push({ id: "folded", label: t("endfield_group_folded"), count: foldedCount });
  return groups;
}

/** A clipped quote has to survive leaving the terminal: route, entry, line, version, URL and question. */
export function clipDocument(item: EndfieldResult, sourceIndex: number, query: string, t: Translate): string {
  const route = sourceRoute(item);
  const url = sourceUrl(item);
  const lines = [`# ${route || t("endfield_clip_source")} 【${sourceIndex}】`, ""];
  lines.push(
    `> ${String(item.text || "")
      .trim()
      .replace(/\n/g, "\n> ")}`,
    "",
  );
  // Label and value stay separate: the archive's own strings (URL, entry id,
  // version) must survive verbatim, whichever UI language wrote the file.
  if (route) lines.push(`- ${t("endfield_clip_route")}${route}`);
  if (item.speaker) lines.push(`- ${t("endfield_clip_speaker")}${item.speaker}`);
  if (item.missionId) lines.push(`- ${t("endfield_clip_entry")}${item.missionId}`);
  if (typeof item.lineIndex === "number" && Number.isInteger(item.lineIndex)) {
    lines.push(`- ${t("endfield_clip_line")}${item.lineIndex + 1}`);
  }
  if (item.version) lines.push(`- ${t("endfield_clip_version")}${item.version}`);
  lines.push(`- ${url ? `${t("endfield_clip_link")}${url}` : t("endfield_clip_no_link")}`);
  if (query) lines.push(`- ${t("endfield_clip_question")}${query}`);
  lines.push(`- ${t("endfield_clip_time")}${new Date().toISOString()}`);
  return `${lines.join("\n")}\n`;
}

/** The sidebar's list, drawn as one HTML string: the rows' inline bars are the reason. */
export function matchListHtml(groups: readonly MatchGroup[], empty: string): string {
  if (!groups.length) return `<p class="endfield-empty">${empty}</p>`;
  const most = Math.max(1, ...groups.map((group) => group.count));
  return groups
    .map(
      (group) =>
        `<div class="endfield-source-group${group.id === "missing" || group.id === "folded" ? " is-gap" : ""}" role="button" tabindex="0" data-source-group="${esc(group.id)}"><span>${esc(group.label)}</span><i class="endfield-source-group-bar" aria-hidden="true"><i style="width:${Math.round((group.count / most) * 100)}%"></i></i><small>${group.count}</small></div>`,
    )
    .join("");
}
