// The terminal's state and its work: the archive's meta, the question, the
// answer on screen, the recent queries and the hand-overs to the desk.
//
// What the article shows is one HTML string, built when the answer arrives —
// the window has always baked the language of a drawn answer, so a language
// switch re-labels the chrome and leaves the answer it already read alone.

import { computed, effect, signal } from "@preact/signals";
import {
  askAssistant,
  cancelService,
  clip,
  onMenuCommand,
  publishContext,
  pushMenuState,
  readState,
  service,
  writeState,
} from "../bridge/bridge.ts";
import type { BridgeClient, EndfieldContext } from "../bridge/types.ts";
import {
  asAnswer,
  asMeta,
  asRecentQueries,
  DEFAULT_QUERIES,
  type EndfieldAnswer,
  type EndfieldMeta,
  type EndfieldMetrics,
  type EndfieldResult,
  PROGRESS_ORDER,
  type ProgressKey,
} from "../data/endfield.ts";
import { htmlLang, type Language, type StringKey, type Translate, translate } from "../strings/index.ts";
import {
  clipDocument,
  errorHtml,
  matchGroups,
  matchListHtml,
  missingCount,
  resultsHtml,
  routeLabel,
  searchingHtml,
  stampParts,
  welcomeHtml,
} from "../view/article.ts";

const ENDFIELD_STATE_RECENT = "recent";
export const MENU_COMMANDS = [
  "endfield-new-session",
  "endfield-run-query",
  "endfield-menu-progress",
  "endfield-menu-clip",
  "endfield-sideask",
] as const;

export class Terminal {
  readonly client: BridgeClient;

  readonly language = signal<Language>("zh");
  readonly recent = signal<readonly string[]>(DEFAULT_QUERIES);
  readonly lastQuery = signal("");
  readonly busy = signal(false);
  readonly progress = signal<ProgressKey>("all");
  readonly meta = signal<EndfieldMeta | null>(null);
  readonly metrics = signal<EndfieldMetrics | null>(null);
  /** The article on screen, already built for the language it was drawn in. */
  readonly article = signal<{ readonly html: string }>({ html: "" });
  /** The sidebar's source list, drawn as HTML when the answer arrived. */
  readonly matchList = signal("");
  readonly stamps = signal<readonly string[]>([]);
  readonly routeText = signal("Warfarin Wiki / local archive");
  readonly countText = signal("-- lines");
  readonly progressLabelText = signal("");
  readonly progressOptions = signal<readonly { value: string; label: string }[]>([]);
  readonly submitText = signal("");
  /** The resting label the old control kept on the button while a query ran. */
  readonly idleLabel = signal<string | null>(null);
  /** Whether the form has been marked busy at least once (its `aria-busy` appears then). */
  readonly busyTouched = signal(false);
  readonly hasClipSource = signal(false);
  readonly queryNonEmpty = signal(false);
  readonly hasMeta = signal(false);

  readonly t: Translate = (key: StringKey, ...args: (string | number)[]) =>
    translate(this.language.value, key, ...args);

  readonly menuState = computed(() => {
    const available: Record<string, boolean> = {};
    const checked: Record<string, boolean> = {};
    const reasons: Record<string, string> = {};
    for (const action of MENU_COMMANDS) {
      if (action === "endfield-run-query") available[action] = this.queryNonEmpty.value && !this.busy.value;
      else if (action === "endfield-menu-clip") available[action] = this.hasClipSource.value;
      else available[action] = true;
    }
    return { available, checked, reasons };
  });

  queryEl: HTMLInputElement | null = null;
  outputEl: HTMLElement | null = null;

  private requestId = 0;
  private deskRequestId = "";
  private idleSubmitText: string | null = null;
  private renderedSources: readonly EndfieldResult[] = [];
  private renderedQuery = "";
  private lastMenuSignature = "";

  constructor(client: BridgeClient) {
    this.client = client;
    this.submitText.value = this.t("endfield_search");
  }

  readonly queryRef = (element: HTMLInputElement | null): void => {
    this.queryEl = element;
    this.queryNonEmpty.value = Boolean(element?.value.trim());
  };

  readonly outputRef = (element: HTMLElement | null): void => {
    this.outputEl = element;
  };

  setLanguage(language: Language): void {
    this.language.value = language;
    document.documentElement.lang = htmlLang(language);
    // The old i18n sweep set the submit button's label from the table on a
    // language change, busy or not; the resting label it restores later is the
    // one it captured when the query started.
    this.submitText.value = this.t("endfield_search");
  }

