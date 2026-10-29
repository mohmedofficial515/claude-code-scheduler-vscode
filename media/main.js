(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);

  // ---------- mode toggle ----------
  function currentMode() {
    const el = document.querySelector('input[name="mode"]:checked');
    return el ? el.value : "window";
  }
  function syncMode() {
    $("dtBox").classList.toggle("hidden", currentMode() !== "datetime");
  }
  document.querySelectorAll('input[name="mode"]').forEach((r) =>
    r.addEventListener("change", syncMode)
  );

  // ---------- repeat -> show N ----------
  $("repeat").addEventListener("change", () => {
    $("everyNBox").classList.toggle("hidden", $("repeat").value !== "everyNHours");
  });

  // ---------- buttons ----------
  $("saveStart").addEventListener("click", () => {
    vscode.postMessage({
      type: "saveStart",
      mode: currentMode(),
      runAt: $("runAt").value,
      repeat: $("repeat").value,
      everyNHours: $("everyN").value,
      task: $("task").value,
    });
  });
  $("stop").addEventListener("click", () => vscode.postMessage({ type: "stop" }));
  $("openTask").addEventListener("click", () => {
    vscode.postMessage({ type: "saveTask", task: $("task").value });
    vscode.postMessage({ type: "openTask" });
  });
  $("openNative").addEventListener("click", () => vscode.postMessage({ type: "openNative" }));
  $("refresh").addEventListener("click", () => vscode.postMessage({ type: "refresh" }));

  // ---------- countdown ----------
  let nextRunTs = null;
  setInterval(() => {
    const cd = $("countdown");
    if (!nextRunTs) { cd.textContent = "—"; return; }
    let diff = Math.floor((nextRunTs - Date.now()) / 1000);
    if (diff < 0) diff = 0;
    const dd = Math.floor(diff / 86400);
    const h = String(Math.floor((diff % 86400) / 3600)).padStart(2, "0");
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const s = String(diff % 60).padStart(2, "0");
    cd.textContent = (dd > 0 ? dd + "ي " : "") + `${h}:${m}:${s}`;
  }, 1000);

  // ---------- messages from extension ----------
  window.addEventListener("message", (ev) => {
    const m = ev.data;
    if (m.type === "init") {
      document.querySelectorAll('input[name="mode"]').forEach((r) => {
        r.checked = r.value === (m.mode || "window");
      });
      if (m.runAt) $("runAt").value = m.runAt;
      $("repeat").value = m.repeat || "none";
      $("everyN").value = m.everyNHours || 5;
      if (typeof m.task === "string") $("task").value = m.task;
      syncMode();
      $("everyNBox").classList.toggle("hidden", $("repeat").value !== "everyNHours");
    } else if (m.type === "status") {
      const badge = $("badge");
      badge.textContent = m.running ? "شغّال" : "متوقف";
      badge.className = "badge " + (m.running ? "on" : "off");
      $("curMode").textContent = m.mode === "datetime" ? "وقت وتاريخ محدد" : "عند تجديد الحصة";
      $("nextRun").textContent = m.nextRunText || "—";
      nextRunTs = m.nextRunMs || null;
      if (typeof m.log === "string") {
        const l = $("log");
        l.textContent = m.log;
        l.scrollTop = l.scrollHeight;
      }
    }
  });

  vscode.postMessage({ type: "ready" });
})();
