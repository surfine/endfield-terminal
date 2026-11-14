// Endfield Terminal's runtime: the one place the app meets its host.
//
// In a desk the page is a same-origin frame and every desk service is a
// bridge call; on its own the same calls are answered by the bridge's
// standalone adapter (services answer unavailable). The terminal module
// calls plain helpers defined here so it does not know which of the two
// it is running in.
(function installEndfieldRuntime(root) {
  "use strict";

  const VERSION = "1.0.0";
  const strings = () => root.EndfieldStrings || { en: {}, zh: {} };
  let bridge = null;
  let welcome = null;
  let started = null;
  const cache = new Map();
  const languageListeners = [];
  const launchListeners = [];
  let lifecycleHandlers = {};
  let menu = null;
  let menuSignature = "";
  let menuTimer = 0;

  root.currentLanguage = "zh";

  function t(key, ...args) {
    const tables = strings();
    const table = tables[root.currentLanguage] || tables.zh || {};
    const value = table[key] ?? tables.en?.[key] ?? key;
    return typeof value === "function" ? value(...args) : value;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function html(parts, ...values) {
    let out = "";
    parts.forEach((part, index) => {
      out += part;
      if (index < values.length) out += htmlValue(values[index]);
    });
    return out;
  }
  function htmlValue(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(htmlValue).join("");
    if (value && typeof value === "object" && typeof value.safeHtml === "string") return value.safeHtml;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return escapeHtml(value);
  }
  html.raw = (markup) => Array.isArray(markup)
    ? { safeHtml: markup.map((part) => String(part ?? "")).join("") }
    : { safeHtml: String(markup ?? "") };

  function translateWithin(scope) {
    if (!scope || typeof scope.querySelectorAll !== "function") return;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      const value = t(el.dataset.i18n);
      if (String(value).includes("<")) el.innerHTML = value;
      else el.textContent = value;
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    scope.querySelectorAll("[data-i18n-aria-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)); });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  }

  function setLanguage(language) {
    root.currentLanguage = language === "en" ? "en" : "zh";
    if (root.document?.documentElement) {
      root.document.documentElement.lang = root.currentLanguage === "zh" ? "zh-Hans" : "en";
    }
  }

  function setStatus(text) {
    const line = String(text ?? "");
    if (bridge && line) bridge.status({ text: line });
  }

  function createWindow(options = {}) {
    const doc = root.document;
    const windowName = String(options.windowName || "");
    const existing = doc.querySelector(`[data-window="${windowName}"]`);
    if (existing) return existing;
    const win = doc.createElement("section");
    win.className = ["window", options.windowClass].filter(Boolean).join(" ");
    win.dataset.window = windowName;
    if (options.labelledBy) win.setAttribute("aria-labelledby", options.labelledBy);
    if (options.statusClass || options.statusHtml) {
      const bar = doc.createElement("div");
      bar.className = ["details-bar", "kit-status-bar", options.statusClass].filter(Boolean).join(" ");
      bar.innerHTML = String(options.statusHtml || "");
      win.append(bar);
      win.applicationStatusBar = bar;
    }
    if (options.beforePaneHtml) {
      const slot = doc.createElement("div");
      slot.innerHTML = String(options.beforePaneHtml);
      while (slot.firstChild) win.append(slot.firstChild);
    }
    const pane = doc.createElement("div");
    pane.className = ["window-pane", options.paneClass].filter(Boolean).join(" ");
    pane.innerHTML = String(options.paneHtml || "");
    win.append(pane);
    win.applicationPane = pane;
    (doc.getElementById("app") || doc.body).append(win);
    translateWithin(win);
    if (options.title) setTitle(options.title);
    return win;
  }

  function setTitle(text) {
    if (bridge) bridge.setTitle(String(text || ""));
    else if (root.document) root.document.title = String(text || "");
  }

  function resources() {
    const offs = [];
    const set = {
      disposed: false,
      listen(target, type, fn, options) {
        target?.addEventListener?.(type, fn, options);
        offs.push(() => target?.removeEventListener?.(type, fn, options));
      },
      add(fn) {
        if (typeof fn === "function") offs.push(fn);
      },
      dispose() {
        offs.splice(0).forEach((off) => { try { off(); } catch { /* gone */ } });
        set.disposed = true;
      },
    };
    return set;
  }

  const stateGet = (key) => (cache.has(key) ? cache.get(key) : null);

  function stateSet(key, value) {
    cache.set(key, value);
    if (!bridge) return Promise.resolve(false);
    return bridge.call("state.set", { key, value }).then(() => true, () => false);
  }

  async function loadState() {
    const answer = await bridge.call("state.keys", {});
    const keys = (answer?.keys || []).filter((key) => key !== "_import");
    await Promise.all(keys.map((key) => bridge.call("state.get", { key }).then((got) => cache.set(key, got ? got.value : null))));
  }

  // Desk service: plain JSON result, or { ok:false, reason } / bridge error.
  // options.requestId names the call so cancelService can stop it on the desk.
  function service(name, params, options = {}) {
    if (!bridge) return Promise.resolve({ ok: false, reason: "unavailable" });
    const request = { name, params: params || {} };
    if (options.requestId) request.requestId = String(options.requestId);
    return bridge.call("service.request", request)
      .then((result) => result)
      .catch((error) => ({ ok: false, reason: error?.code || error?.message || "unavailable" }));
  }

  function cancelService(requestId) {
    if (!bridge || !requestId) return Promise.resolve({ cancelled: false });
    return bridge.call("service.cancel", { requestId: String(requestId) })
      .catch(() => ({ cancelled: false }));
  }

  function publishContext(value) {
    if (!bridge || bridge.standalone) return Promise.resolve({ ok: false, reason: "standalone" });
    return bridge.call("context.publish", { kind: "endfield", value: value || { query: "", answer: "", results: [] } })
      .then(() => ({ ok: true }), (error) => ({ ok: false, reason: error?.code || "failed" }));
  }

  function clip(items) {
    if (!bridge || bridge.standalone) return Promise.resolve({ ok: false, reason: "standalone" });
    return bridge.call("intent.dispatch", { intent: "clip", appId: "fileFloppy", items: items || [] })
      .then((answer) => answer || { ok: false, reason: "failed" }, (error) => ({ ok: false, reason: error?.code || "failed" }));
  }

  function askAssistant(source) {
    if (!bridge || bridge.standalone) return Promise.resolve({ ok: false, reason: "standalone" });
    return bridge.call("intent.dispatch", { intent: "ask", appId: "sideAsk", source: source || {} })
      .then((answer) => ({ ok: answer?.ok === true, reason: String(answer?.reason || "") }), (error) => ({ ok: false, reason: error?.code || "failed" }));
  }

  function pushMenuState() {
    menuTimer = 0;
    if (!bridge || !menu) return;
    const available = {};
    const checked = {};
    const reasons = {};
    menu.commands().forEach((action) => {
      const answer = menu.availability(action) || {};
      available[action] = answer.available === true;
      if (!available[action] && answer.reason) reasons[action] = String(answer.reason);
      if (menu.checked) checked[action] = menu.checked(action) === true;
    });
    const signature = JSON.stringify([available, checked, reasons]);
    if (signature === menuSignature) return;
    menuSignature = signature;
    bridge.menuState({ available, checked, reasons });
  }
  function scheduleMenuState() {
    if (menuTimer) return;
    menuTimer = setTimeout(pushMenuState, 30);
  }

  function setMenu(definition) {
    menu = definition;
    if (typeof MutationObserver === "function" && root.document?.body) {
      new MutationObserver(scheduleMenuState).observe(root.document.body, { attributes: true, childList: true, subtree: true, characterData: true });
    }
    scheduleMenuState();
  }

  function deliverLaunch(launch) {
    launchListeners.forEach((fn) => {
      try { fn(launch); } catch (error) { console.error(error); }
    });
  }

  function start(options = {}) {
    if (started) return started;
    started = (async () => {
      try {
        bridge = await root.AIS6Bridge.connect({ appId: options.appId, window: options.window, version: options.version || VERSION });
      } catch (error) {
        bridge = null;
      }
      welcome = bridge?.welcome || null;
      setLanguage(welcome?.language || (new URLSearchParams(root.location?.search || "").get("lang") === "en" ? "en" : "zh"));
      if (welcome?.appearance) {
        const htmlEl = root.document?.documentElement;
        if (htmlEl) htmlEl.dataset.oneBit = welcome.appearance.oneBit ? "true" : "false";
      }
      if (bridge) {
        try { await loadState(); } catch { /* nothing saved */ }
      }
      if (bridge) {
        bridge.on("language.changed", ({ language }) => {
          setLanguage(language);
          translateWithin(root.document);
          languageListeners.forEach((fn) => { try { fn(root.currentLanguage); } catch (error) { console.error(error); } });
        });
        bridge.on("appearance.changed", (appearance) => {
          const htmlEl = root.document?.documentElement;
          if (htmlEl && appearance) htmlEl.dataset.oneBit = appearance.oneBit ? "true" : "false";
        });
        bridge.on("launch.changed", ({ launch }) => deliverLaunch(launch));
        const lifecycle = (name) => async () => {
          try { await lifecycleHandlers[name]?.(); } catch (error) { console.error(error); }
          return {};
        };
        bridge.handle("lifecycle.suspend", lifecycle("onSuspend"));
        bridge.handle("lifecycle.resume", lifecycle("onResume"));
        bridge.handle("lifecycle.dispose", lifecycle("onDispose"));
        bridge.handle("menu.command", async ({ action }) => {
          if (!menu || !menu.commands().includes(action)) return { handled: false };
          await menu.run(action);
          scheduleMenuState();
          return { handled: true };
        });
      }
      return welcome;
    })();
    return started;
  }

  function ready() {
    if (bridge) bridge.ready();
  }

  function snapshots(target) {
    if (bridge && !bridge.standalone && (welcome?.capabilities || []).includes("snapshot")) {
      bridge.enableSnapshots({ producer: "dom", target: target || root.document?.body || null });
    }
  }

  root.t = t;
  root.html = html;
  root.escapeHtml = escapeHtml;
  root.translateWithin = translateWithin;
  root.setStatus = setStatus;

  root.EndfieldRuntime = Object.freeze({
    start,
    ready,
    snapshots,
    welcome: () => welcome,
    hosted: () => Boolean(bridge && !bridge.standalone),
    version: () => welcome?.version || "dev",
    launch: () => welcome?.launch || null,
    phone: () => Number(welcome?.phone) || 0,
    createWindow,
    setTitle,
    resources,
    state: Object.freeze({ get: stateGet, set: stateSet }),
    service,
    cancelService,
    publishContext,
    clip,
    askAssistant,
    onLaunch: (fn) => { if (typeof fn === "function") launchListeners.push(fn); },
    onLanguage: (fn) => { languageListeners.push(fn); },
    lifecycle: (handlers) => { lifecycleHandlers = handlers || {}; },
    menu: setMenu,
    refreshMenu: scheduleMenuState,
  });
})(typeof window !== "undefined" ? window : globalThis);