  // ---------------------------------------------------------------------------
  // Start and the desk's wires.

  /** The recent queries, with the pre-move default list migrated once. */
  async start(): Promise<void> {
    const saved = await readState(this.client, ENDFIELD_STATE_RECENT);
    const { queries, migrated } = asRecentQueries(saved);
    this.recent.value = queries;
    if (migrated) await writeState(this.client, ENDFIELD_STATE_RECENT, queries);
  }

  attachToHost(): void {
    onMenuCommand(this.client, (action) => this.runMenuCommand(action));
    effect(() => {
      const state = this.menuState.value;
      const signature = JSON.stringify(state);
      if (signature === this.lastMenuSignature) return;
      this.lastMenuSignature = signature;
      pushMenuState(this.client, state);
    });
    this.client.setTitle(this.t("endfield_terminal_title"));
    this.client.enableSnapshots({ producer: "dom", target: document.getElementById("app") });
  }

  // ---------------------------------------------------------------------------
  // The status line.

  renderRoute(): void {
    this.renderStatusChrome();
    const label = routeLabel(this.metrics.value, this.t);
    const meta = this.meta.value;
    if (!meta) {
      this.routeText.value = label;
      return;
    }
    const oldest = String(meta.oldestScrapedAt || "").slice(0, 10);
    const stale =
      meta.datasets.filter((set) => set.scrapedAt && String(set.scrapedAt).slice(0, 10) !== oldest).length > 0;
    this.routeText.value = oldest
      ? `${meta.gameVersion || "v?"} · ${oldest}${stale ? " ⚠" : ""} / ${label}`
      : `${meta.gameVersion || "v?"} / ${label}`;
    this.routeTitle.value = meta.datasets
      .map(
        (set) =>
          `${set.id}: ${String(set.scrapedAt || "?").slice(0, 10)}${set.gameVersion ? ` (${set.gameVersion})` : ""}`,
      )
      .join("\n");
  }

  readonly routeTitle = signal("");

  private renderStatusChrome(): void {
    this.stamps.value = stampParts(this.meta.value, this.t);
    this.ensureProgressControl();
  }

  /** Built once, as the old control was: the options keep the language they were made in. */
  private ensureProgressControl(): void {
    if (this.progressOptions.value.length) return;
    this.progressLabelText.value = this.t("endfield_progress_label");
    this.progressOptions.value = (
      [
        ["prologue", "endfield_progress_prologue"],
        ["chapter1", "endfield_progress_chapter1"],
        ["chapter2", "endfield_progress_chapter2"],
        ["v1_5", "endfield_progress_v1_5"],
        ["all", "endfield_progress_all"],
      ] as const
    ).map(([value, key]) => ({ value, label: this.t(key) }));
  }

  /** The reader's own place: re-asks the last question when it changes. */
  chooseProgress(value: string): void {
    this.progress.value = (value || "all") as ProgressKey;
    if (this.lastQuery.value) void this.ask(this.lastQuery.value);
  }

  // ---------------------------------------------------------------------------
  // The archive.

  private async loadMeta(): Promise<void> {
    if (this.hasMeta.value) return;
    try {
      const reply = await service(this.client, "endfield.search", {});
      if (!reply || reply.ok === false) throw new Error("unavailable");
      const meta = asMeta(reply.meta);
      this.countText.value = this.t("endfield_line_count", meta.transcriptLineCount || 0);
      this.meta.value = meta;
      this.hasMeta.value = true;
      this.renderRoute();
      if (!this.lastQuery.value && this.outputEl?.querySelector(".endfield-welcome")) this.renderWelcome();
    } catch {
      this.countText.value = this.t("endfield_archive_unavailable");
    }
  }

  // ---------------------------------------------------------------------------
  // A question and its answer.

