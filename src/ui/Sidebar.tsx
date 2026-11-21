import { useEffect, useRef } from "preact/hooks";
import type { Terminal } from "../app/terminal.ts";

/** The left column: the questions kept and the kinds of source this answer drew on. */
export function Sidebar({ terminal }: { terminal: Terminal }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const listener = (event: MouseEvent) => handleMatchesClick(event);
    element.addEventListener("click", listener);
    return () => element.removeEventListener("click", listener);
  }, [terminal]);
  return (
    <aside class="endfield-sidebar">
      <div class="endfield-sidebar-head">
        <h3>{terminal.t("endfield_recent_queries")}</h3>
        <button
          class="btn mini-btn endfield-new-session"
          type="button"
          id="endfield-new-session"
          onClick={() => terminal.reset()}
        >
          {terminal.t("endfield_new_query")}
        </button>
      </div>
      <section class="endfield-nav-section">
        <div id="endfield-recent-list" class="endfield-recent-list">
          {terminal.recent.value.map((query, index) => {
            const selected = query === terminal.lastQuery.value;
            return (
              <button
                key={query}
                type="button"
                class={`endfield-recent-item${selected ? " is-selected" : ""}`}
                data-query={query}
                aria-pressed={selected ? "true" : "false"}
                disabled={terminal.busy.value}
                onClick={() => terminal.chooseQuery(query)}
              >
                <span>{`Q-${String(index + 1).padStart(2, "0")}`}</span>
                <b>{query.replace(/[？?].*$/, "")}</b>
              </button>
            );
          })}
        </div>
      </section>
      <section class="endfield-nav-section endfield-match-section">
        <h3>{terminal.t("endfield_matches")}</h3>
        <div
          ref={list}
          id="endfield-match-list"
          class="endfield-match-list"
          dangerouslySetInnerHTML={{ __html: terminal.matchList.value }}
        />
      </section>
    </aside>
  );
}

function handleMatchesClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const evidence = target.closest<HTMLElement>("[data-evidence-index]");
  if (evidence?.dataset.evidenceIndex) {
    const item = document.querySelector<HTMLElement>(`#endfield-evidence-${evidence.dataset.evidenceIndex}`);
    if (!item) return;
    (item as HTMLElement & { open?: boolean }).open = true;
    item.scrollIntoView({ block: "nearest" });
    item.focus({ preventScroll: true });
    return;
  }
  const group = target.closest<HTMLElement>("[data-source-group]");
  if (group) openGroup(group.dataset.sourceGroup ?? "");
}

function openGroup(id: string): void {
  if (id === "folded") {
    document.querySelector("[data-endfield-fold]")?.scrollIntoView({ block: "nearest" });
    return;
  }
  if (id === "missing") {
    document.querySelector(".endfield-source.is-missing")?.scrollIntoView({ block: "nearest" });
    return;
  }
  const kind = id.replace(/^kind:/, "");
  document.querySelector(`.endfield-source[data-kind="${CSS.escape(kind)}"]`)?.scrollIntoView({ block: "nearest" });
}
