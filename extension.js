'use strict';

const vscode = require('vscode');
const codex = require('./lib/codex');
const office = require('./lib/office');
const patch = require('./lib/patch');
const payload = require('./lib/payload');
const preview = require('./lib/preview');
const { DEFAULTS } = require('./lib/settings');
const { statusLabel } = require('./lib/status');

const LEGACY_ID = 'yechielby.claude-code-rtl';
const LEGACY_NAME = 'Claude Code RTL Support';
// Remembers which Claude Code builds were already warned about, so a build
// that lacks the core anchors warns once instead of on every startup.
const UNANCHORED_KEY = 'rastin.unanchoredBuilds';

/** @type {vscode.OutputChannel | undefined} */
let output;
/** @type {vscode.StatusBarItem | undefined} */
let statusBar;
/** @type {vscode.Memento | undefined} */
let memento;
/** @type {Promise<unknown>} */
let queue = Promise.resolve();
let warnedLegacy = false;
/** @type {NodeJS.Timeout | undefined} */
let pendingSync;

// ── CONFIG ─────────────────────────────────────────────────────────────

function config() {
  const settings = vscode.workspace.getConfiguration('rastin');
  return Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, fallback]) => [
      key,
      settings.get(key, fallback),
    ]),
  );
}

function buildPayload() {
  return payload.build({ root: __dirname, ...config() });
}

// VS Code contributes the Markdown preview scripts statically, so the active
// settings reach them through a generated file. It is refreshed even when no
// Claude Code build is installed to patch.
async function writePreviewConfig(settings) {
  try {
    if (await preview.writeConfig({ root: __dirname, ...settings })) {
      log('markdown preview config updated');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`markdown preview config: ${message}`);
  }
}

// The Office Viewer is a separate install; patching it is independent of
// Claude Code, so a failure there must not fail the chat patch.
async function syncOffice(settings, version) {
  try {
    // The switch turns the editor back into the stock page: the marked block
    // and the generated files are removed, so nothing of Rastin is loaded.
    if (!settings.enabled || settings.officeViewer === false) {
      return await office.remove();
    }
    return await office.apply({ root: __dirname, version, ...settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`office viewer: ${message}`);
    return { targets: 0, changed: [], failed: [] };
  }
}

// Codex is another separate install. Its page cannot read VS Code settings
// either, so the same switch and direction reach it through a generated
// script of its own.
async function syncCodex(settings, version) {
  try {
    if (!settings.enabled || settings.codex === false) {
      return await codex.remove();
    }
    return await codex.apply({ root: __dirname, version, ...settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`codex: ${message}`);
    return { targets: 0, changed: [], failed: [] };
  }
}

// The editor patches are independent of Claude Code and of each other, so
// they run together and report under their own names.
async function syncEditors(settings, version) {
  const [officeResult, codexResult] = await Promise.all([
    syncOffice(settings, version),
    syncCodex(settings, version),
  ]);
  return [
    { name: 'office viewer', subject: 'Office Viewer', result: officeResult },
    { name: 'codex', subject: 'Codex', result: codexResult },
  ];
}

function editorTargets(editors) {
  return editors.reduce((total, { result }) => total + result.targets, 0);
}

function editorChanges(editors) {
  return editors.flatMap(({ result }) => result.changed);
}

function warnEditorFailures(editors, interactive) {
  for (const { subject, result } of editors) {
    warnFailed(result.failed, interactive, subject);
  }
}

// ── SYNC ───────────────────────────────────────────────────────────────

function sync(interactive) {
  queue = queue
    .then(() => runSync(interactive))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log(message);
      vscode.window.showErrorMessage(`Rastin: ${message}`);
    });
  return queue;
}

async function runSync(interactive) {
  const settings = config();
  const { enabled } = settings;
  await writePreviewConfig(settings);
  const version =
    vscode.extensions.getExtension('amir83nasr.claude-rastin')?.packageJSON
      .version ?? 'dev';

  // The editor patches are independent of Claude Code: they land in whichever
  // installs exist, and an update there is re-patched too.
  const editors = await syncEditors(settings, version);

  if (!enabled) {
    const undo = await patch.remove({ payload: buildPayload() });
    if (undo.targets > 0) log(`removed: ${describe(undo.changed)}`);
    for (const { name, result } of editors) {
      if (result.targets > 0) {
        log(`${name} removed: ${describe(result.changed)}`);
      }
    }
    warnFailed(undo.failed, interactive);
    warnEditorFailures(editors, interactive);
    if (undo.targets === 0 && editorTargets(editors) === 0) {
      notifyNoTarget();
      return;
    }
    const changed = [...undo.changed, ...editorChanges(editors)];
    if (interactive && changed.length > 0) await refreshWebviews();
    return;
  }

  const applied = await patch.apply({
    payload: buildPayload(),
    version,
  });
  if (applied.targets > 0) {
    log(`applied (${applied.targets}): ${describe(applied.changed)}`);
  }
  for (const { name, result } of editors) {
    if (result.targets > 0) {
      log(`${name} (${result.targets}): ${describe(result.changed)}`);
    }
  }
  if (applied.targets === 0 && editorTargets(editors) === 0) {
    notifyNoTarget();
    return;
  }
  warnFailed(applied.failed, interactive);
  warnEditorFailures(editors, interactive);
  warnUnanchored(applied.unanchored);
  const changed = [...applied.changed, ...editorChanges(editors)];
  if (interactive && changed.length > 0) await refreshWebviews();
}