  async ask(query: string): Promise<void> {
    const normalized = String(query || "").trim();
    if (!normalized) {
      this.queryEl?.focus();
      return;
    }
    const requestId = ++this.requestId;
    // A new question stops the one still running on the desk.
    this.cancelDeskRequest();
    const deskRequestId = `endfield-ask-${requestId}`;
    this.deskRequestId = deskRequestId;
    this.lastQuery.value = normalized;
    await this.saveRecentQuery(normalized);
    this.renderRoute();
    this.setBusy(true);
    this.article.value = {
      html: searchingHtml(normalized, this.meta.value, routeLabel(this.metrics.value, this.t), this.t),
    };
    this.matchList.value = matchListHtml([], this.t("endfield_empty"));

    try {
      // One desk call: the adapter runs search + local/server answer choice.
      const reply = await service(
        this.client,
        "endfield.ask",
        { query: normalized, progress: this.progress.value },
        { requestId: deskRequestId },
      );
      if (requestId !== this.requestId) return;
      if (reply.ok === false) throw new Error("unavailable");
      const data = asAnswer(reply);
      this.metrics.value = data.metrics;
      this.renderResults(data, data.results.slice(0, 14));
      this.publishAnswer(data, normalized);
      this.client.status({ text: `Endfield: ${normalized}` });
    } catch {
      if (requestId !== this.requestId) return;
      this.article.value = { html: errorHtml(normalized, this.t) };
      this.hasClipSource.value = false;
      this.client.status({ text: this.t("endfield_error_title") });
    } finally {
      if (this.deskRequestId === deskRequestId) this.deskRequestId = "";
      if (requestId === this.requestId) this.setBusy(false);
    }
  }

  private cancelDeskRequest(): void {
    if (!this.deskRequestId) return;
    const pending = this.deskRequestId;
    this.deskRequestId = "";
    void cancelService(this.client, pending);
  }

  private setBusy(busy: boolean): void {
    this.busy.value = busy;
    this.busyTouched.value = true;
    if (busy) {
      if (this.idleSubmitText === null) this.idleSubmitText = this.submitText.value;
      if (this.idleLabel.value === null) this.idleLabel.value = this.submitText.value;
      this.submitText.value = this.t("endfield_searching_short");
    } else if (this.idleSubmitText !== null) {
      this.submitText.value = this.idleSubmitText;
      this.idleSubmitText = null;
    }
  }

  reset(): void {
    this.requestId += 1;
    this.cancelDeskRequest();
    this.lastQuery.value = "";
    this.metrics.value = null;
    void publishContext(this.client, { query: "", answer: "", results: [] });
    if (this.queryEl) this.queryEl.value = "";
    this.queryNonEmpty.value = false;
    this.setBusy(false);
    this.renderTerminal();
    this.queryEl?.focus();
  }

  renderTerminal(): void {
    if (!this.lastQuery.value) this.renderWelcome();
    void this.loadMeta();
    this.renderRoute();
  }

  private renderWelcome(): void {
    this.renderedSources = [];
    this.renderedQuery = "";
    this.article.value = { html: welcomeHtml(this.meta.value, this.t) };
    this.matchList.value = matchListHtml([], this.t("endfield_empty"));
    this.hasClipSource.value = false;
  }

  private renderResults(data: EndfieldAnswer, rawResults: readonly EndfieldResult[]): void {
    const questionType = data.meta?.questionType || data.questionType || "general";
    let results = rawResults;
    let foldedCount = Number(data.meta?.foldedCount) || 0;
    if (data.meta?.foldedCount === undefined) {
      // Fixture / client-side path (no server fold): fold locally.
      if (this.progress.value === "all") {
        foldedCount = 0;
      } else {
        const threshold = PROGRESS_ORDER[this.progress.value] ?? 5;
        results = rawResults.filter((item) => {
          if (!item.chapterKey || PROGRESS_ORDER[item.chapterKey] === undefined) return true;
          return (PROGRESS_ORDER[item.chapterKey] ?? 0) <= threshold;
        });
        foldedCount = rawResults.length - results.length;
      }
    }
    const query = String(data.query || this.lastQuery.value).trim();
    this.renderedSources = results.slice();
    this.renderedQuery = query;
    this.hasClipSource.value = results.length > 0;
    this.article.value = {
      html: resultsHtml(
        { query, results, foldedCount, questionType, progress: this.progress.value, answer: data.answer },
        this.t,
      ),
    };
    this.matchList.value = matchListHtml(
      matchGroups(results, foldedCount, missingCount(results, questionType), this.t),
      this.t("endfield_empty"),
    );
  }

