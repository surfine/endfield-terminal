# Endfield Terminal

A browser story-archive terminal for *Arknights: Endfield*: ask a plot
question, see numbered source lines, then a one-line verdict. A host page can
embed the same files in a frame.

## Run on its own

```bash
npm start
```

Then open `http://localhost:8080/terminal/`.

On its own page there is no desk. Every `endfield.*` service answers
`unavailable`, and the terminal shows its existing error card. Nothing else
changes.

## Real deployment

A host desk must offer these bridge services (capability `services`) and accept
`context.publish` (capability `context`):

| Service | Role |
| --- | --- |
| `endfield.search` | Empty params → archive meta for the header; with a body → corpus search |
| `endfield.ask` | `{ query, progress }` → the rendered answer object (`query`, `answer`, `results` cut to 14, `meta`, `ai_system6_metrics`, …) or `{ ok: false, reason }` |
| `endfield.answer` | Optional later use; this page does not call it |

The lore system prompt stays on the host. The framed page never reads a
provider, model route, credential, key, base URL or endpoint.

The host also needs:

- `intent.dispatch` with `clip` to File Floppy and `ask` to SideAsk
- desk-made `welcome.launch` / `launch.changed` with `{ evidence: n }` so a
  citation can open, scroll to and focus `#endfield-evidence-n`
- readers of `publishedContext("endfieldTerminal")` for SideAsk / ClioTalk
  grounding (`kind: "endfield"`, value `{ query, answer, results }`)

## Build

```bash
npm run build
```

Copies what a host page embeds into `dist/` (file for file with this tree).
There are no dependencies; Node is enough.

## Layout

| Path | What it is |
| --- | --- |
| `terminal/` | The page, the terminal module, its stylesheet, English and Chinese string tables |
| `shared/` | Base styles and the runtime that talks to the bridge |
| `assets/` | Background SVG and the Barlow Condensed Latin subset |
| `ais6-bridge.js`, `kit.css`, `app.manifest.json` | Let a host page embed the terminal in a frame, keep recent queries and draw its menus; on its own page the same calls fall back to local storage / unavailable services |
| `tools/build.mjs` | Copies the embed tree into `dist/` |

## Licence

Code is MIT. See [LICENSE](LICENSE). The theme and background are used with
permission and are **not** under MIT — see [LICENSES.md](LICENSES.md).

中文：[README.zh-CN.md](README.zh-CN.md).
