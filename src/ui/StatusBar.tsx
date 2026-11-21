import { useEffect, useRef } from "preact/hooks";
import type { Terminal } from "../app/terminal.ts";

/**
 * The desk's status line for this window: the datasets' version stamps, the
 * archive's route and line count, and the reader's own progress. The stamps,
 * the route and the count are baked when the archive answers, as they always
 * were; the progress control is built once and keeps its language.
 */
export function StatusBar({ terminal }: { terminal: Terminal }) {
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    // The control is the only writer of its own value: set it once.
    if (select.current) select.current.value = terminal.progress.value;
  }, [terminal]);
  const options = terminal.progressOptions.value;
  return (
    <div class="details-bar kit-status-bar endfield-status-bar">
      <span class="endfield-stamps" dangerouslySetInnerHTML={{ __html: terminal.stamps.value.join("") }} />
      <span id="endfield-terminal-route" title={terminal.hasMeta.value ? terminal.routeTitle.value : undefined}>
        {terminal.routeText.value}
      </span>
      <span id="endfield-terminal-count">{terminal.countText.value}</span>
      <span class="endfield-progress">
        <span>{terminal.progressLabelText.value}</span>
        <span class="select-wrap select-wrap-inline">
          <select
            ref={select}
            id="endfield-progress"
            aria-label={terminal.progressLabelText.value}
            data-progress-order="prologue,chapter1,chapter2,v1_5,all"
            onChange={(event) => terminal.chooseProgress(event.currentTarget.value)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
      </span>
    </div>
  );
}