  /** Keeps the latest question + numbered evidence available to SideAsk/ClioTalk. */
  private publishAnswer(data: EndfieldAnswer, query: string): void {
    const results = data.results.slice(0, 14).map((item, index) => ({
      n: index + 1,
      missionId: item.missionId || "",
      missionTitle: item.missionTitle || "",
      section: item.section || "",
      chapter: item.chapter || "",
      process: item.process || "",
      speaker: item.speaker || "",
      text: item.text || "",
      url: item.missionUrl || item.url || "",
    }));
    const context: EndfieldContext = {
      query: String(query || "").trim(),
      answer: String(data.answer || "").trim(),
      results,
    };
    void publishContext(this.client, context);
  }

  // ---------------------------------------------------------------------------
  // Recent queries.

  async saveRecentQuery(query: string): Promise<void> {
    const normalized = String(query || "").trim();
    if (!normalized) return;
    const next = [normalized, ...this.recent.value.filter((item) => item !== normalized)].slice(0, 8);
    this.recent.value = next;
    await writeState(this.client, ENDFIELD_STATE_RECENT, next);
  }

  chooseQuery(query: string): void {
    if (this.queryEl) this.queryEl.value = query;
    this.queryNonEmpty.value = Boolean(query.trim());
    void this.ask(query);
  }

  setQueryValue(value: string): void {
    this.queryNonEmpty.value = Boolean(value.trim());
  }

  // ---------------------------------------------------------------------------
  // Evidence, clipping and the launch.

  revealEvidence(index: number): boolean {
    const n = Number(index) || 0;
    if (!n) return false;
    const evidence = document.getElementById(`endfield-evidence-${n}`);
    if (!evidence) return false;
    (evidence as HTMLElement & { open?: boolean }).open = true;
    evidence.scrollIntoView({ block: "center", behavior: "smooth" });
    evidence.focus({ preventScroll: true });
    evidence.classList.remove("is-flash");
    void evidence.offsetWidth;
    evidence.classList.add("is-flash");
    setTimeout(() => evidence.classList.remove("is-flash"), 700);
    return true;
  }

  /** A desk-made launch (an evidence jump) is read once when the window opens. */
  applyLaunch(launch: unknown): void {
    if (!launch || typeof launch !== "object" || !("evidence" in launch)) return;
    const n = Number((launch as { evidence?: unknown }).evidence) || 0;
    if (!n) return;
    if (this.revealEvidence(n)) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (this.revealEvidence(n) || tries > 20) clearInterval(timer);
    }, 100);
  }

  async clipSource(button: HTMLButtonElement): Promise<void> {
    const sourceIndex = Number(button.dataset.clipSource) || 0;
    const rendered = this.renderedSources[sourceIndex - 1];
    const text = String(rendered?.text || button.dataset.clipText || "").trim();
    if (!sourceIndex || !text) return;
    const source = document.getElementById(`endfield-evidence-${sourceIndex}`);
    const name = source
      ? `${source.dataset.kind || "endfield"}-source-${sourceIndex}.md`
      : `endfield-source-${sourceIndex}.md`;
    const body = clipDocument(rendered ?? emptyResult(text), sourceIndex, this.renderedQuery, this.t);
    const blob = new Blob([body], { type: "text/markdown" });
    try {
      const result = await clip(this.client, [{ kind: "text", name, type: "text/markdown", blob }]);
      if (!result.ok) throw new Error(result.reason || "not-mounted");
      button.textContent = this.t("endfield_clipped");
      button.disabled = true;
    } catch {
      button.textContent = this.t("endfield_clip_failed");
    }
  }

  // ---------------------------------------------------------------------------
  // Menus.

  async runMenuCommand(command: string): Promise<boolean> {
    if (!(MENU_COMMANDS as readonly string[]).includes(command)) return false;
    if (command === "endfield-new-session") {
      this.reset();
      return true;
    }
    if (command === "endfield-run-query") {
      await this.ask(this.queryEl?.value ?? "");
      return true;
    }
    if (command === "endfield-menu-progress") {
      document.getElementById("endfield-progress")?.focus();
      return true;
    }
    if (command === "endfield-menu-clip") {
      document.querySelector<HTMLButtonElement>("[data-clip-source]")?.click();
      return true;
    }
    await askAssistant(this.client, { appId: "endfieldTerminal", query: this.lastQuery.value || "" });
    return true;
  }
}

function emptyResult(text: string): EndfieldResult {
  return {
    kind: "",
    missionId: "",
    missionTitle: "",
    process: "",
    section: "",
    chapter: "",
    chapterKey: "",
    speaker: "",
    text,
    version: "",
    versionBasis: "",
    missionUrl: "",
    url: "",
  };
}
