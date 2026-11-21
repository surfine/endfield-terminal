import { render } from "preact";
import { Terminal } from "./app/terminal.ts";
import { applyOneBit, connect, onLanguage, onLifecycle } from "./bridge/bridge.ts";
import { App } from "./ui/App.tsx";
import "./styles/base.css";
import "./styles/endfield-terminal.css";

// Endfield Terminal's page: connect to the host, read the questions kept, draw
// the window, then hand the page over. The archive's own services answer only
// inside a desk; on its own page the terminal says the archive is unavailable.
async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;
  const client = await connect();
  const terminal = new Terminal(client);
  terminal.setLanguage(client.welcome.language);
  applyOneBit(client.welcome.appearance);
  await terminal.start();

  onLifecycle(client, {
    suspend: async () => {},
    resume: () => {},
    dispose: async () => {},
  });
  onLanguage(client, (language) => terminal.setLanguage(language));
  client.on("appearance.changed", (appearance) => applyOneBit(appearance));
  client.on("launch.changed", ({ launch }) => terminal.applyLaunch(launch));

  render(<App terminal={terminal} />, root);
  terminal.attachToHost();
  terminal.renderTerminal();
  client.ready();
  // A desk-made launch (an evidence jump) arrives on the welcome the first time.
  terminal.applyLaunch(client.welcome.launch);
}

void main();
