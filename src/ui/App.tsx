import type { Terminal } from "../app/terminal.ts";
import { MainPane } from "./MainPane.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { StatusBar } from "./StatusBar.tsx";

/**
 * The window the page draws below the desk's title bar: the status line, the
 * sidebar and the terminal itself.
 */
export function App({ terminal }: { terminal: Terminal }) {
  return (
    <section
      class="window endfield-terminal-window"
      data-window="endfieldTerminal"
      aria-labelledby="endfield-terminal-title"
    >
      <StatusBar terminal={terminal} />
      <div class="window-pane endfield-terminal-pane">
        <Sidebar terminal={terminal} />
        <MainPane terminal={terminal} />
      </div>
    </section>
  );
}
