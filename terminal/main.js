// Endfield Terminal's page: start the runtime, draw the window, hand over.
(async function startEndfieldTerminal() {
  "use strict";
  await window.EndfieldRuntime.start({ appId: "endfield", window: "endfieldTerminal" });
  translateWithin(document);
  const terminal = window.EndfieldTerminal;
  window.EndfieldRuntime.lifecycle({});
  window.EndfieldRuntime.menu(terminal.menu());
  window.EndfieldRuntime.onLanguage(() => {
    translateWithin(document);
  });
  window.EndfieldRuntime.onLaunch((launch) => terminal.applyLaunch(launch));
  terminal.attach();
  window.EndfieldRuntime.snapshots(document.getElementById("app"));
  window.EndfieldRuntime.ready();
  // Desk-made launch (evidence jump) arrives on welcome the first time.
  terminal.applyLaunch(window.EndfieldRuntime.launch());
})();
