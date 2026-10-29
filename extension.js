"use strict";
const vscode = require("vscode");
const cp = require("child_process");
const fs = require("fs");
const path = require("path");

// ============================================================
//  Scheduler controller (wraps the PowerShell watcher + config)
// ============================================================
class Scheduler {
  dir() {
    return vscode.workspace.getConfiguration("claudeCompanion").get("schedulerDir");
  }
  script(name) { return path.join(this.dir(), name); }
  configPath() { return path.join(this.dir(), "config.json"); }
  pidPath() { return path.join(this.dir(), "watcher.pid"); }

  readConfig() {
    try { return JSON.parse(fs.readFileSync(this.configPath(), "utf8")); }
    catch (_) { return {}; }
  }
  writeConfig(cfg) {
    fs.writeFileSync(this.configPath(), JSON.stringify(cfg, null, 2) + "\n", "utf8");
  }

  taskPath() {
    const cfg = this.readConfig();
    let t = cfg.taskFile || "task.md";
    if (!path.isAbsolute(t)) t = path.join(this.dir(), t);
    return t;
  }
  readTask() { try { return fs.readFileSync(this.taskPath(), "utf8"); } catch (_) { return ""; } }
  writeTask(text) { fs.writeFileSync(this.taskPath(), text, "utf8"); }

  runPs(name) {
    const s = this.script(name);
    if (!fs.existsSync(s)) {
      vscode.window.showErrorMessage("لم أجد السكربت: " + s);
      return false;
    }
    cp.spawn("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", s,
    ], { cwd: this.dir(), windowsHide: true, detached: true });
    return true;
  }

  start() { return this.runPs("start-watcher.ps1"); }

  // immediate stop: kill by PID (no 30s wait) and clean flags
  stop() {
    let pid;
    try { pid = parseInt(fs.readFileSync(this.pidPath(), "utf8").trim(), 10); } catch (_) { pid = 0; }
    if (pid) { try { process.kill(pid); } catch (_) {} }
    try { fs.unlinkSync(this.pidPath()); } catch (_) {}
    try { fs.unlinkSync(path.join(this.dir(), "stop.flag")); } catch (_) {}
  }

  isRunning() {
    let pid;
    try { pid = parseInt(fs.readFileSync(this.pidPath(), "utf8").trim(), 10); }
    catch (_) { return false; }
    if (!pid) return false;
    try { process.kill(pid, 0); return true; }
    catch (e) {
      if (e.code === "EPERM") return true;
      try { fs.unlinkSync(this.pidPath()); } catch (_) {}
      return false;
    }
  }

  status() {
    const dir = this.dir();
    const cfg = this.readConfig();
    let taskFile = cfg.taskFile || "task.md";
    if (!path.isAbsolute(taskFile)) taskFile = path.join(dir, taskFile);

    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const logPath = path.join(dir, "logs", `watcher-${stamp}.log`);
    let log = "";
    let nextRunMs = null;
    let nextRunText = "—";
    try {
      const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
      log = lines.slice(-40).join("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const mt = lines[i].match(/Next run scheduled at (\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
        if (mt) {
          nextRunMs = new Date(+mt[1], +mt[2] - 1, +mt[3], +mt[4], +mt[5], +mt[6]).getTime();
          nextRunText = `${mt[1]}-${mt[2]}-${mt[3]} ${mt[4]}:${mt[5]}`;
          break;
        }
      }
    } catch (_) { log = "لا يوجد سجل لليوم بعد."; }

    return {
      type: "status",
      running: this.isRunning(),
      taskFile,
      mode: cfg.mode || "window",
      window: `${cfg.windowHours || "?"}h + ${cfg.bufferMinutes || 0}m`,
      nextRunMs,
      nextRunText,
      log,
    };
  }
}

// ============================================================
//  Scheduler webview panel (opens beside the Claude window)
// ============================================================
class SchedulerPanel {
  constructor(context, scheduler) {
    this.context = context;
    this.scheduler = scheduler;
    this.panel = null;
    this.timer = null;
  }

