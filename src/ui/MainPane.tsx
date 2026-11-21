import { useEffect, useRef } from "preact/hooks";
import type { Terminal } from "../app/terminal.ts";

/**
 * The terminal itself: the answer on screen and the command bar.
 *
 * The answer is one HTML string, drawn by the view builders when it arrived;
 * its click handling is delegated from the container, because the markup is
 * replaced whole and its own listeners go with it.
 */
export function MainPane({ terminal }: { terminal: Terminal }) {
  const output = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = output.current;
    terminal.outputRef(element);
    if (!element) return;
    const listener = (event: MouseEvent) => handleOutputClick(terminal, event);
    element.addEventListener("click", listener);
    return () => {
      element.removeEventListener("click", listener);
      terminal.outputRef(null);
    };
  }, [terminal]);
  const busy = terminal.busy.value;
  return (
    <section class="endfield-main">
      <div
        ref={output}
        id="endfield-output"
        class="endfield-output"
        aria-busy={busy ? "true" : "false"}
        dangerouslySetInnerHTML={{ __html: terminal.article.value.html }}
      />
      <form
        id="endfield-form"
        class="endfield-command-bar"
        aria-label={terminal.t("endfield_ask_archive")}
        aria-busy={terminal.busyTouched.value ? (busy ? "true" : "false") : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          if (terminal.busy.value) return;
          void terminal.ask(terminal.queryEl?.value ?? "");
        }}
      >
        <label class="endfield-query-field" for="endfield-query">
          <span class="visually-hidden">{terminal.t("endfield_question")}</span>
          <input
            ref={terminal.queryRef}
            id="endfield-query"
            type="text"
            placeholder={terminal.t("endfield_placeholder")}
            autocomplete="off"
            onInput={(event) => terminal.setQueryValue(event.currentTarget.value)}
          />
        </label>
        <button
          class="btn default"
          id="endfield-submit"
          type="submit"
          disabled={busy}
          data-loading={busy ? "true" : undefined}
          data-idle-label={terminal.idleLabel.value ?? undefined}
        >
          {terminal.submitText.value}
        </button>
      </form>
    </section>
  );
}

function handleOutputClick(terminal: Terminal, event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const clipButton = target.closest<HTMLButtonElement>("[data-clip-source]");
  if (clipButton) {
    event.preventDefault();
    void terminal.clipSource(clipButton);
    return;
  }
  const citation = target.closest<HTMLElement>("[data-endfield-citation]");
  if (citation?.dataset.endfieldCitation) {
    const evidence = document.querySelector<HTMLElement>(`#endfield-evidence-${citation.dataset.endfieldCitation}`);
    if (evidence) {
      (evidence as HTMLElement & { open?: boolean }).open = true;
      evidence.scrollIntoView({ behavior: "smooth", block: "nearest" });
      evidence.focus({ preventScroll: true });
      evidence.classList.remove("is-flash");
      void evidence.offsetWidth;
      evidence.classList.add("is-flash");
      setTimeout(() => evidence.classList.remove("is-flash"), 700);
    }
    return;
  }
  const question = target.closest<HTMLElement>("[data-query]");
  if (question?.dataset.query) {
    terminal.chooseQuery(question.dataset.query);
    return;
  }
  const retry = target.closest<HTMLElement>("[data-retry-query]");
  if (retry?.dataset.retryQuery !== undefined) terminal.chooseQuery(retry.dataset.retryQuery);
}
