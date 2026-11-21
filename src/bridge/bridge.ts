// The app's one connection to its host, typed. Inside the desk the kit talks
// to the desk over a MessagePort; on the app's own page the kit's standalone
// adapter answers, and then every service is unavailable.

import { version as manifestVersion } from "../../public/app.manifest.json";
import type { Language } from "../strings/index.ts";
import type { BridgeClient, ClipItem, EndfieldContext, MenuState, SuspendCause } from "./types.ts";

/** The window's `app` in the manifest (not the group id): the desk checks the hello against it. */
export const APP_ID = "endfield";
export const WINDOW_NAME = "endfieldTerminal";
/** Read from the manifest, so the hello can never name another version than the one the desk pinned. */
export const APP_VERSION: string = manifestVersion;

/**
 * An answer from a local model takes longer than a desk lookup: the bridge's
 * default wait is 15 s, and a real local answer (search, evidence, then the
 * model) can run past it. Only the model-backed services opt into the longer
 * wait; a hung desk call elsewhere still fails fast.
 */
const MODEL_SERVICE_TIMEOUT_MS = 240_000;
const MODEL_SERVICES = new Set(["endfield.ask", "endfield.answer"]);

export type { BridgeClient } from "./types.ts";

/** Connects through the kit the page loaded before this module. */
export async function connect(): Promise<BridgeClient> {
  const kit = window.AIS6Bridge;
  if (!kit) throw new Error("ais6-bridge.js did not load");
  return kit.connect({ appId: APP_ID, window: WINDOW_NAME, version: APP_VERSION });
}

/** A named desk service: plain JSON on success, `{ ok: false, reason }` on a refusal or a failure. */
export async function service(
  client: BridgeClient,
  name: string,
  params: Record<string, unknown> = {},
  options: { requestId?: string; timeout?: number } = {},
): Promise<Record<string, unknown>> {
  if (client.standalone) return { ok: false, reason: "unavailable" };
  const request: { name: string; params: Record<string, unknown>; requestId?: string } = { name, params };
  if (options.requestId) request.requestId = String(options.requestId);
  const timeout = Number(options.timeout) || (MODEL_SERVICES.has(name) ? MODEL_SERVICE_TIMEOUT_MS : 0);
  try {
    return await client.call("service.request", request, timeout > 0 ? { timeout } : {});
  } catch (error) {
    const code = (error as { code?: string; message?: string })?.code ?? (error as Error)?.message ?? "unavailable";
    return { ok: false, reason: String(code) };
  }
}

/** Stops a question the desk is still running. */
export async function cancelService(client: BridgeClient, requestId: string): Promise<void> {
  if (!requestId) return;
  try {
    await client.call("service.cancel", { requestId: String(requestId) });
  } catch {
    // A cancelled or finished request is what was wanted.
  }
}

/** The last question and its numbered evidence, for SideAsk and ClioTalk. */
export async function publishContext(client: BridgeClient, value: EndfieldContext): Promise<boolean> {
  if (client.standalone) return false;
  try {
    await client.call("context.publish", { kind: "endfield", value });
    return true;
  } catch {
    return false;
  }
}

/** Clips one source to the writer's File Floppy, on the writer's own click. */
export async function clip(
  client: BridgeClient,
  items: readonly ClipItem[],
): Promise<{ ok: boolean; reason?: string }> {
  if (client.standalone) return { ok: false, reason: "standalone" };
  try {
    const answer = await client.call("intent.dispatch", { intent: "clip", appId: "fileFloppy", items });
    return { ok: answer?.ok === true, ...(answer?.reason ? { reason: String(answer.reason) } : {}) };
  } catch (error) {
    return { ok: false, reason: String((error as { code?: string })?.code ?? "failed") };
  }
}

/** Hands the terminal's question to SideAsk. */
export async function askAssistant(
  client: BridgeClient,
  source: { appId: string; query: string },
): Promise<{ ok: boolean; reason?: string }> {
  if (client.standalone) return { ok: false, reason: "standalone" };
  try {
    const answer = await client.call("intent.dispatch", { intent: "ask", appId: "sideAsk", source });
    return { ok: answer?.ok === true, ...(answer?.reason ? { reason: String(answer.reason) } : {}) };
  } catch (error) {
    return { ok: false, reason: String((error as { code?: string })?.code ?? "failed") };
  }
}

/** One key of the app's own state; null when it was never written. */
export async function readState(client: BridgeClient, key: string): Promise<unknown> {
  try {
    return (await client.call("state.get", { key })).value;
  } catch {
    return null;
  }
}

export async function writeState(client: BridgeClient, key: string, value: unknown): Promise<void> {
  try {
    await client.call("state.set", { key, value });
  } catch {
    // A failed write only loses the recent queries.
  }
}

export function pushMenuState(client: BridgeClient, state: MenuState): void {
  client.menuState(state);
}

export function onMenuCommand(client: BridgeClient, run: (action: string) => boolean | Promise<boolean>): void {
  client.handle("menu.command", async ({ action }) => ({ handled: await run(action) }));
}

export function onLifecycle(
  client: BridgeClient,
  handlers: { suspend: (cause: SuspendCause) => Promise<void>; resume: () => void; dispose: () => Promise<void> },
): void {
  client.handle("lifecycle.suspend", async ({ cause }) => {
    await handlers.suspend(cause ?? "away");
    return {};
  });
  client.handle("lifecycle.resume", () => {
    handlers.resume();
    return {};
  });
  client.handle("lifecycle.dispose", async () => {
    await handlers.dispose();
    return {};
  });
}

export function onLanguage(client: BridgeClient, listener: (language: Language) => void): () => void {
  return client.on("language.changed", ({ language }) => listener(language));
}

/** The desk's one-bit flag, which the stylesheet reads off the page root. */
export function applyOneBit(appearance: { oneBit?: boolean } | null | undefined): void {
  document.documentElement.dataset.oneBit = appearance?.oneBit ? "true" : "false";
}