function warnUnanchored(unanchored) {
  if (unanchored.length === 0) return;
  for (const { name, missing } of unanchored) {
    log(
      `${name}: core anchors missing (${missing.join(', ')}); RTL may not apply`,
    );
  }
  const warned = new Set(memento?.get(UNANCHORED_KEY, []));
  const fresh = unanchored.filter(({ name }) => !warned.has(name));
  if (fresh.length === 0) return;
  memento?.update(UNANCHORED_KEY, [
    ...warned,
    ...fresh.map(({ name }) => name),
  ]);
  vscode.window.showWarningMessage(
    `Rastin: ${fresh.map(({ name }) => name).join(', ')} changed its class names, so RTL may not apply. See the Rastin output channel.`,
  );
}

function warnFailed(failed, interactive, subject = 'Claude Code') {
  if (!failed || failed.length === 0) return;
  log(`failed: ${failed.join('; ')}`);
  if (!interactive) return;
  vscode.window.showWarningMessage(
    `Rastin: ${failed.length} ${subject} build(s) not patched. See the Rastin output channel.`,
  );
}

function describe(changed) {
  return changed.length === 0 ? 'no file changes' : changed.join(', ');
}

function notifyNoTarget() {
  vscode.window.showWarningMessage(
    'Rastin: no installed Claude Code, Codex, or Office Viewer VS Code extension found.',
  );
}

// The patched CSS/JS only reaches the chat once its webview reloads. VS
// Code's own "Reload Webviews" command does that in place, so settings apply
// without a window reload.
async function refreshWebviews() {
  try {
    await vscode.commands.executeCommand(
      'workbench.action.webview.reloadWebviewAction',
    );
  } catch {
    const choice = await vscode.window.showInformationMessage(
      'Rastin: reload the window to apply the change.',
      'Reload Window',
    );
    if (choice) {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }
}

function log(message) {
  if (!output) return;
  output.appendLine(`[${new Date().toISOString()}] ${message}`);
}

// ── STATUS BAR ─────────────────────────────────────────────────────────

function updateStatusBar() {
  if (!statusBar) return;
  const { text, tooltip } = statusLabel(config());
  statusBar.text = text;
  statusBar.tooltip = tooltip;
}

// ── COMMANDS ───────────────────────────────────────────────────────────

async function setEnabled(enabled) {
  await vscode.workspace
    .getConfiguration('rastin')
    .update('enabled', enabled, vscode.ConfigurationTarget.Global);
}

async function showMenu() {
  const { enabled } = config();
  /** @type {Array<vscode.QuickPickItem & {run: () => Promise<unknown>}>} */
  const items = [
    {
      label: '$(settings-gear) Font, size, spacing, theme',
      description: 'open settings',
      run: () =>
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:amir83nasr.claude-rastin',
        ),
    },
    {
      label: '$(wrench) Repair after Claude Code or Codex update',
      run: () => sync(true),
    },
    {
      label: enabled ? '$(circle-slash) Disable' : '$(check) Enable',
      run: () => setEnabled(!enabled),
    },
  ];

  const pick = await vscode.window.showQuickPick(items, {
    title: 'Rastin',
  });
  if (pick) await pick.run();
}

// ── LEGACY ─────────────────────────────────────────────────────────────

function warnLegacy() {
  if (warnedLegacy) return;
  const legacy = vscode.extensions.getExtension(LEGACY_ID);
  if (!legacy || !legacy.isActive) return;
  warnedLegacy = true;
  vscode.window
    .showWarningMessage(
      `Rastin: ${LEGACY_NAME} is still active and re-patches the same Claude Code files. Disable it to keep Rastin's layout.`,
      'Open Extensions',
    )
    .then((choice) => {
      if (choice) {
        vscode.commands.executeCommand('workbench.view.extensions');
      }
    });
}

// ── ACTIVATION ─────────────────────────────────────────────────────────

function activate(context) {
  output = vscode.window.createOutputChannel('Rastin');
  memento = context.globalState;
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.command = 'rastin.menu';
  statusBar.show();

  context.subscriptions.push(
    output,
    statusBar,
    vscode.commands.registerCommand('rastin.enable', () => setEnabled(true)),
    vscode.commands.registerCommand('rastin.disable', () => setEnabled(false)),
    vscode.commands.registerCommand('rastin.repair', () => sync(true)),
    vscode.commands.registerCommand('rastin.menu', showMenu),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('rastin')) return;
      updateStatusBar();
      // A number setting fires per keystroke; collapse the burst so the
      // webview reloads once.
      clearTimeout(pendingSync);
      pendingSync = setTimeout(() => sync(true), 250);
    }),
    // Installing or updating an extension can add a Claude Code build the
    // patch has not seen. Re-running sync patches it without a manual repair.
    vscode.extensions.onDidChange(() => sync(false)),
  );

  updateStatusBar();
  warnLegacy();
  sync(false);

  // A legacy RTL extension can re-patch on the same startup tick. Re-run
  // once after the dust settles; the patch is idempotent and a no-op when
  // the files already match.
  const settle = setTimeout(() => sync(false), 3000);
  context.subscriptions.push({
    dispose: () => {
      clearTimeout(settle);
      clearTimeout(pendingSync);
    },
  });
}

function deactivate() {
  statusBar?.dispose();
  output?.dispose();
}

module.exports = { activate, deactivate };
