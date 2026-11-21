// The part of bridge contract v1 this app uses. The kit (ais6-bridge.js) is a
// classic script that installs `window.AIS6Bridge`; these types describe it.
// The terminal asks named desk services, cancels a superseded question,
// publishes its last answer as context, clips a source to the File Floppy,
// hands a question to SideAsk and keeps its recent queries in state.

import type { Language } from "../strings/index.ts";

export type ColorMode = "light" | "dark";

export interface Appearance {
  readonly id: string;
  readonly colorMode: ColorMode;
  readonly oneBit?: boolean;
  readonly touch: boolean;
  readonly reducedMotion: boolean;
  readonly tokens: Readonly<Record<string, string>>;
  readonly kitUrl: string;
}

/** The `welcome` the host answers with; `standalone` is the kit's own adapter. */
export interface Welcome {
  readonly protocol: number;
  readonly appId: string;
  readonly window: string;
  readonly version: string;
  readonly language: Language;
  readonly appearance: Appearance;
  readonly capabilities: readonly string[];
  readonly readOnly: boolean;
  readonly profile?: string;
  readonly phone?: number;
  /** A desk-made launch (an evidence jump). */
  readonly launch?: unknown;
  readonly standalone?: boolean;
}

export interface MenuState {
  readonly available: Readonly<Record<string, boolean>>;
  readonly checked: Readonly<Record<string, boolean>>;
  readonly reasons?: Readonly<Record<string, string>>;
}

export interface MenuCommand {
  readonly action: string;
  readonly arg?: unknown;
}

export type SuspendCause = "close" | "away";

/** What the terminal publishes for ClioTalk/SideAsk: the last answer, numbered. */
export interface EndfieldContextItem {
  readonly n: number;
  readonly missionId: string;
  readonly missionTitle: string;
  readonly section: string;
  readonly chapter: string;
  readonly process: string;
  readonly speaker: string;
  readonly text: string;
  readonly url: string;
}

export interface EndfieldContext {
  readonly query: string;
  readonly answer: string;
  readonly results: readonly EndfieldContextItem[];
}

/** A source clipped to the writer's File Floppy, on the writer's own click. */
export interface ClipItem {
  readonly kind: "text";
  readonly name: string;
  readonly type: string;
  readonly blob: Blob;
}

/** The request methods this app calls, with their params and results. */
export interface BridgeCalls {
  "state.get": { params: { key: string }; result: { value: unknown } };
  "state.set": { params: { key: string; value: unknown }; result: Record<string, never> };
  /** A named desk service; `requestId` lets a superseded question be cancelled. */
  "service.request": {
    params: { name: string; params: Record<string, unknown>; requestId?: string };
    result: Record<string, unknown>;
  };
  "service.cancel": { params: { requestId: string }; result: { cancelled: boolean } };
  "context.publish": { params: { kind: "endfield"; value: EndfieldContext }; result: { ok?: boolean } };
  "intent.dispatch": {
    params:
      | { intent: "clip"; appId: "fileFloppy"; items: readonly ClipItem[] }
      | { intent: "ask"; appId: "sideAsk"; source: { appId: string; query: string } };
    result: { ok?: boolean; reason?: string };
  };
}

/** The requests the desk sends this app, and what the app answers. */
export interface BridgeHandlers {
  "menu.command": { params: MenuCommand; result: { handled: boolean } };
  "lifecycle.suspend": { params: { cause?: SuspendCause }; result: Record<string, never> };
  "lifecycle.resume": { params: Record<string, never>; result: Record<string, never> };
  "lifecycle.dispose": { params: Record<string, never>; result: Record<string, never> };
}

/** The events the desk sends this app. */
export interface BridgeEvents {
  "language.changed": { language: Language };
  "appearance.changed": Appearance;
  /** A `window.open` launch for a window that was already open. */
  "launch.changed": { launch: unknown };
}

/** A call that may take longer than the bridge's 15 s (a model-backed answer). */
export interface CallOptions {
  readonly timeout?: number;
}

/** The client object `AIS6Bridge.connect()` resolves to (hosted or standalone). */
export interface BridgeClient {
  readonly standalone: boolean;
  readonly welcome: Welcome;
  call<M extends keyof BridgeCalls>(
    method: M,
    params: BridgeCalls[M]["params"],
    options?: CallOptions,
  ): Promise<BridgeCalls[M]["result"]>;
  on<E extends keyof BridgeEvents>(method: E, listener: (params: BridgeEvents[E]) => void): () => void;
  handle<M extends keyof BridgeHandlers>(
    method: M,
    handler: (
      params: BridgeHandlers[M]["params"],
    ) => BridgeHandlers[M]["result"] | Promise<BridgeHandlers[M]["result"]>,
  ): void;
  ready(): boolean;
  status(params: { key?: string; text?: string; host?: string }): boolean;
  menuState(state: MenuState): boolean;
  setTitle(title: string): boolean;
  enableSnapshots(config: { producer: "canvas" | "dom"; target?: Element | null }): BridgeClient;
  snapshotNow(): Promise<boolean>;
}

export interface ConnectOptions {
  readonly appId: string;
  readonly window: string;
  readonly version: string;
}

/** `window.AIS6Bridge`, installed by ais6-bridge.js. */
export interface Ais6Bridge {
  readonly protocol: number;
  connect(options: ConnectOptions): Promise<BridgeClient>;
}

declare global {
  interface Window {
    AIS6Bridge?: Ais6Bridge;
  }
}