  show() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      "claudeCompanionScheduler",
      "جدولة كلود",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, "media"))],
      }
    );
    this.panel.iconPath = vscode.Uri.file(path.join(this.context.extensionPath, "media", "icon.svg"));
    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m));
    this.panel.onDidDispose(() => {
      this.panel = null;
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    });
    this.timer = setInterval(() => this.pushStatus(), 5000);
  }

  pushStatus() {
    if (this.panel) this.panel.webview.postMessage(this.scheduler.status());
  }

  sendInit() {
    if (!this.panel) return;
    const cfg = this.scheduler.readConfig();
    const sch = cfg.schedule || {};
    this.panel.webview.postMessage({
      type: "init",
      mode: cfg.mode || "window",
      runAt: sch.runAt || "",
      repeat: sch.repeat || "none",
      everyNHours: sch.everyNHours || 5,
      task: this.scheduler.readTask(),
    });
  }

  onMessage(m) {
    switch (m.type) {
      case "ready":
        this.sendInit();
        this.pushStatus();
        break;
      case "saveStart":
        this.saveAndStart(m);
        break;
      case "stop":
        this.scheduler.stop();
        setTimeout(() => this.pushStatus(), 800);
        break;
      case "saveTask":
        try {
          this.scheduler.writeTask(m.task || "");
          vscode.window.showInformationMessage("تم حفظ المهمة.");
        } catch (e) {
          vscode.window.showErrorMessage("تعذّر حفظ المهمة: " + e.message);
        }
        break;
      case "openTask":
        vscode.workspace.openTextDocument(this.scheduler.taskPath()).then(
          (doc) => vscode.window.showTextDocument(doc, vscode.ViewColumn.Active),
          () => vscode.window.showErrorMessage("لم أجد ملف المهمة.")
        );
        break;
      case "openNative":
        this.openNative();
        break;
      case "refresh":
        this.pushStatus();
        break;
    }
  }

  saveAndStart(m) {
    try {
      const cfg = this.scheduler.readConfig();
      cfg.mode = m.mode === "datetime" ? "datetime" : "window";
      cfg.schedule = {
        runAt: m.runAt || "",
        repeat: m.repeat || "none",
        everyNHours: parseInt(m.everyNHours, 10) || 5,
      };
      this.scheduler.writeConfig(cfg);
      if (typeof m.task === "string") this.scheduler.writeTask(m.task);

      if (cfg.mode === "datetime" && !cfg.schedule.runAt) {
        vscode.window.showWarningMessage("اختر التاريخ والوقت أولاً.");
        return;
      }

      // restart the watcher so new settings take effect immediately
      this.scheduler.stop();
      setTimeout(() => {
        this.scheduler.start();
        setTimeout(() => this.pushStatus(), 2500);
      }, 700);
      vscode.window.showInformationMessage("تم حفظ الجدولة وتشغيل المجدول.");
    } catch (e) {
      vscode.window.showErrorMessage("خطأ: " + e.message);
    }
  }

  openNative() {
    const candidates = [
      "claude-vscode.editor.open",
      "claude-vscode.sidebar.open",
      "claude-vscode.editor.openLast",
    ];
    const tryNext = (i) => {
      if (i >= candidates.length) return;
      vscode.commands.executeCommand(candidates[i]).then(() => {}, () => tryNext(i + 1));
    };
    tryNext(0);
  }

  getHtml(webview) {
    const nonce = getNonce();
    const cssUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, "media", "main.css"))
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, "media", "main.js"))
    );
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource}`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${cssUri}">
<title>جدولة كلود</title>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h3>حالة المجدول <span id="badge" class="badge off">…</span></h3>
      <div class="kv"><span>النمط الحالي</span><span class="v" id="curMode">—</span></div>
      <div class="kv"><span>التشغيل القادم</span><span class="v" id="nextRun">—</span></div>
      <div style="text-align:center;margin:8px 0">
        <div class="muted">الوقت المتبقي</div>
        <div id="countdown">—</div>
      </div>
    </div>

    <div class="card">
      <h3>نوع الجدولة</h3>
      <label class="radio"><input type="radio" name="mode" value="window" checked> عند تجديد الحصة (كل 5 ساعات)</label>
      <label class="radio"><input type="radio" name="mode" value="datetime"> وقت وتاريخ محدد</label>

      <div id="dtBox" class="hidden">
        <div class="field">
          <label for="runAt">التاريخ والوقت</label>
          <input type="datetime-local" id="runAt">
        </div>
        <div class="field">
          <label for="repeat">التكرار</label>
          <select id="repeat">
            <option value="none">مرة واحدة</option>
            <option value="hourly">كل ساعة</option>
            <option value="daily">يومياً</option>
            <option value="weekly">أسبوعياً</option>
            <option value="everyNHours">كل N ساعة</option>
          </select>
        </div>
        <div class="field hidden" id="everyNBox">
          <label for="everyN">كل كام ساعة (N)</label>
          <input type="number" id="everyN" min="1" value="5">
        </div>
      </div>
    </div>

    <div class="card">
      <h3>المهمة</h3>
      <textarea id="task" rows="5" placeholder="اكتب المهمة اللي كلود هينفّذها…"></textarea>
      <div class="muted">بتتحفظ في task.md وتتقري قبل كل تشغيل.</div>
    </div>

    <div class="toolbar">
      <button id="saveStart" class="btn">حفظ وتشغيل</button>
      <button id="stop" class="btn secondary">إيقاف</button>
      <button id="openTask" class="btn secondary">فتح المهمة في محرر</button>
      <button id="openNative" class="btn secondary">فتح شات كلود</button>
      <button id="refresh" class="btn secondary">تحديث</button>
    </div>

    <div class="card">
      <h3>السجل</h3>
      <div id="log">…</div>
    </div>
  </div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

// ============================================================
//  Activation
// ============================================================
function activate(context) {
  const scheduler = new Scheduler();
  const panel = new SchedulerPanel(context, scheduler);

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeCompanion.openScheduler", () => panel.show())
  );

  // always-visible entry point in the status bar
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.text = "$(clock) جدولة كلود";
  item.tooltip = "فتح لوحة جدولة مهام كلود";
  item.command = "claudeCompanion.openScheduler";
  item.show();
  context.subscriptions.push(item);
}

function deactivate() {}

module.exports = { activate, deactivate };
